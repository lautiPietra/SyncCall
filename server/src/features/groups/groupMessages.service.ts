import { Types, type FilterQuery } from 'mongoose';
import type {
  GroupMessage as GroupMessageShape,
  GroupMessageSenderInfo,
  GroupMessagesPageResponse,
  GroupMessageType,
  GroupSystemEvent,
} from '@synccall/shared';
import { Channel } from './groups.model';
import { assertGroupAndMembership } from './groups.service';
import { GroupChannelRead } from './groupChannelRead.model';
import { GroupMessage } from './groupMessages.model';
import type { GroupMessageDocument } from './groupMessages.types';
import { User } from '../users/users.model';
import { ApiError } from '../../lib/ApiError';
import { decryptText, encryptText } from '../../lib/crypto';
import { sanitizeMessageContent } from '../../lib/sanitize';

const SENDER_INFO_FIELDS = 'displayName avatarUrl avatarFrame';
const UNKNOWN_SENDER_INFO: GroupMessageSenderInfo = { displayName: 'Usuario', avatarUrl: '', avatarFrame: 'none' };

function decryptGroupMessage(
  doc: {
    _id: { toString(): string };
    channel: { toString(): string };
    group: { toString(): string };
    sender: { toString(): string };
    type: GroupMessageType;
    systemEvent?: GroupSystemEvent;
    ciphertext: string;
    iv: string;
    authTag: string;
    mediaUrl?: string;
    durationSec?: number;
    createdAt: Date;
    editedAt?: Date;
    deleted: boolean;
  },
  senderInfo: GroupMessageSenderInfo,
): GroupMessageShape {
  return {
    id: doc._id.toString(),
    channel: doc.channel.toString(),
    group: doc.group.toString(),
    sender: doc.sender.toString(),
    senderInfo,
    type: doc.type,
    systemEvent: doc.systemEvent,
    content: decryptText({ ciphertext: doc.ciphertext, iv: doc.iv, authTag: doc.authTag }),
    mediaUrl: doc.mediaUrl,
    durationSec: doc.durationSec,
    createdAt: doc.createdAt.toISOString(),
    editedAt: doc.editedAt?.toISOString(),
    deleted: doc.deleted ?? false,
  };
}

/**
 * Resuelve nombre/foto del remitente al momento de leer el mensaje (no al enviarlo), así el
 * historial sigue mostrando a la persona real aunque ya haya salido del grupo. Si la cuenta
 * fue borrada, cae al placeholder en vez de romper la carga del canal.
 */
async function resolveSenderInfo(senderId: string): Promise<GroupMessageSenderInfo> {
  const user = await User.findById(senderId).select(SENDER_INFO_FIELDS).lean();
  if (!user) {
    return UNKNOWN_SENDER_INFO;
  }
  return { displayName: user.displayName, avatarUrl: user.avatarUrl, avatarFrame: user.avatarFrame };
}

async function resolveSenderInfoMap(senderIds: string[]): Promise<Map<string, GroupMessageSenderInfo>> {
  const uniqueIds = [...new Set(senderIds)];
  const users = await User.find({ _id: { $in: uniqueIds } }).select(SENDER_INFO_FIELDS).lean();
  return new Map(
    users.map((u) => [u._id.toString(), { displayName: u.displayName, avatarUrl: u.avatarUrl, avatarFrame: u.avatarFrame }]),
  );
}

export async function sendGroupMessage(
  channelId: string,
  senderId: string,
  input: { content: string; mediaUrl?: string; type?: 'image' | 'audio'; durationSec?: number },
): Promise<{ message: GroupMessageShape; groupId: string }> {
  const channel = await Channel.findById(channelId);
  if (!channel) {
    throw new ApiError(404, 'Canal no encontrado');
  }
  const group = await assertGroupAndMembership(channel.group.toString(), senderId);

  const type: GroupMessageType = input.type ?? (input.mediaUrl ? 'image' : 'text');
  const sanitized = sanitizeMessageContent(input.content ?? '');
  if (type === 'text' && !sanitized) {
    throw new ApiError(400, 'El mensaje no puede estar vacío');
  }

  const { ciphertext, iv, authTag } = encryptText(sanitized);
  const doc = await GroupMessage.create({
    channel: channel._id,
    group: group._id,
    sender: senderId,
    type,
    ciphertext,
    iv,
    authTag,
    mediaUrl: input.mediaUrl,
    durationSec: input.durationSec,
  });

  const otherMemberIds = group.members.map((m) => m.user.toString()).filter((id) => id !== senderId);
  if (otherMemberIds.length > 0) {
    await GroupChannelRead.bulkWrite(
      otherMemberIds.map((userId) => ({
        updateOne: {
          filter: { channel: channel._id, user: userId },
          update: { $inc: { unreadCount: 1 }, $setOnInsert: { group: group._id } },
          upsert: true,
        },
      })),
    );
  }

  const senderInfo = await resolveSenderInfo(senderId);
  return { message: decryptGroupMessage(doc, senderInfo), groupId: group._id.toString() };
}

