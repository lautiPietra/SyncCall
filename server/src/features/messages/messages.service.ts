import { Types as MongooseTypes } from 'mongoose';
import type { FilterQuery, Types } from 'mongoose';
import type {
  ConversationRequestStatus,
  Message,
  MessageReaction,
  MessageReactionEmoji,
  MessageRequestSummary,
  MessagesPageResponse,
  MessageType,
} from '@synccall/shared';
import { Conversation } from '../conversations/conversations.model';
import { toPublicUser, type LeanPublicUser } from '../conversations/conversations.service';
import { Message as MessageModel } from './messages.model';
import type { MessageDocument } from './messages.types';
import { User } from '../users/users.model';
import { areFriends, PUBLIC_USER_FIELDS } from '../friends/friends.service';
import { ApiError } from '../../lib/ApiError';
import { decryptText, encryptText } from '../../lib/crypto';
import { sanitizeMessageContent } from '../../lib/sanitize';

function assertParticipant(conversation: { participantA: Types.ObjectId; participantB: Types.ObjectId }, userId: string): void {
  const isParticipant = conversation.participantA.toString() === userId || conversation.participantB.toString() === userId;
  if (!isParticipant) {
    throw new ApiError(403, 'No formás parte de esta conversación');
  }
}

function decryptMessage(doc: {
  _id: Types.ObjectId;
  conversation: Types.ObjectId;
  sender: Types.ObjectId;
  type: MessageType;
  ciphertext: string;
  iv: string;
  authTag: string;
  mediaUrl?: string;
  durationSec?: number;
  createdAt: Date;
  readAt?: Date;
  editedAt?: Date;
  deleted: boolean;
  reactions: { emoji: MessageReactionEmoji; user: Types.ObjectId }[];
}): Message {
  return {
    id: doc._id.toString(),
    conversation: doc.conversation.toString(),
    sender: doc.sender.toString(),
    type: doc.type,
    content: decryptText({ ciphertext: doc.ciphertext, iv: doc.iv, authTag: doc.authTag }),
    mediaUrl: doc.mediaUrl,
    durationSec: doc.durationSec,
    createdAt: doc.createdAt.toISOString(),
    readAt: doc.readAt?.toISOString(),
    editedAt: doc.editedAt?.toISOString(),
    // ?? por si son documentos de antes de que existiera esta feature: nunca se les corrió
    // una migración, así que en la base no tienen estos campos todavía.
    deleted: doc.deleted ?? false,
    reactions: (doc.reactions ?? []).map((r): MessageReaction => ({ emoji: r.emoji, userId: r.user.toString() })),
  };
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  input: { content: string; mediaUrl?: string; type?: MessageType; durationSec?: number },
): Promise<{
  message: Message;
  recipientId: string;
  recipientUnreadCount: number;
  requestStatus: ConversationRequestStatus;
  requestedBy: string;
  /** true si este mensaje fue el que recién creó la solicitud (primer mensaje de la conversación). */
  isNewRequest: boolean;
  /** true si este mensaje hizo que una solicitud pendiente/rechazada pasara a aceptada. */
  justAccepted: boolean;
  /** Presente solo si la solicitud sigue pendiente: lo que ve el destinatario en su inbox. */
  requestPreview: MessageRequestSummary | null;
}> {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new ApiError(404, 'Conversación no encontrada');
  }
  assertParticipant(conversation, senderId);

  const senderIsA = conversation.participantA.toString() === senderId;
  const recipientId = (senderIsA ? conversation.participantB : conversation.participantA).toString();

  // Los mensajes son solo entre amigos: si alguno de los dos removió al otro después de haber
  // tenido esta conversación, se corta la posibilidad de mandar mensajes nuevos (el historial
  // se sigue pudiendo leer/editar/borrar, pero no escribir mensajes nuevos ni reaccionar).
  if (!(await areFriends(senderId, recipientId))) {
    throw new ApiError(403, 'Ya no son amigos, no podés enviarle mensajes');
  }

  // Máquina de estados de "solicitud de mensajes": el primer mensaje de la conversación
  // deja todo pendiente hasta que el destinatario lo acepte; mientras tanto solo quien la
  // inició puede seguir mandando. Si el destinatario contesta o quien había rechazado
  // decide escribir igual, se toma como aceptación implícita.
  let requestStatus: ConversationRequestStatus = conversation.requestStatus;
  let requestedBy = conversation.requestedBy?.toString() ?? null;
  let isNewRequest = false;
  let justAccepted = false;

  if (requestedBy === null) {
    // requestedBy null es también el estado de conversaciones creadas antes de que existiera
    // esta feature (nunca se les tocó el campo): si ya tienen mensajes, no las convertimos
    // en solicitud retroactivamente, solo las "cerramos" en accepted la primera vez que se
    // vuelven a tocar. Si de verdad no tienen mensajes, es la primera vez que se escriben.
    const hasExistingMessages = await MessageModel.exists({ conversation: conversation._id });
    requestedBy = senderId;
    requestStatus = hasExistingMessages ? 'accepted' : 'pending';
    isNewRequest = !hasExistingMessages;
  } else if (requestStatus === 'declined') {
    if (requestedBy === senderId) {
      throw new ApiError(403, 'Este usuario no acepta mensajes tuyos por ahora');
    }
    requestStatus = 'accepted';
    justAccepted = true;
  } else if (requestStatus === 'pending' && requestedBy !== senderId) {
    requestStatus = 'accepted';
    justAccepted = true;
  }

  const type: MessageType = input.type ?? (input.mediaUrl ? 'image' : 'text');
  const content = sanitizeMessageContent(input.content ?? '');
  if (type === 'text' && !content) {
    throw new ApiError(400, 'El mensaje no puede estar vacío');
  }

  const { ciphertext, iv, authTag } = encryptText(content);
  const doc = await MessageModel.create({
    conversation: conversation._id,
    sender: senderId,
    type,
    ciphertext,
    iv,
    authTag,
    mediaUrl: input.mediaUrl,
    durationSec: input.durationSec,
  });

  // Mientras la solicitud siga pendiente, el destinatario no la tiene en sus mensajes
  // directos todavía (vive en "solicitudes de mensajes"), así que no le sumamos no-leídos.
  const recipientCounterField = senderIsA ? 'unreadCountB' : 'unreadCountA';
  const previousRecipientUnread = senderIsA ? conversation.unreadCountB : conversation.unreadCountA;
  const shouldIncrementUnread = requestStatus === 'accepted';
  const recipientUnreadCount = shouldIncrementUnread ? previousRecipientUnread + 1 : previousRecipientUnread;
  const recipientHiddenField = senderIsA ? 'hiddenForB' : 'hiddenForA';

  const update: Record<string, unknown> = {
    // Un mensaje nuevo siempre saca la conversación de "eliminada de mensajes directos"
    // para quien lo recibe, aunque la hubiera sacado de ahí antes.
    $set: { lastMessageAt: doc.createdAt, requestStatus, requestedBy, [recipientHiddenField]: false },
  };
  if (shouldIncrementUnread) {
    update.$inc = { [recipientCounterField]: 1 };
  }
  await Conversation.updateOne({ _id: conversation._id }, update);

  let requestPreview: MessageRequestSummary | null = null;
  if (requestStatus === 'pending') {
    const senderDoc = await User.findById(senderId).select(PUBLIC_USER_FIELDS).lean<LeanPublicUser>();
    if (senderDoc) {
      requestPreview = {
        conversationId: conversation._id.toString(),
        user: toPublicUser(senderDoc),
        lastMessage: { type, content, createdAt: doc.createdAt.toISOString() },
        createdAt: doc.createdAt.toISOString(),
      };
    }
  }

  return {
    message: {
      id: doc._id.toString(),
      conversation: conversation._id.toString(),
      sender: senderId,
      type,
      content,
      mediaUrl: input.mediaUrl,
      durationSec: input.durationSec,
      createdAt: doc.createdAt.toISOString(),
      deleted: false,
      reactions: [],
    },
    recipientId,
    recipientUnreadCount,
    requestStatus,
    requestedBy,
    isNewRequest,
    justAccepted,
    requestPreview,
  };
}

