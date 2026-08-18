import type { Server, Socket } from 'socket.io';
import {
  SOCKET_EVENTS,
  deleteGroupMessageSchema,
  editGroupMessageSchema,
  objectIdSchema,
  sendGroupMessageSchema,
} from '@synccall/shared';
import { z } from 'zod';
import type {
  GroupErrorPayload,
  GroupMessageDeletePayload,
  GroupMessageEditPayload,
  GroupMessageNewPayload,
  GroupMessageSendPayload,
  GroupMessageUpdatedPayload,
  GroupTypingPayload,
} from '@synccall/shared';
import * as groupMessagesService from '../../features/groups/groupMessages.service';
import { Channel, Group } from '../../features/groups/groups.model';
import { GroupMessage } from '../../features/groups/groupMessages.model';
import { ApiError } from '../../lib/ApiError';
import { consumeMessageToken } from '../messageRateLimiter';

const groupTypingSchema = z.object({ channelId: objectIdSchema, isTyping: z.boolean() });

export function registerGroupHandlers(io: Server, socket: Socket, userId: string): void {
  socket.on(SOCKET_EVENTS.GROUP_MESSAGE_SEND, (payload: GroupMessageSendPayload) => {
    void handleGroupMessageSend(io, userId, payload);
  });

  socket.on(SOCKET_EVENTS.GROUP_MESSAGE_EDIT, (payload: GroupMessageEditPayload) => {
    void handleGroupMessageEdit(io, userId, payload);
  });

  socket.on(SOCKET_EVENTS.GROUP_MESSAGE_DELETE, (payload: GroupMessageDeletePayload) => {
    void handleGroupMessageDelete(io, userId, payload);
  });

  socket.on(SOCKET_EVENTS.GROUP_TYPING, (payload: GroupTypingPayload) => {
    void handleGroupTyping(socket, userId, payload);
  });
}

async function handleGroupMessageSend(io: Server, userId: string, rawPayload: GroupMessageSendPayload): Promise<void> {
  const parsed = sendGroupMessageSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return;
  }
  if (!consumeMessageToken(userId)) {
    console.warn(`Rate limit de mensajes excedido para el usuario ${userId}`);
    return;
  }

  try {
    const { message, groupId } = await groupMessagesService.sendGroupMessage(parsed.data.channelId, userId, parsed.data.content);
    const payload: GroupMessageNewPayload = { message };
    io.to(`group:${groupId}`).emit(SOCKET_EVENTS.GROUP_MESSAGE_NEW, payload);
  } catch (err) {
    await emitGroupErrorForChannel(io, userId, parsed.data.channelId, err);
  }
}

async function handleGroupMessageEdit(io: Server, userId: string, rawPayload: GroupMessageEditPayload): Promise<void> {
  const parsed = editGroupMessageSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return;
  }
  if (!consumeMessageToken(userId)) {
    return;
  }
  try {
    const { message, groupId } = await groupMessagesService.editGroupMessage(parsed.data.messageId, userId, parsed.data.content);
    broadcastGroupMessageUpdate(io, groupId, message);
  } catch (err) {
    await emitGroupErrorForMessage(io, userId, parsed.data.messageId, err);
  }
}

async function handleGroupMessageDelete(io: Server, userId: string, rawPayload: GroupMessageDeletePayload): Promise<void> {
  const parsed = deleteGroupMessageSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return;
  }
  if (!consumeMessageToken(userId)) {
    return;
  }
  try {
    const { message, groupId } = await groupMessagesService.deleteGroupMessage(parsed.data.messageId, userId);
    broadcastGroupMessageUpdate(io, groupId, message);
  } catch (err) {
    await emitGroupErrorForMessage(io, userId, parsed.data.messageId, err);
  }
}

async function handleGroupTyping(socket: Socket, userId: string, rawPayload: GroupTypingPayload): Promise<void> {
  const parsed = groupTypingSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return;
  }
  const channel = await Channel.findById(parsed.data.channelId).select('group').lean();
  if (!channel) {
    return;
  }
  // socket.to() no exige que el emisor esté en la sala: sin este chequeo, cualquiera podría
  // mandar un channelId ajeno y hacer aparecer "está escribiendo" en un grupo del que no es
  // parte. Mismo motivo por el que dm:typing valida participantes antes de reenviar.
  const isMember = await Group.exists({ _id: channel.group, 'members.user': userId });
  if (!isMember) {
    return;
  }
  const payload: GroupTypingPayload = { channelId: parsed.data.channelId, isTyping: parsed.data.isTyping, userId };
  // socket.to() (no io.to()) para no hacerte eco a vos mismo: acá sí importa, a diferencia de
  // los DMs, porque la sala del grupo incluye tus propias otras pestañas y a todos los demás.
  socket.to(`group:${channel.group.toString()}`).emit(SOCKET_EVENTS.GROUP_TYPING, payload);
}

function broadcastGroupMessageUpdate(io: Server, groupId: string, message: GroupMessageUpdatedPayload['message']): void {
  const payload: GroupMessageUpdatedPayload = { message };
  io.to(`group:${groupId}`).emit(SOCKET_EVENTS.GROUP_MESSAGE_UPDATED, payload);
}

async function emitGroupErrorForChannel(io: Server, userId: string, channelId: string, err: unknown): Promise<void> {
  if (!(err instanceof ApiError)) {
    console.error('Error al enviar un mensaje de grupo:', err);
    return;
  }
  const payload: GroupErrorPayload = { channelId, message: err.message };
  io.to(`user:${userId}`).emit(SOCKET_EVENTS.GROUP_ERROR, payload);
}

async function emitGroupErrorForMessage(io: Server, userId: string, messageId: string, err: unknown): Promise<void> {
  if (!(err instanceof ApiError)) {
    console.error('Error al procesar una acción sobre un mensaje de grupo:', err);
    return;
  }
  const doc = await GroupMessage.findById(messageId).select('channel').lean();
  if (!doc) {
    return;
  }
  const payload: GroupErrorPayload = { channelId: doc.channel.toString(), message: err.message };
  io.to(`user:${userId}`).emit(SOCKET_EVENTS.GROUP_ERROR, payload);
}
