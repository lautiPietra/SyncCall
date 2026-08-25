import { Schema, model } from 'mongoose';
import type { GroupMessageDocument } from './groupMessages.types';

const groupMessageSchema = new Schema<GroupMessageDocument>({
  channel: { type: Schema.Types.ObjectId, ref: 'Channel', required: true },
  // Denormalizado: evita resolver channel -> group en cada filtro/broadcast.
  group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['text', 'system', 'image', 'audio'], default: 'text' },
  systemEvent: { type: String, enum: ['member_left', 'member_removed', 'call_ended'] },
  ciphertext: { type: String, default: '' },
  iv: { type: String, required: true },
  authTag: { type: String, required: true },
  mediaUrl: { type: String },
  durationSec: { type: Number },
  createdAt: { type: Date, default: Date.now },
  editedAt: { type: Date },
  deleted: { type: Boolean, default: false },
});

groupMessageSchema.index({ channel: 1, createdAt: -1 });

export const GroupMessage = model<GroupMessageDocument>('GroupMessage', groupMessageSchema);
