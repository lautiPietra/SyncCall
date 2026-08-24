import type { Document, Types } from 'mongoose';
import type { GroupMessageType, GroupSystemEvent } from '@synccall/shared';

export interface GroupMessageDocument extends Document<Types.ObjectId> {
  channel: Types.ObjectId;
  group: Types.ObjectId;
  sender: Types.ObjectId;
  type: GroupMessageType;
  systemEvent?: GroupSystemEvent;
  ciphertext: string;
  iv: string;
  authTag: string;
  mediaUrl?: string;
  durationSec?: number;
  createdAt: Date;
  editedAt?: Date;
  deleted: boolean;
}
