import { randomUUID } from 'node:crypto';

export const MAX_GROUP_CALL_PARTICIPANTS = 8;

type CallStatus = 'ringing' | 'active';

interface CallParticipant {
  socketId: string;
  joinedAt: number;
}

export interface CallEntry {
  id: string;
  kind: 'dm' | 'group';
  contextKey: string;
  conversationId?: string;
  channelId?: string;
  groupId?: string;
  status: CallStatus;
  /** DM: el callee que todavía no aceptó. */
  ringingFor?: string;
  /** DM: quién la inició (para el historial, `sender` del mensaje de "se hizo una llamada"). */
  callerId?: string;
  /** Cuándo pasó a tener a alguien más además de quien la armó (DM: se acepta; grupo: se une
   * el segundo participante). Si nunca se pone, no se registra historial al terminar: nadie
   * llegó a contestar / a la llamada de grupo nunca se sumó una segunda persona. */
  connectedAt?: number;
  participants: Map<string, CallParticipant>;
}

/** callId -> entry. */
const callsById = new Map<string, CallEntry>();
/** `dm:{conversationId}` | `group:{channelId}` -> callId: para saber si ya hay una llamada ahí. */
const callsByContext = new Map<string, string>();
/** userId -> callId: en qué llamada está cada usuario (a lo sumo una, cubre multi-pestaña). */
const userActiveCallId = new Map<string, string>();

function dmContextKey(conversationId: string): string {
  return `dm:${conversationId}`;
}

function groupContextKey(channelId: string): string {
  return `group:${channelId}`;
}

export function getCall(callId: string): CallEntry | undefined {
  return callsById.get(callId);
}

export function isParticipant(callId: string, userId: string): boolean {
  return callsById.get(callId)?.participants.has(userId) ?? false;
}

export function isUserBusy(userId: string, exceptCallId?: string): boolean {
  const callId = userActiveCallId.get(userId);
  return Boolean(callId) && callId !== exceptCallId;
}

/** null = el callee ya está ocupado en otra llamada, o ya hay una llamada en esta conversación. */
export function createDmCall(conversationId: string, callerId: string, callerSocketId: string, calleeId: string): CallEntry | null {
  const contextKey = dmContextKey(conversationId);
  if (callsByContext.has(contextKey) || isUserBusy(callerId) || isUserBusy(calleeId)) {
    return null;
  }

  const entry: CallEntry = {
    id: randomUUID(),
    kind: 'dm',
    contextKey,
    conversationId,
    status: 'ringing',
    ringingFor: calleeId,
    callerId,
    participants: new Map([[callerId, { socketId: callerSocketId, joinedAt: Date.now() }]]),
  };

  callsById.set(entry.id, entry);
  callsByContext.set(contextKey, entry.id);
  userActiveCallId.set(callerId, entry.id);
  return entry;
}

/** null = la llamada ya no existe, ya fue aceptada, o quien acepta no es el callee esperado. */
export function acceptDmCall(callId: string, calleeId: string, calleeSocketId: string): CallEntry | null {
  const entry = callsById.get(callId);
  if (!entry || entry.kind !== 'dm' || entry.status !== 'ringing' || entry.ringingFor !== calleeId) {
    return null;
  }

  entry.status = 'active';
  entry.ringingFor = undefined;
  entry.connectedAt = Date.now();
  entry.participants.set(calleeId, { socketId: calleeSocketId, joinedAt: Date.now() });
  userActiveCallId.set(calleeId, entry.id);
  return entry;
}

/**
 * Termina una llamada DM (decline/cancel/hangup) y libera a todos sus participantes.
 * `userId` puede ser un participante ya unido, o el callee todavía sonando (`ringingFor`):
 * mientras suena, solo el caller está en `participants` — el callee recién se agrega al aceptar.
 */
export function endCall(callId: string, userId: string): CallEntry | null {
  const entry = callsById.get(callId);
  if (!entry || (!entry.participants.has(userId) && entry.ringingFor !== userId)) {
    return null;
  }

  callsById.delete(callId);
  callsByContext.delete(entry.contextKey);
  entry.participants.forEach((_participant, participantId) => userActiveCallId.delete(participantId));
  return entry;
}

