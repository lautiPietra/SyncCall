import { Schema, model } from 'mongoose';
import type { GroupInviteDocument } from './groupInvites.types';

const groupInviteSchema = new Schema<GroupInviteDocument>({
  group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  invitedUser: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
});

// Evita invitar 2 veces a la misma persona al mismo grupo mientras la primera sigue pendiente.
groupInviteSchema.index({ group: 1, invitedUser: 1 }, { unique: true });
// Cubre "mis invitaciones pendientes" (listMyGroupInvites).
groupInviteSchema.index({ invitedUser: 1 });

export const GroupInvite = model<GroupInviteDocument>('GroupInvite', groupInviteSchema);
