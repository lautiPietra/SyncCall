import { Schema, model } from 'mongoose';
import { MESSAGE_REACTION_EMOJIS } from '@synccall/shared';
import type { MessageDocument, MessageReactionSubdocument } from './messages.types';

const reactionSchema = new Schema<MessageReactionSubdocument>(
  {
    emoji: { type: String, enum: MESSAGE_REACTION_EMOJIS, required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false },
);

const messageSchema = new Schema<MessageDocument>({
  conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['text', 'image', 'audio'], default: 'text' },
  // Sin `required`: una imagen sin texto cifra un string vacío ('' -> ciphertext de largo 0),
  // y el validador default de Mongoose para String trata '' como "ausente" en un required.
  ciphertext: { type: String, default: '' },
  iv: { type: String, required: true },
  authTag: { type: String, required: true },
  mediaUrl: { type: String },
  durationSec: { type: Number },
  createdAt: { type: Date, default: Date.now },
  readAt: { type: Date },
  editedAt: { type: Date },
  deleted: { type: Boolean, default: false },
  reactions: { type: [reactionSchema], default: [] },
});

/**
 * Sirve tanto para paginar el historial (conversation + rango/orden de createdAt) como
 * para el "último mensaje por conversación" en la lista de chats (sort + $group por
 * conversation aprovechando este mismo orden, sin escanear todo el historial).
 */
messageSchema.index({ conversation: 1, createdAt: -1 });

export const Message = model<MessageDocument>('Message', messageSchema);
