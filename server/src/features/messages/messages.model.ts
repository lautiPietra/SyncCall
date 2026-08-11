import { Schema, model } from 'mongoose';
import type { MessageDocument } from './messages.types';

const messageSchema = new Schema<MessageDocument>({
  conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['text', 'image'], default: 'text' },
  // Sin `required`: una imagen sin texto cifra un string vacío ('' -> ciphertext de largo 0),
  // y el validador default de Mongoose para String trata '' como "ausente" en un required.
  ciphertext: { type: String, default: '' },
  iv: { type: String, required: true },
  authTag: { type: String, required: true },
  mediaUrl: { type: String },
  createdAt: { type: Date, default: Date.now },
  readAt: { type: Date },
});

/**
 * Sirve tanto para paginar el historial (conversation + rango/orden de createdAt) como
 * para el "último mensaje por conversación" en la lista de chats (sort + $group por
 * conversation aprovechando este mismo orden, sin escanear todo el historial).
 */
messageSchema.index({ conversation: 1, createdAt: -1 });

export const Message = model<MessageDocument>('Message', messageSchema);
