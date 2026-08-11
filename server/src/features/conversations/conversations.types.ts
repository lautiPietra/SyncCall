import type { Document, Types } from 'mongoose';
import type { ConversationRequestStatus } from '@synccall/shared';

export interface ConversationDocument extends Document<Types.ObjectId> {
  /** Orden canónico (participantA < participantB), igual que userA/userB en friendships. */
  participantA: Types.ObjectId;
  participantB: Types.ObjectId;
  /** Mensajes sin leer para participantA / participantB respectivamente. */
  unreadCountA: number;
  unreadCountB: number;
  /**
   * 'accepted' hasta que se manda el primer mensaje real (requestedBy null): ahí pasa a
   * 'pending' y solo el destinatario (el que no está en requestedBy) puede aceptar/rechazar.
   */
  requestStatus: ConversationRequestStatus;
  requestedBy: Types.ObjectId | null;
  /** "Eliminar de mensajes directos": oculta la conversación solo para ese participante,
   * hasta que llegue un mensaje nuevo o la vuelvan a abrir explícitamente. */
  hiddenForA: boolean;
  hiddenForB: boolean;
  lastMessageAt: Date;
  createdAt: Date;
}
