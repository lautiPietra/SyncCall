import { Schema, model } from 'mongoose';
import type { MessageDocument } from './messages.types';

const messageSchema = new Schema<MessageDocument>({
  conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now },
  readAt: { type: Date },
});

messageSchema.index({ conversation: 1, createdAt: 1 });

export const Message = model<MessageDocument>('Message', messageSchema);
