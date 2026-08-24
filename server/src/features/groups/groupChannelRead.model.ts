import { Schema, model } from 'mongoose';
import type { GroupChannelReadDocument } from './groupChannelRead.types';

const groupChannelReadSchema = new Schema<GroupChannelReadDocument>({
  channel: { type: Schema.Types.ObjectId, ref: 'Channel', required: true },
  group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  unreadCount: { type: Number, default: 0 },
  lastReadAt: { type: Date, default: Date.now },
});

// Una fila por usuario × canal: upsert-friendly para el $inc al mandar mensajes y el reset al leer.
groupChannelReadSchema.index({ channel: 1, user: 1 }, { unique: true });
// Suma de no leídos por grupo (para el badge del ícono en GroupIconRail).
groupChannelReadSchema.index({ group: 1, user: 1 });

export const GroupChannelRead = model<GroupChannelReadDocument>('GroupChannelRead', groupChannelReadSchema);
