import { Types } from 'mongoose';
import type {
  ConversationRequestStatus,
  ConversationStatusResponse,
  ConversationSummary,
  ListConversationsResponse,
  ListMessageRequestsResponse,
  PublicUser,
} from '@synccall/shared';
import { Conversation } from './conversations.model';
import type { ConversationDocument } from './conversations.types';
import { Message } from '../messages/messages.model';
import { User } from '../users/users.model';
import { Friendship } from '../friends/friendship.model';
import { PUBLIC_USER_FIELDS } from '../friends/friends.service';
import { ApiError } from '../../lib/ApiError';
import { decryptText } from '../../lib/crypto';

interface LeanConversation {
  _id: Types.ObjectId;
  participantA: Types.ObjectId;
  participantB: Types.ObjectId;
  unreadCountA: number;
  unreadCountB: number;
  requestStatus: ConversationRequestStatus;
  requestedBy: Types.ObjectId | null;
  lastMessageAt: Date;
  createdAt: Date;
}

export interface LeanPublicUser {
  _id: Types.ObjectId;
  username: string;
  displayName: string;
  avatarUrl: string;
  bannerUrl?: string;
  bio?: string;
  accentColor: string;
  avatarFrame: PublicUser['avatarFrame'];
  status: PublicUser['status'];
  isOnline: boolean;
  createdAt: Date;
}

export function toPublicUser(doc: LeanPublicUser): PublicUser {
  return {
    id: doc._id.toString(),
    username: doc.username,
    displayName: doc.displayName,
    avatarUrl: doc.avatarUrl,
    bannerUrl: doc.bannerUrl,
    bio: doc.bio,
    accentColor: doc.accentColor,
    avatarFrame: doc.avatarFrame,
    status: doc.status,
    isOnline: doc.isOnline,
    createdAt: doc.createdAt.toISOString(),
  };
}

function isSlotA(conversation: { participantA: Types.ObjectId }, userId: string): boolean {
  return conversation.participantA.toString() === userId;
}

function otherParticipantId(conversation: { participantA: Types.ObjectId; participantB: Types.ObjectId }, userId: string): string {
  return isSlotA(conversation, userId) ? conversation.participantB.toString() : conversation.participantA.toString();
}

export async function getOrCreateConversation(userId: string, friendId: string): Promise<ConversationDocument> {
  if (userId === friendId) {
    throw new ApiError(400, 'No podés iniciar una conversación con vos mismo');
  }

  const areFriends = await Friendship.exists({
    $or: [
      { userA: userId, userB: friendId },
      { userA: friendId, userB: userId },
    ],
  });
  if (!areFriends) {
    throw new ApiError(403, 'Solo podés chatear con tus amigos');
  }

  const [a, b] = [userId, friendId].sort();
  const hiddenField = userId === a ? 'hiddenForA' : 'hiddenForB';

  // Upsert atómico: evita la carrera de crear 2 conversaciones para el mismo par si
  // ambos usuarios abren el chat al mismo tiempo (el índice único además lo garantiza).
  // El $set (no $setOnInsert) de hiddenField es a propósito: reabrir el chat, aunque ya
  // existiera, es la forma de "agregar de nuevo a mensajes directos" si lo habías ocultado.
  return Conversation.findOneAndUpdate(
    { participantA: a, participantB: b },
    { $setOnInsert: { participantA: a, participantB: b }, $set: { [hiddenField]: false } },
    { upsert: true, new: true },
  );
}

