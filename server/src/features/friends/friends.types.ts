import type { Document, Types } from 'mongoose';
import type { FriendRequestStatus } from '@synccall/shared';

export interface FriendRequestDocument extends Document<Types.ObjectId> {
  from: Types.ObjectId;
  to: Types.ObjectId;
  status: FriendRequestStatus;
  createdAt: Date;
}

export interface FriendshipDocument extends Document<Types.ObjectId> {
  userA: Types.ObjectId;
  userB: Types.ObjectId;
  createdAt: Date;
}
