import { Schema, model } from 'mongoose';
import type { FriendshipDocument } from './friends.types';

const friendshipSchema = new Schema<FriendshipDocument>({
  userA: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  userB: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
});

friendshipSchema.index({ userA: 1, userB: 1 }, { unique: true });

export const Friendship = model<FriendshipDocument>('Friendship', friendshipSchema);
