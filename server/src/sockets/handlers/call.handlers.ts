import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { SOCKET_EVENTS, objectIdSchema } from '@synccall/shared';
import type {
  CallBusyPayload,
  CallErrorPayload,
  CallGroupJoinPayload,
  CallGroupLeavePayload,
  CallGroupStatePayload,
  CallIdPayload,
  CallInvitePayload,
  CallInviteRelayPayload,
  CallLifecycleRelayPayload,
  CallParticipantInfo,
  CallSignalPayload,
  CallSignalRelayPayload,
  GroupMessageNewPayload,
  MessageNewPayload,
} from '@synccall/shared';
import { Conversation } from '../../features/conversations/conversations.model';
import { Channel, Group } from '../../features/groups/groups.model';
import { areFriends } from '../../features/friends/friends.service';
import { isUserOnline } from '../presence';
import * as callRegistry from '../callRegistry';
import * as messagesService from '../../features/messages/messages.service';
import * as groupMessagesService from '../../features/groups/groupMessages.service';

const callIdSchema = z.object({ callId: z.string().min(1).max(100) });
const callInviteSchema = z.object({ conversationId: objectIdSchema });
const callGroupChannelSchema = z.object({ channelId: objectIdSchema });
const callSignalSchema = z.object({ callId: z.string().min(1).max(100), toUserId: objectIdSchema, data: z.unknown() });

/** Backstop: si el callee no contesta ni rechaza (o su tab murió), la llamada se cancela sola. El timeout real de UX es del lado del cliente; esto solo evita que quede una llamada "sonando" para siempre en el registro. */
const RING_TIMEOUT_MS = 60_000;
const ringTimeouts = new Map<string, NodeJS.Timeout>();

export function registerCallHandlers(io: Server, socket: Socket, userId: string): void {
  socket.on(SOCKET_EVENTS.CALL_INVITE, (payload: CallInvitePayload) => {
    void handleCallInvite(io, socket, userId, payload);
  });

  socket.on(SOCKET_EVENTS.CALL_ACCEPT, (payload: CallIdPayload) => {
    handleCallAccept(io, socket, userId, payload);
  });

  socket.on(SOCKET_EVENTS.CALL_DECLINE, (payload: CallIdPayload) => {
    void handleCallEndLike(io, userId, payload, SOCKET_EVENTS.CALL_DECLINE);
  });

  socket.on(SOCKET_EVENTS.CALL_CANCEL, (payload: CallIdPayload) => {
    void handleCallEndLike(io, userId, payload, SOCKET_EVENTS.CALL_CANCEL);
  });

  socket.on(SOCKET_EVENTS.CALL_END, (payload: CallIdPayload) => {
    void handleCallEndLike(io, userId, payload, SOCKET_EVENTS.CALL_END);
  });

  socket.on(SOCKET_EVENTS.CALL_GROUP_JOIN, (payload: CallGroupJoinPayload) => {
    void handleGroupCallJoin(io, socket, userId, payload);
  });

  socket.on(SOCKET_EVENTS.CALL_GROUP_LEAVE, (payload: CallGroupLeavePayload) => {
    void handleGroupCallLeave(io, userId, payload);
  });

  socket.on(SOCKET_EVENTS.CALL_SIGNAL, (payload: CallSignalPayload) => {
    handleCallSignal(io, userId, payload);
  });
}

/** Limpieza incondicional por socket: a diferencia de la limpieza de presencia (`handleDisconnect` en index.ts, que solo actúa cuando esa era la última pestaña del usuario), la llamada está atada a un socket puntual, no al usuario — si tenés 2 pestañas y cerrás la que está en la llamada, esa llamada se tiene que terminar igual aunque tu otra pestaña te mantenga online. */
export function handleCallDisconnect(io: Server, userId: string, socketId: string): void {
  const affected = callRegistry.removeSocket(userId, socketId);
  affected.forEach((entry) => {
    clearRingTimeout(entry.id);
    if (entry.kind === 'dm') {
      const targets = new Set<string>(entry.participants.keys());
      if (entry.ringingFor) {
        targets.add(entry.ringingFor);
      }
      const relay: CallLifecycleRelayPayload = { callId: entry.id, byUserId: userId };
      targets.forEach((participantId) => io.to(`user:${participantId}`).emit(SOCKET_EVENTS.CALL_END, relay));
      void recordDmCallHistory(io, entry);
    } else {
      broadcastGroupCallState(io, entry.channelId!, entry.groupId!, entry);
      if (entry.participants.size === 0) {
        void recordGroupCallHistory(io, entry, userId);
      }
    }
  });
}

