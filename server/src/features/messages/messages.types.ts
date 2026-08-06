import type { Document, Types } from 'mongoose';

export interface MessageDocument extends Document<Types.ObjectId> {
  conversation: Types.ObjectId;
  sender: Types.ObjectId;
  content: string;
  createdAt: Date;
  readAt?: Date;
}
