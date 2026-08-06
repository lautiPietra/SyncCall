import type { Document, Types } from 'mongoose';

export interface ConversationDocument extends Document<Types.ObjectId> {
  participants: [Types.ObjectId, Types.ObjectId];
  lastMessageAt: Date;
  createdAt: Date;
}
