import { Schema, model } from 'mongoose';
import type { ConversationDocument } from './conversations.types';

const conversationSchema = new Schema<ConversationDocument>({
  participants: {
    type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    required: true,
    validate: {
      validator: (value: unknown[]) => value.length === 2,
      message: 'Una conversación debe tener exactamente 2 participantes',
    },
  },
  lastMessageAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

conversationSchema.index({ participants: 1 }, { unique: true });

export const Conversation = model<ConversationDocument>('Conversation', conversationSchema);
