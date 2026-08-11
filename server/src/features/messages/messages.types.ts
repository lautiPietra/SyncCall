import type { Document, Types } from 'mongoose';
import type { MessageType } from '@synccall/shared';

export interface MessageDocument extends Document<Types.ObjectId> {
  conversation: Types.ObjectId;
  sender: Types.ObjectId;
  type: MessageType;
  ciphertext: string;
  iv: string;
  authTag: string;
  mediaUrl?: string;
  createdAt: Date;
  readAt?: Date;
}
