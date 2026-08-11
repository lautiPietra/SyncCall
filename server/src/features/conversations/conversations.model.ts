import { Schema, model } from 'mongoose';
import type { ConversationDocument } from './conversations.types';

const conversationSchema = new Schema<ConversationDocument>({
  participantA: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  participantB: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  unreadCountA: { type: Number, default: 0 },
  unreadCountB: { type: Number, default: 0 },
  requestStatus: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'accepted' },
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  hiddenForA: { type: Boolean, default: false },
  hiddenForB: { type: Boolean, default: false },
  lastMessageAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

/**
 * Compuesto en 2 campos escalares (no un array): un índice único sobre un campo array
 * ({participants: [...]}) es multikey y termina prohibiendo que un mismo usuario aparezca
 * en 2 documentos distintos (cualquier valor repetido en el array choca), no solo pares
 * duplicados — por eso participantA/participantB en vez de un array, igual que userA/userB
 * en friendships.
 */
conversationSchema.index({ participantA: 1, participantB: 1 }, { unique: true });
// Cubre el listado de "mis conversaciones" ordenado por actividad reciente (para cada lado del par).
conversationSchema.index({ participantA: 1, lastMessageAt: -1 });
conversationSchema.index({ participantB: 1, lastMessageAt: -1 });

export const Conversation = model<ConversationDocument>('Conversation', conversationSchema);
