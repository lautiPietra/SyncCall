import type { AvatarFrameId } from './user.types';

/**
 * Snapshot del remitente resuelto al momento de traer/emitir el mensaje (no al momento de
 * enviarlo): así el historial sigue mostrando nombre y foto reales aunque haya salido del grupo,
 * y refleja cambios de perfil posteriores igual que el resto de la UI.
 */
export interface GroupMessageSenderInfo {
  displayName: string;
  avatarUrl: string;
  avatarFrame: AvatarFrameId;
}

export type GroupMessageType = 'text' | 'system' | 'image' | 'audio';

/** Eventos que generan un mensaje de sistema en el canal por defecto del grupo. */
export type GroupSystemEvent = 'member_left' | 'member_removed' | 'call_ended';

export interface GroupMessage {
  id: string;
  channel: string;
  group: string;
  sender: string;
  senderInfo: GroupMessageSenderInfo;
  type: GroupMessageType;
  /** Presente solo cuando type === 'system': qué pasó (el remitente es a quién le pasó). */
  systemEvent?: GroupSystemEvent;
  content: string;
  /** Presente cuando type es 'image' o 'audio'. */
  mediaUrl?: string;
  /** Solo para mensajes de audio: duración en segundos. */
  durationSec?: number;
  createdAt: string;
  editedAt?: string;
  deleted: boolean;
}

export interface GroupMessagesPageResponse {
  messages: GroupMessage[];
  nextCursor: string | null;
}
