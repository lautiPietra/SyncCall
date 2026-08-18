import type { FilterQuery } from 'mongoose';
import type { GroupMessage as GroupMessageShape, GroupMessagesPageResponse } from '@synccall/shared';
import { Channel } from './groups.model';
import { assertGroupAndMembership } from './groups.service';
import { GroupMessage } from './groupMessages.model';
import type { GroupMessageDocument } from './groupMessages.types';
import { ApiError } from '../../lib/ApiError';
import { decryptText, encryptText } from '../../lib/crypto';
import { sanitizeMessageContent } from '../../lib/sanitize';

function decryptGroupMessage(doc: {
  _id: { toString(): string };
  channel: { toString(): string };
  group: { toString(): string };
  sender: { toString(): string };
  ciphertext: string;
  iv: string;
  authTag: string;
  createdAt: Date;
  editedAt?: Date;
  deleted: boolean;
}): GroupMessageShape {
  return {
    id: doc._id.toString(),
    channel: doc.channel.toString(),
    group: doc.group.toString(),
    sender: doc.sender.toString(),
    content: decryptText({ ciphertext: doc.ciphertext, iv: doc.iv, authTag: doc.authTag }),
    createdAt: doc.createdAt.toISOString(),
    editedAt: doc.editedAt?.toISOString(),
    deleted: doc.deleted ?? false,
  };
}

export async function sendGroupMessage(
  channelId: string,
  senderId: string,
  content: string,
): Promise<{ message: GroupMessageShape; groupId: string }> {
  const channel = await Channel.findById(channelId);
  if (!channel) {
    throw new ApiError(404, 'Canal no encontrado');
  }
  const group = await assertGroupAndMembership(channel.group.toString(), senderId);

  const sanitized = sanitizeMessageContent(content);
  if (!sanitized) {
    throw new ApiError(400, 'El mensaje no puede estar vacío');
  }

  const { ciphertext, iv, authTag } = encryptText(sanitized);
  const doc = await GroupMessage.create({
    channel: channel._id,
    group: group._id,
    sender: senderId,
    ciphertext,
    iv,
    authTag,
  });

  return { message: decryptGroupMessage(doc), groupId: group._id.toString() };
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
  await assertGroupAndMembership(channel.group.toString(), userId);

  const query: FilterQuery<GroupMessageDocument> = { channel: channelId };
  if (before) {
    query.createdAt = { $lt: new Date(before) };
  }

  const docs = await GroupMessage.find(query).sort({ createdAt: -1 }).limit(limit + 1).lean();
  const hasMore = docs.length > limit;
  const page = hasMore ? docs.slice(0, limit) : docs;

  const messages = page.map(decryptGroupMessage).reverse();

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
  if (!sanitized) {
    throw new ApiError(400, 'El mensaje no puede estar vacío');
  }

  const { ciphertext, iv, authTag } = encryptText(sanitized);
  doc.ciphertext = ciphertext;
  doc.iv = iv;
  doc.authTag = authTag;
  doc.editedAt = new Date();
  await doc.save();

  return { message: decryptGroupMessage(doc), groupId: doc.group.toString() };
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
    doc.deleted = true;
    await doc.save();
  }

  return { message: decryptGroupMessage(doc), groupId: doc.group.toString() };
}