export async function listConversations(
  userId: string,
  { limit, before }: { limit: number; before?: string },
): Promise<ListConversationsResponse> {
  const query: Record<string, unknown> = {
    $or: [{ participantA: userId }, { participantB: userId }],
    // Las solicitudes de mensajes pendientes de mi respuesta (alguien nuevo me escribió y
    // todavía no acepté) y las que ya rechacé viven fuera de la lista normal de DMs. Lo que
    // eliminé de mensajes directos (para mí, no para el otro) también queda afuera, hasta
    // que llegue un mensaje nuevo o lo vuelva a abrir explícitamente.
    $nor: [
      { requestStatus: 'pending', requestedBy: { $ne: userId } },
      { requestStatus: 'declined' },
      { participantA: userId, hiddenForA: true },
      { participantB: userId, hiddenForB: true },
    ],
  };
  if (before) {
    query.lastMessageAt = { $lt: new Date(before) };
  }

  const docs = await Conversation.find(query)
    .sort({ lastMessageAt: -1 })
    .limit(limit + 1)
    .lean<LeanConversation[]>();
  const hasMore = docs.length > limit;
  const page = hasMore ? docs.slice(0, limit) : docs;

  if (page.length === 0) {
    return { conversations: [], nextCursor: null };
  }

  const conversationIds = page.map((c) => c._id);
  const otherUserIds = page.map((c) => otherParticipantId(c, userId));

  const [otherUsers, latestMessages] = await Promise.all([
    User.find({ _id: { $in: otherUserIds } })
      .select(PUBLIC_USER_FIELDS)
      .lean<LeanPublicUser[]>(),
    // Último mensaje por conversación sin traer/ordenar todo el historial: el $sort
    // respeta el índice (conversation, createdAt) y Mongo puede resolver el $group con
    // $first como una serie de "distinct scans" en vez de escanear cada mensaje.
    Message.aggregate<{
      _id: Types.ObjectId;
      doc: { sender: Types.ObjectId; type: 'text' | 'image'; ciphertext: string; iv: string; authTag: string; createdAt: Date };
    }>([
      { $match: { conversation: { $in: conversationIds } } },
      { $sort: { conversation: 1, createdAt: -1 } },
      { $group: { _id: '$conversation', doc: { $first: '$$ROOT' } } },
    ]),
  ]);

  const otherUserById = new Map(otherUsers.map((u) => [u._id.toString(), u]));
  const latestByConversation = new Map(latestMessages.map((m) => [m._id.toString(), m.doc]));

  const conversations: ConversationSummary[] = [];
  for (const conv of page) {
    const otherUserId = otherParticipantId(conv, userId);
    const otherUser = otherUserById.get(otherUserId);
    if (!otherUser) {
      continue;
    }

    const latest = latestByConversation.get(conv._id.toString());

    conversations.push({
      id: conv._id.toString(),
      otherUser: toPublicUser(otherUser),
      lastMessage: latest
        ? {
            type: latest.type,
            content: decryptText({ ciphertext: latest.ciphertext, iv: latest.iv, authTag: latest.authTag }),
            senderId: latest.sender.toString(),
            createdAt: latest.createdAt.toISOString(),
          }
        : null,
      unreadCount: isSlotA(conv, userId) ? conv.unreadCountA : conv.unreadCountB,
      requestStatus: conv.requestStatus,
      requestedBy: conv.requestedBy?.toString() ?? null,
      lastMessageAt: conv.lastMessageAt.toISOString(),
      createdAt: conv.createdAt.toISOString(),
    });
  }

  return {
    conversations,
    nextCursor: hasMore ? page[page.length - 1].lastMessageAt.toISOString() : null,
  };
}

export async function markConversationRead(conversationId: string, userId: string): Promise<void> {
  const conversation = await Conversation.findById(conversationId).select('participantA participantB');
  if (!conversation) {
    throw new ApiError(404, 'Conversación no encontrada');
  }
  if (conversation.participantA.toString() !== userId && conversation.participantB.toString() !== userId) {
    throw new ApiError(403, 'No formás parte de esta conversación');
  }

  const counterField = isSlotA(conversation, userId) ? 'unreadCountA' : 'unreadCountB';

  await Promise.all([
    Conversation.updateOne({ _id: conversationId }, { $set: { [counterField]: 0 } }),
    Message.updateMany(
      { conversation: conversationId, sender: { $ne: userId }, readAt: null },
      { $set: { readAt: new Date() } },
    ),
  ]);
}

