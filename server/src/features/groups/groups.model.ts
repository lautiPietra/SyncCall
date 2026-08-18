import { Schema, model } from 'mongoose';
import type { ChannelDocument, GroupDocument, GroupMemberSubdocument } from './groups.types';

const groupMemberSchema = new Schema<GroupMemberSubdocument>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['owner', 'member'], default: 'member' },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const groupSchema = new Schema<GroupDocument>({
  name: { type: String, required: true, trim: true, maxlength: 50 },
  description: { type: String, trim: true, maxlength: 300 },
  photoUrl: { type: String },
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  members: { type: [groupMemberSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
});

// Cubre "en qué grupos estoy" (members.user) y el chequeo de membresía sin escanear el array
// completo en memoria en cada mensaje enviado.
groupSchema.index({ 'members.user': 1 });
groupSchema.index({ owner: 1 });

export const Group = model<GroupDocument>('Group', groupSchema);

const channelSchema = new Schema<ChannelDocument>({
  group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  name: { type: String, required: true, trim: true, maxlength: 50 },
  createdAt: { type: Date, default: Date.now },
});

// El orden por createdAt determina cuál es "#general" (el canal más viejo del grupo), sin
// necesidad de un flag isDefault aparte.
channelSchema.index({ group: 1, createdAt: 1 });

export const Channel = model<ChannelDocument>('Channel', channelSchema);
