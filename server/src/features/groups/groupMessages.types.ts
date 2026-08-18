import type { Document, Types } from 'mongoose';

export interface GroupMessageDocument extends Document<Types.ObjectId> {
  channel: Types.ObjectId;
  group: Types.ObjectId;
  sender: Types.ObjectId;
  ciphertext: string;
  iv: string;
  authTag: string;
  createdAt: Date;
  editedAt?: Date;
  deleted: boolean;
}
