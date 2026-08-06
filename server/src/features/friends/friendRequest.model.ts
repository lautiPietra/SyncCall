import { Schema, model } from 'mongoose';
import type { FriendRequestDocument } from './friends.types';

const friendRequestSchema = new Schema<FriendRequestDocument>({
  from: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  to: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined'],
    default: 'pending',
  },
  createdAt: { type: Date, default: Date.now },
});

friendRequestSchema.index({ from: 1, to: 1 }, { unique: true });

export const FriendRequest = model<FriendRequestDocument>('FriendRequest', friendRequestSchema);
