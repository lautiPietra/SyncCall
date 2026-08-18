import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import {
  SOCKET_EVENTS,
  deleteMessageSchema,
  editMessageSchema,
  messageContentSchema,
  objectIdSchema,
  reactToMessageSchema,
  unreactToMessageSchema,
} from '@synccall/shared';
import type {
  DmErrorPayload,
  DmSendPayload,
  DmTypingPayload,
  Message,
  MessageDeletePayload,
  MessageEditPayload,
  MessageReactPayload,
  MessageUnreactPayload,
  MessageUpdatedPayload,
} from '@synccall/shared';
import * as messagesService from '../../features/messages/messages.service';
import { emitMessageDelivery } from '../../features/conversations/conversations.controller';
import { Conversation } from '../../features/conversations/conversations.model';
import { Message as MessageModel } from '../../features/messages/messages.model';
import { ApiError } from '../../lib/ApiError';
import { consumeMessageToken } from '../messageRateLimiter';

const dmSendSchema = z.object({ conversationId: objectIdSchema, content: messageContentSchema });
const dmTypingSchema = z.object({ conversationId: objectIdSchema, isTyping: z.boolean() });

export function registerMessageHandlers(io: Server, socket: Socket, userId: string): void {
  socket.on(SOCKET_EVENTS.DM_SEND, (payload: DmSendPayload) => {
    void handleDmSend(io, userId, payload);
  });

  socket.on(SOCKET_EVENTS.DM_TYPING, (payload: DmTypingPayload) => {
    void handleDmTyping(io, userId, payload);
  });

  socket.on(SOCKET_EVENTS.MESSAGE_EDIT, (payload: MessageEditPayload) => {
    void handleMessageEdit(io, userId, payload);
  });

  socket.on(SOCKET_EVENTS.MESSAGE_DELETE, (payload: MessageDeletePayload) => {
    void handleMessageDelete(io, userId, payload);
  });

  socket.on(SOCKET_EVENTS.MESSAGE_REACT, (payload: MessageReactPayload) => {
    void handleMessageReact(io, userId, payload);
  });

  socket.on(SOCKET_EVENTS.MESSAGE_UNREACT, (payload: MessageUnreactPayload) => {
    void handleMessageUnreact(io, userId, payload);
  });
}

async function handleDmSend(io: Server, userId: string, rawPayload: DmSendPayload): Promise<void> {
  const parsed = dmSendSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return;
  }

  // Sobre el límite: se ignora el mensaje (no se persiste, no se emite), solo warning en logs.
  if (!consumeMessageToken(userId)) {
    console.warn(`Rate limit de mensajes excedido para el usuario ${userId}`);
    return;
  }

  try {
    const { message, recipientId, requestStatus, justAccepted, requestPreview } = await messagesService.sendMessage(
      parsed.data.conversationId,
      userId,
      { content: parsed.data.content },
    );

    emitMessageDelivery({ senderId: userId, recipientId, message, requestStatus, justAccepted, requestPreview });
  } catch (err) {
    if (err instanceof ApiError) {
      const payload: DmErrorPayload = { conversationId: parsed.data.conversationId, message: err.message };
      io.to(`user:${userId}`).emit(SOCKET_EVENTS.DM_ERROR, payload);
      return;
    }
    console.error('Error al enviar mensaje por socket:', err);
  }
}

async function handleDmTyping(io: Server, userId: string, rawPayload: DmTypingPayload): Promise<void> {
  const parsed = dmTypingSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return;
  }

  const conversation = await Conversation.findOne({
    _id: parsed.data.conversationId,
    $or: [{ participantA: userId }, { participantB: userId }],
  })
    .select('participantA participantB')
    .lean();
  if (!conversation) {
    return;
  }

  const recipientId = (conversation.participantA.toString() === userId ? conversation.participantB : conversation.participantA).toString();

  const payload: DmTypingPayload = { conversationId: parsed.data.conversationId, isTyping: parsed.data.isTyping };
  io.to(`user:${recipientId}`).emit(SOCKET_EVENTS.DM_TYPING, payload);
}

/** Les llega a los dos participantes (incluye al que hizo el cambio, para que sus otras pestañas se sincronicen). */
async function broadcastMessageUpdate(io: Server, conversationId: string, message: Message): Promise<void> {
  const conversation = await Conversation.findById(conversationId).select('participantA participantB').lean();
  if (!conversation) {
    return;
  }
  const payload: MessageUpdatedPayload = { message };
  io.to(`user:${conversation.participantA.toString()}`)
    .to(`user:${conversation.participantB.toString()}`)
    .emit(SOCKET_EVENTS.MESSAGE_UPDATED, payload);
}

/** El error puede surgir después de resolver el mensaje (ya no existe, no es tuyo, etc.), así que se busca aparte la conversación a la que avisar en vez de depender de que el service la haya llegado a devolver. */
async function emitMessageActionError(io: Server, userId: string, messageId: string, err: unknown): Promise<void> {
  if (!(err instanceof ApiError)) {
    console.error('Error al procesar una acción sobre un mensaje:', err);
    return;
  }
  const doc = await MessageModel.findById(messageId).select('conversation').lean();
  if (!doc) {
    return;
  }
  const payload: DmErrorPayload = { conversationId: doc.conversation.toString(), message: err.message };
  io.to(`user:${userId}`).emit(SOCKET_EVENTS.DM_ERROR, payload);
}

async function handleMessageEdit(io: Server, userId: string, rawPayload: MessageEditPayload): Promise<void> {
  const parsed = editMessageSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return;
  }
  if (!consumeMessageToken(userId)) {
    return;
  }
  try {
    const { message, conversationId } = await messagesService.editMessage(parsed.data.messageId, userId, parsed.data.content);
    await broadcastMessageUpdate(io, conversationId, message);
  } catch (err) {
    await emitMessageActionError(io, userId, parsed.data.messageId, err);
  }
}

async function handleMessageDelete(io: Server, userId: string, rawPayload: MessageDeletePayload): Promise<void> {
  const parsed = deleteMessageSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return;
  }
  if (!consumeMessageToken(userId)) {
    return;
  }
  try {
    const { message, conversationId } = await messagesService.deleteMessage(parsed.data.messageId, userId);
    await broadcastMessageUpdate(io, conversationId, message);
  } catch (err) {
    await emitMessageActionError(io, userId, parsed.data.messageId, err);
  }
}

async function handleMessageReact(io: Server, userId: string, rawPayload: MessageReactPayload): Promise<void> {
  const parsed = reactToMessageSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return;
  }
  if (!consumeMessageToken(userId)) {
    return;
  }
  try {
    const { message, conversationId } = await messagesService.reactToMessage(parsed.data.messageId, userId, parsed.data.emoji);
    await broadcastMessageUpdate(io, conversationId, message);
  } catch (err) {
    await emitMessageActionError(io, userId, parsed.data.messageId, err);
  }
}

async function handleMessageUnreact(io: Server, userId: string, rawPayload: MessageUnreactPayload): Promise<void> {
  const parsed = unreactToMessageSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return;
  }
  if (!consumeMessageToken(userId)) {
    return;
  }
  try {
    const { message, conversationId } = await messagesService.removeReaction(parsed.data.messageId, userId);
    await broadcastMessageUpdate(io, conversationId, message);
  } catch (err) {
    await emitMessageActionError(io, userId, parsed.data.messageId, err);
  }
}
