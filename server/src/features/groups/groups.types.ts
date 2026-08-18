import type { Document, Types } from 'mongoose';
import type { GroupRole } from '@synccall/shared';

export interface GroupMemberSubdocument {
  user: Types.ObjectId;
  role: GroupRole;
  joinedAt: Date;
}

export interface GroupDocument extends Document<Types.ObjectId> {
  name: string;
  description?: string;
  photoUrl?: string;
  owner: Types.ObjectId;
  members: GroupMemberSubdocument[];
  createdAt: Date;
}

export interface ChannelDocument extends Document<Types.ObjectId> {
  group: Types.ObjectId;
  name: string;
  createdAt: Date;
}