export async function getMessages(
  conversationId: string,
  userId: string,
  { before, limit }: { before?: string; limit: number },
): Promise<MessagesPageResponse> {
  const conversation = await Conversation.findById(conversationId).select('participantA participantB').lean();
  if (!conversation) {
    throw new ApiError(404, 'Conversación no encontrada');
  }
  assertParticipant(conversation, userId);

  const query: FilterQuery<MessageDocument> = { conversation: conversationId };
  if (before) {
    query.createdAt = { $lt: new Date(before) };
  }

  const docs = await MessageModel.find(query).sort({ createdAt: -1 }).limit(limit + 1).lean();
  const hasMore = docs.length > limit;
  const page = hasMore ? docs.slice(0, limit) : docs;

  const messages = page.map(decryptMessage).reverse();

  return {
    messages,
    nextCursor: hasMore ? page[page.length - 1].createdAt.toISOString() : null,
  };
}

export async function editMessage(
  messageId: string,
  userId: string,
  content: string,
): Promise<{ message: Message; conversationId: string }> {
  const doc = await MessageModel.findById(messageId);
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

  return { message: decryptMessage(doc), conversationId: doc.conversation.toString() };
}

export async function deleteMessage(messageId: string, userId: string): Promise<{ message: Message; conversationId: string }> {
  const doc = await MessageModel.findById(messageId);
  if (!doc) {
    throw new ApiError(404, 'Mensaje no encontrado');
  }
  if (doc.sender.toString() !== userId) {
    throw new ApiError(403, 'Solo podés eliminar tus propios mensajes');
  }

  if (!doc.deleted) {
    // Se borra el contenido real de la base (no solo se oculta en el cliente): ni siquiera
    // queda el ciphertext viejo dando vueltas una vez que el usuario pidió eliminarlo.
    const { ciphertext, iv, authTag } = encryptText('');
    doc.ciphertext = ciphertext;
    doc.iv = iv;
    doc.authTag = authTag;
    doc.mediaUrl = undefined;
    doc.deleted = true;
    doc.reactions.splice(0, doc.reactions.length);
    await doc.save();
  }

  return { message: decryptMessage(doc), conversationId: doc.conversation.toString() };
}

