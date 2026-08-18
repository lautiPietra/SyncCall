import { Schema, model } from 'mongoose';
import { AVATAR_FRAME_IDS, NAMEPLATE_IDS } from '@synccall/shared';
import type { UserDocument } from './users.types';

const userSchema = new Schema<UserDocument>({
  googleId: { type: String },
  githubId: { type: String },
  username: { type: String, required: true, unique: true },
  displayName: { type: String, required: true },
  avatarUrl: { type: String, required: true },
  bannerUrl: { type: String, default: '' },
  bio: { type: String },
  accentColor: { type: String, required: true },
  avatarFrame: { type: String, enum: AVATAR_FRAME_IDS, default: 'none' },
  nameplate: { type: String, enum: NAMEPLATE_IDS, default: 'none' },
  status: {
    type: String,
    enum: ['online', 'idle', 'dnd', 'invisible'],
    default: 'online',
  },
  isOnline: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

userSchema.index({ googleId: 1 }, { unique: true, sparse: true });
userSchema.index({ githubId: 1 }, { unique: true, sparse: true });

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const obj = ret as unknown as Record<string, unknown>;
    obj.id = (obj._id as { toString(): string }).toString();
    delete obj._id;
    delete obj.__v;
    delete obj.googleId;
    delete obj.githubId;
    return obj;
  },
});

export const User = model<UserDocument>('User', userSchema);