export async function markChannelRead(channelId: string, userId: string): Promise<void> {
  const channel = await Channel.findById(channelId).lean();
  if (!channel) {
    throw new ApiError(404, 'Canal no encontrado');
  }
  await assertGroupAndMembership(channel.group.toString(), userId);

  await GroupChannelRead.updateOne(
    { channel: channelId, user: userId },
    { $set: { unreadCount: 0, lastReadAt: new Date() }, $setOnInsert: { group: channel.group } },
    { upsert: true },
  );
}

export async function getGroupMessages(
  channelId: string,
  userId: string,
  { before, limit }: { before?: string; limit: number },
): Promise<GroupMessagesPageResponse> {
  const channel = await Channel.findById(channelId).lean();
  if (!channel) {
    throw new ApiError(404, 'Canal no encontrado');
  }
  const group = await assertGroupAndMembership(channel.group.toString(), userId);
  const joinedAt = group.members.find((m) => m.user.toString() === userId)!.joinedAt;

  // No se puede ver el historial de antes de haberse unido al grupo, aunque el canal ya
  // existiera con mensajes previos.
  const query: FilterQuery<GroupMessageDocument> = { channel: channelId, createdAt: { $gte: joinedAt } };
  if (before) {
    query.createdAt = { $gte: joinedAt, $lt: new Date(before) };
  }

  const docs = await GroupMessage.find(query).sort({ createdAt: -1 }).limit(limit + 1).lean();
  const hasMore = docs.length > limit;
  const page = hasMore ? docs.slice(0, limit) : docs;

  const senderInfoById = await resolveSenderInfoMap(page.map((doc) => doc.sender.toString()));
  const messages = page
    .map((doc) => decryptGroupMessage(doc, senderInfoById.get(doc.sender.toString()) ?? UNKNOWN_SENDER_INFO))
    .reverse();

  return {
    messages,
    nextCursor: hasMore ? page[page.length - 1].createdAt.toISOString() : null,
  };
}

export async function editGroupMessage(
  messageId: string,
  userId: string,
  content: string,
): Promise<{ message: GroupMessageShape; groupId: string }> {
  const doc = await GroupMessage.findById(messageId);
  if (!doc) {
    throw new ApiError(404, 'Mensaje no encontrado');
  }
  if (doc.sender.toString() !== userId) {
    throw new ApiError(403, 'Solo podés editar tus propios mensajes');
  }
  if (doc.deleted) {
    throw new ApiError(400, 'No podés editar un mensaje eliminado');
  }

  const sanitized = sanitizeMessageContent(content);
  if (!sanitized && doc.type === 'text') {
    throw new ApiError(400, 'El mensaje no puede estar vacío');
  }

  const { ciphertext, iv, authTag } = encryptText(sanitized);
  doc.ciphertext = ciphertext;
  doc.iv = iv;
  doc.authTag = authTag;
  doc.editedAt = new Date();
  await doc.save();

  const senderInfo = await resolveSenderInfo(doc.sender.toString());
  return { message: decryptGroupMessage(doc, senderInfo), groupId: doc.group.toString() };
}

export async function deleteGroupMessage(
  messageId: string,
  userId: string,
): Promise<{ message: GroupMessageShape; groupId: string }> {
  const doc = await GroupMessage.findById(messageId);
  if (!doc) {
    throw new ApiError(404, 'Mensaje no encontrado');
  }
  if (doc.sender.toString() !== userId) {
    throw new ApiError(403, 'Solo podés eliminar tus propios mensajes');
  }

  if (!doc.deleted) {
    const { ciphertext, iv, authTag } = encryptText('');
    doc.ciphertext = ciphertext;
    doc.iv = iv;
    doc.authTag = authTag;
    doc.mediaUrl = undefined;
    doc.deleted = true;
    await doc.save();
  }

  const senderInfo = await resolveSenderInfo(doc.sender.toString());
  return { message: decryptGroupMessage(doc, senderInfo), groupId: doc.group.toString() };
}

/**
 * Genera el mensaje de sistema ("X salió del grupo" / "X fue expulsado") en el canal por
 * defecto (el más viejo), y suma no leídos para el resto de los miembros igual que un mensaje
 * normal, así nadie se pierde el aviso. `actorUserId` es a quién le pasó, no quien lo generó.
 */
export async function createGroupSystemMessage(
  groupId: string,
  actorUserId: string,
  systemEvent: GroupSystemEvent,
  remainingMemberIds: string[],
): Promise<{ message: GroupMessageShape; groupId: string } | null> {
  const channel = await Channel.findOne({ group: groupId }).sort({ createdAt: 1 });
  if (!channel) {
    return null;
  }

  const { ciphertext, iv, authTag } = encryptText('');
  const doc = await GroupMessage.create({
    channel: channel._id,
    group: groupId,
    sender: actorUserId,
    type: 'system',
    systemEvent,
    ciphertext,
    iv,
    authTag,
  });

  if (remainingMemberIds.length > 0) {
    await GroupChannelRead.bulkWrite(
      remainingMemberIds.map((userId) => ({
        updateOne: {
          filter: { channel: channel._id, user: userId },
          update: { $inc: { unreadCount: 1 }, $setOnInsert: { group: new Types.ObjectId(groupId) } },
          upsert: true,
        },
      })),
    );
  }

  const senderInfo = await resolveSenderInfo(actorUserId);
  return { message: decryptGroupMessage(doc, senderInfo), groupId };
}
