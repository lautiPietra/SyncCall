import type { Document, Types } from 'mongoose';

export interface GroupChannelReadDocument extends Document<Types.ObjectId> {
  channel: Types.ObjectId;
  group: Types.ObjectId;
  user: Types.ObjectId;
  unreadCount: number;
  lastReadAt: Date;
}