/** Registra "se hizo una llamada" en el chat DM si llegó a conectarse (alguien contestó); si nunca se aceptó (se canceló/rechazó sonando), `connectedAt` queda sin setear y no se registra nada. */
async function recordDmCallHistory(io: Server, entry: callRegistry.CallEntry): Promise<void> {
  if (!entry.connectedAt || !entry.conversationId || !entry.callerId) {
    return;
  }
  const durationSec = Math.max(1, Math.round((Date.now() - entry.connectedAt) / 1000));
  const result = await messagesService.recordCallMessage(entry.conversationId, entry.callerId, durationSec);
  if (!result) {
    return;
  }
  const payload: MessageNewPayload = { message: result.message };
  io.to(`user:${entry.callerId}`).to(`user:${result.recipientId}`).emit(SOCKET_EVENTS.MESSAGE_NEW, payload);
}

/** Igual que `recordDmCallHistory` pero para llamadas de grupo: solo cuenta si en algún momento se sumó una segunda persona (si nadie más se unió nunca, no hubo "llamada" real que registrar). */
async function recordGroupCallHistory(io: Server, entry: callRegistry.CallEntry, actorUserId: string): Promise<void> {
  if (!entry.connectedAt || !entry.groupId) {
    return;
  }
  const durationSec = Math.max(1, Math.round((Date.now() - entry.connectedAt) / 1000));
  const group = await Group.findById(entry.groupId).select('members.user').lean();
  if (!group) {
    return;
  }
  const memberIds = group.members.map((m) => m.user.toString()).filter((id) => id !== actorUserId);
  const result = await groupMessagesService.createGroupSystemMessage(entry.groupId, actorUserId, 'call_ended', memberIds, durationSec);
  if (!result) {
    return;
  }
  const payload: GroupMessageNewPayload = { message: result.message };
  io.to(`group:${entry.groupId}`).emit(SOCKET_EVENTS.GROUP_MESSAGE_NEW, payload);
}

async function handleCallInvite(io: Server, socket: Socket, userId: string, rawPayload: CallInvitePayload): Promise<void> {
  const parsed = callInviteSchema.safeParse(rawPayload);
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

  const calleeId = (conversation.participantA.toString() === userId ? conversation.participantB : conversation.participantA).toString();

  if (!(await areFriends(userId, calleeId))) {
    emitCallError(io, userId, 'Ya no son amigos, no podés llamarlo');
    return;
  }
  if (!isUserOnline(calleeId)) {
    emitCallError(io, userId, 'Ese usuario no está disponible ahora');
    return;
  }

  const entry = callRegistry.createDmCall(parsed.data.conversationId, userId, socket.id, calleeId);
  if (!entry) {
    const payload: CallBusyPayload = { conversationId: parsed.data.conversationId };
    io.to(`user:${userId}`).emit(SOCKET_EVENTS.CALL_BUSY, payload);
    return;
  }

  const relay: CallInviteRelayPayload = { callId: entry.id, conversationId: parsed.data.conversationId, fromUserId: userId };
  io.to(`user:${userId}`).to(`user:${calleeId}`).emit(SOCKET_EVENTS.CALL_INVITE, relay);

  scheduleRingTimeout(io, entry.id, userId, calleeId);
}

function handleCallAccept(io: Server, socket: Socket, userId: string, rawPayload: CallIdPayload): void {
  const parsed = callIdSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return;
  }

  const entry = callRegistry.acceptDmCall(parsed.data.callId, userId, socket.id);
  if (!entry) {
    return;
  }

  clearRingTimeout(entry.id);
  const relay: CallLifecycleRelayPayload = { callId: entry.id, byUserId: userId };
  entry.participants.forEach((_participant, participantId) => {
    io.to(`user:${participantId}`).emit(SOCKET_EVENTS.CALL_ACCEPT, relay);
  });
}

