import type { FilterQuery, Types } from 'mongoose';
import type {
  ConversationRequestStatus,
  Message,
  MessageRequestSummary,
  MessagesPageResponse,
  MessageType,
} from '@synccall/shared';
import { Conversation } from '../conversations/conversations.model';
import { toPublicUser, type LeanPublicUser } from '../conversations/conversations.service';
import { Message as MessageModel } from './messages.model';
import type { MessageDocument } from './messages.types';
import { User } from '../users/users.model';
import { PUBLIC_USER_FIELDS } from '../friends/friends.service';
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
  createdAt: Date;
  readAt?: Date;
}): Message {
  return {
    id: doc._id.toString(),
    conversation: doc.conversation.toString(),
    sender: doc.sender.toString(),
    type: doc.type,
    content: decryptText({ ciphertext: doc.ciphertext, iv: doc.iv, authTag: doc.authTag }),
    mediaUrl: doc.mediaUrl,
    createdAt: doc.createdAt.toISOString(),
    readAt: doc.readAt?.toISOString(),
  };
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  input: { content: string; mediaUrl?: string },
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

  const type: MessageType = input.mediaUrl ? 'image' : 'text';
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
      createdAt: doc.createdAt.toISOString(),
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