/** Cada usuario tiene como máximo una reacción por mensaje: elegir un emoji distinto reemplaza la anterior, y volver a tocar la misma la saca (toggle). */
export async function reactToMessage(
  messageId: string,
  userId: string,
  emoji: MessageReactionEmoji,
): Promise<{ message: Message; conversationId: string }> {
  const doc = await MessageModel.findById(messageId);
  if (!doc) {
    throw new ApiError(404, 'Mensaje no encontrado');
  }
  if (doc.deleted) {
    throw new ApiError(400, 'No podés reaccionar a un mensaje eliminado');
  }

  const conversation = await Conversation.findById(doc.conversation).select('participantA participantB').lean();
  if (!conversation) {
    throw new ApiError(404, 'Conversación no encontrada');
  }
  assertParticipant(conversation, userId);

  const otherUserId = (conversation.participantA.toString() === userId ? conversation.participantB : conversation.participantA).toString();
  if (!(await areFriends(userId, otherUserId))) {
    throw new ApiError(403, 'Ya no son amigos, no podés reaccionar a sus mensajes');
  }

  const existingIndex = doc.reactions.findIndex((r) => r.user.toString() === userId);
  const alreadyHasThisEmoji = existingIndex >= 0 && doc.reactions[existingIndex].emoji === emoji;
  if (existingIndex >= 0) {
    doc.reactions.splice(existingIndex, 1);
  }
  if (!alreadyHasThisEmoji) {
    doc.reactions.push({ emoji, user: new MongooseTypes.ObjectId(userId) });
  }
  await doc.save();

  return { message: decryptMessage(doc), conversationId: doc.conversation.toString() };
}

/** Sacar tu propia reacción no requiere seguir siendo amigos (es una limpieza, no una escritura nueva), pero sí que sigas siendo parte de la conversación. */
export async function removeReaction(messageId: string, userId: string): Promise<{ message: Message; conversationId: string }> {
  const doc = await MessageModel.findById(messageId);
  if (!doc) {
    throw new ApiError(404, 'Mensaje no encontrado');
  }

  const conversation = await Conversation.findById(doc.conversation).select('participantA participantB').lean();
  if (!conversation) {
    throw new ApiError(404, 'Conversación no encontrada');
  }
  assertParticipant(conversation, userId);

  const existingIndex = doc.reactions.findIndex((r) => r.user.toString() === userId);
  if (existingIndex >= 0) {
    doc.reactions.splice(existingIndex, 1);
    await doc.save();
  }

  return { message: decryptMessage(doc), conversationId: doc.conversation.toString() };
}