/** Cubre decline/cancel/end: las tres son "terminar una llamada DM", solo cambia qué evento se relaya para que el otro lado muestre el mensaje correcto. */
async function handleCallEndLike(io: Server, userId: string, rawPayload: CallIdPayload, eventName: string): Promise<void> {
  const parsed = callIdSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return;
  }

  const ended = callRegistry.endCall(parsed.data.callId, userId);
  if (!ended || ended.kind !== 'dm') {
    return;
  }

  clearRingTimeout(ended.id);
  const targets = new Set<string>(ended.participants.keys());
  if (ended.ringingFor) {
    targets.add(ended.ringingFor);
  }
  const relay: CallLifecycleRelayPayload = { callId: ended.id, byUserId: userId };
  targets.forEach((participantId) => io.to(`user:${participantId}`).emit(eventName, relay));
  await recordDmCallHistory(io, ended);
}

async function handleGroupCallJoin(io: Server, socket: Socket, userId: string, rawPayload: CallGroupJoinPayload): Promise<void> {
  const parsed = callGroupChannelSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return;
  }

  const channel = await Channel.findById(parsed.data.channelId).select('group type').lean();
  if (!channel) {
    return;
  }
  if (channel.type !== 'voice') {
    emitCallError(io, userId, 'Ese canal no es de voz');
    return;
  }

  const groupId = channel.group.toString();
  const isMember = await Group.exists({ _id: groupId, 'members.user': userId });
  if (!isMember) {
    return;
  }

  const result = callRegistry.joinGroupCall(parsed.data.channelId, groupId, userId, socket.id);
  if (!result.ok) {
    emitCallError(io, userId, result.reason === 'full' ? 'La llamada está llena' : 'Ya estás en otra llamada');
    return;
  }

  broadcastGroupCallState(io, parsed.data.channelId, groupId, result.entry);
}

async function handleGroupCallLeave(io: Server, userId: string, rawPayload: CallGroupLeavePayload): Promise<void> {
  const parsed = callGroupChannelSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return;
  }

  const left = callRegistry.leaveGroupCall(parsed.data.channelId, userId);
  if (!left || !left.groupId) {
    return;
  }

  broadcastGroupCallState(io, parsed.data.channelId, left.groupId, left);
  if (left.participants.size === 0) {
    await recordGroupCallHistory(io, left, userId);
  }
}

function handleCallSignal(io: Server, userId: string, rawPayload: CallSignalPayload): void {
  const parsed = callSignalSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return;
  }
  if (!callRegistry.isParticipant(parsed.data.callId, userId) || !callRegistry.isParticipant(parsed.data.callId, parsed.data.toUserId)) {
    return;
  }

  const relay: CallSignalRelayPayload = { callId: parsed.data.callId, fromUserId: userId, data: parsed.data.data };
  io.to(`user:${parsed.data.toUserId}`).emit(SOCKET_EVENTS.CALL_SIGNAL, relay);
}

function broadcastGroupCallState(
  io: Server,
  channelId: string,
  groupId: string,
  entry: { id: string; participants: Map<string, unknown> },
): void {
  const participants: CallParticipantInfo[] = Array.from(entry.participants.keys()).map((uid) => ({ userId: uid }));
  const payload: CallGroupStatePayload = {
    channelId,
    groupId,
    callId: participants.length > 0 ? entry.id : null,
    participants,
  };
  io.to(`group:${groupId}`).emit(SOCKET_EVENTS.CALL_GROUP_STATE, payload);
}

function emitCallError(io: Server, userId: string, message: string): void {
  const payload: CallErrorPayload = { message };
  io.to(`user:${userId}`).emit(SOCKET_EVENTS.CALL_ERROR, payload);
}

function scheduleRingTimeout(io: Server, callId: string, callerId: string, calleeId: string): void {
  const timeout = setTimeout(() => {
    ringTimeouts.delete(callId);
    const ended = callRegistry.endCall(callId, callerId);
    if (!ended) {
      return;
    }
    const relay: CallLifecycleRelayPayload = { callId, byUserId: callerId };
    io.to(`user:${callerId}`).to(`user:${calleeId}`).emit(SOCKET_EVENTS.CALL_CANCEL, relay);
  }, RING_TIMEOUT_MS);
  ringTimeouts.set(callId, timeout);
}

function clearRingTimeout(callId: string): void {
  const timeout = ringTimeouts.get(callId);
  if (timeout) {
    clearTimeout(timeout);
    ringTimeouts.delete(callId);
  }
}