export async function listMessageRequests(userId: string): Promise<ListMessageRequestsResponse> {
  const docs = await Conversation.find({
    requestStatus: 'pending',
    requestedBy: { $ne: userId },
    $or: [{ participantA: userId }, { participantB: userId }],
  })
    .sort({ lastMessageAt: -1 })
    .lean<LeanConversation[]>();

  if (docs.length === 0) {
    return { requests: [] };
  }

  const conversationIds = docs.map((c) => c._id);
  const otherUserIds = docs.map((c) => otherParticipantId(c, userId));

  const [otherUsers, latestMessages] = await Promise.all([
    User.find({ _id: { $in: otherUserIds } })
      .select(PUBLIC_USER_FIELDS)
      .lean<LeanPublicUser[]>(),
    Message.aggregate<{
      _id: Types.ObjectId;
      doc: { type: 'text' | 'image'; ciphertext: string; iv: string; authTag: string; createdAt: Date };
    }>([
      { $match: { conversation: { $in: conversationIds } } },
      { $sort: { conversation: 1, createdAt: -1 } },
      { $group: { _id: '$conversation', doc: { $first: '$$ROOT' } } },
    ]),
  ]);

  const otherUserById = new Map(otherUsers.map((u) => [u._id.toString(), u]));
  const latestByConversation = new Map(latestMessages.map((m) => [m._id.toString(), m.doc]));

  const requests: ListMessageRequestsResponse['requests'] = [];
  for (const conv of docs) {
    const otherUser = otherUserById.get(otherParticipantId(conv, userId));
    if (!otherUser) {
      continue;
    }
    const latest = latestByConversation.get(conv._id.toString());
    requests.push({
      conversationId: conv._id.toString(),
      user: toPublicUser(otherUser),
      lastMessage: latest
        ? {
            type: latest.type,
            content: decryptText({ ciphertext: latest.ciphertext, iv: latest.iv, authTag: latest.authTag }),
            createdAt: latest.createdAt.toISOString(),
          }
        : null,
      createdAt: conv.createdAt.toISOString(),
    });
  }

  return { requests };
}

export async function respondMessageRequest(
  conversationId: string,
  userId: string,
  status: 'accepted' | 'declined',
): Promise<{ initiatorId: string }> {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new ApiError(404, 'Conversación no encontrada');
  }
  if (conversation.participantA.toString() !== userId && conversation.participantB.toString() !== userId) {
    throw new ApiError(403, 'No formás parte de esta conversación');
  }
  const initiatorId = conversation.requestedBy?.toString() ?? null;
  if (!initiatorId) {
    throw new ApiError(400, 'Esta conversación todavía no tiene solicitud de mensajes');
  }
  if (initiatorId === userId) {
    throw new ApiError(403, 'Solo quien recibe la solicitud puede aceptarla o rechazarla');
  }

  conversation.requestStatus = status;
  await conversation.save();

  if (status === 'accepted') {
    // Al aceptar, los mensajes que ya había mandado quien inició pasan a contar como no
    // leídos recién ahora (mientras estuvo pendiente no se sumaban al contador de DMs).
    const counterField = isSlotA(conversation, userId) ? 'unreadCountA' : 'unreadCountB';
    const unreadCount = await Message.countDocuments({
      conversation: conversationId,
      sender: { $ne: userId },
      readAt: null,
    });
    await Conversation.updateOne({ _id: conversationId }, { $set: { [counterField]: unreadCount } });
  }

  return { initiatorId };
}

export async function getConversationStatus(userId: string, friendId: string): Promise<ConversationStatusResponse> {
  const [a, b] = [userId, friendId].sort();
  const conversation = await Conversation.findOne({ participantA: a, participantB: b })
    .select('requestStatus requestedBy')
    .lean<{ _id: Types.ObjectId; requestStatus: ConversationRequestStatus; requestedBy: Types.ObjectId | null }>();

  if (!conversation) {
    return { exists: false, conversationId: null, requestStatus: null, requestedBy: null };
  }

  return {
    exists: true,
    conversationId: conversation._id.toString(),
    requestStatus: conversation.requestStatus,
    requestedBy: conversation.requestedBy?.toString() ?? null,
  };
}

export async function hideConversation(conversationId: string, userId: string): Promise<void> {
  const conversation = await Conversation.findById(conversationId).select('participantA participantB');
  if (!conversation) {
    throw new ApiError(404, 'Conversación no encontrada');
  }
  if (conversation.participantA.toString() !== userId && conversation.participantB.toString() !== userId) {
    throw new ApiError(403, 'No formás parte de esta conversación');
  }

  const hiddenField = isSlotA(conversation, userId) ? 'hiddenForA' : 'hiddenForB';
  await Conversation.updateOne({ _id: conversationId }, { $set: { [hiddenField]: true } });
}
