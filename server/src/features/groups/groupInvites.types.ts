import type { Document, Types } from 'mongoose';

export interface GroupInviteDocument extends Document<Types.ObjectId> {
  group: Types.ObjectId;
  invitedUser: Types.ObjectId;
  invitedBy: Types.ObjectId;
  createdAt: Date;
}
