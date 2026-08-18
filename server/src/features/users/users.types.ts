import type { Document, Types } from 'mongoose';
import type { AvatarFrameId, NameplateId, UserStatus } from '@synccall/shared';

export interface UserDocument extends Document<Types.ObjectId> {
  googleId?: string;
  githubId?: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bannerUrl?: string;
  bio?: string;
  accentColor: string;
  avatarFrame: AvatarFrameId;
  nameplate: NameplateId;
  status: UserStatus;
  isOnline: boolean;
  createdAt: Date;
}
