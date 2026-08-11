import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { SOCKET_EVENTS, messageContentSchema, objectIdSchema } from '@synccall/shared';
import type { DmErrorPayload, DmSendPayload, DmTypingPayload } from '@synccall/shared';
import * as messagesService from '../../features/messages/messages.service';
import { emitMessageDelivery } from '../../features/conversations/conversations.controller';
import { Conversation } from '../../features/conversations/conversations.model';
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