export function getOrCreateGroupCall(channelId: string, groupId: string): CallEntry {
  const contextKey = groupContextKey(channelId);
  const existingId = callsByContext.get(contextKey);
  const existing = existingId ? callsById.get(existingId) : undefined;
  if (existing) {
    return existing;
  }

  const entry: CallEntry = {
    id: randomUUID(),
    kind: 'group',
    contextKey,
    channelId,
    groupId,
    status: 'active',
    participants: new Map(),
  };
  callsById.set(entry.id, entry);
  callsByContext.set(contextKey, entry.id);
  return entry;
}

type JoinGroupCallResult = { ok: true; entry: CallEntry } | { ok: false; reason: 'busy' | 'full' };

export function joinGroupCall(channelId: string, groupId: string, userId: string, socketId: string): JoinGroupCallResult {
  const entry = getOrCreateGroupCall(channelId, groupId);
  if (entry.participants.has(userId)) {
    // Reingreso idempotente (ej: reconexión): solo actualiza el socketId.
    entry.participants.set(userId, { socketId, joinedAt: entry.participants.get(userId)!.joinedAt });
    return { ok: true, entry };
  }
  if (isUserBusy(userId)) {
    return { ok: false, reason: 'busy' };
  }
  if (entry.participants.size >= MAX_GROUP_CALL_PARTICIPANTS) {
    return { ok: false, reason: 'full' };
  }

  if (!entry.connectedAt && entry.participants.size === 1) {
    entry.connectedAt = Date.now();
  }
  entry.participants.set(userId, { socketId, joinedAt: Date.now() });
  userActiveCallId.set(userId, entry.id);
  return { ok: true, entry };
}

/** null = el usuario no estaba en una llamada de ese canal. Devuelve la entry (ya vacía si nadie más queda). */
export function leaveGroupCall(channelId: string, userId: string): CallEntry | null {
  const contextKey = groupContextKey(channelId);
  const callId = callsByContext.get(contextKey);
  const entry = callId ? callsById.get(callId) : undefined;
  if (!entry || !entry.participants.has(userId)) {
    return null;
  }

  entry.participants.delete(userId);
  userActiveCallId.delete(userId);
  if (entry.participants.size === 0) {
    callsById.delete(entry.id);
    callsByContext.delete(contextKey);
  }
  return entry;
}

/** Corta de una una llamada de grupo entera (todos los participantes), para cuando el canal de
 * voz en el que está se borra: sin esto la entry quedaría huérfana en el registro (nadie la
 * puede volver a tocar porque el canal ya no existe) y esos usuarios quedarían con la pantalla
 * de llamada trabada. null = no había ninguna llamada activa en ese canal. */
export function forceEndGroupCall(channelId: string): CallEntry | null {
  const contextKey = groupContextKey(channelId);
  const callId = callsByContext.get(contextKey);
  const entry = callId ? callsById.get(callId) : undefined;
  if (!entry) {
    return null;
  }

  entry.participants.forEach((_participant, participantId) => userActiveCallId.delete(participantId));
  callsById.delete(entry.id);
  callsByContext.delete(contextKey);
  return entry;
}

/** Limpieza al desconectarse un socket puntual: termina/abandona toda llamada donde ese socket sea el registrado para el usuario. Devuelve las entries afectadas (ya con el estado post-limpieza) para que el handler decida qué relayar. */
export function removeSocket(userId: string, socketId: string): CallEntry[] {
  const callId = userActiveCallId.get(userId);
  if (!callId) {
    return [];
  }
  const entry = callsById.get(callId);
  if (!entry || entry.participants.get(userId)?.socketId !== socketId) {
    return [];
  }

  if (entry.kind === 'dm') {
    const ended = endCall(callId, userId);
    return ended ? [ended] : [];
  }

  const left = leaveGroupCall(entry.channelId!, userId);
  return left ? [left] : [];
}
