import { Schema, model } from 'mongoose';
import type { FriendRequestDocument } from './friends.types';

const friendRequestSchema = new Schema<FriendRequestDocument>({
  from: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  to: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  // Par sin dirección (siempre [menor, mayor].join('_')): con índice único evita que dos
  // solicitudes en sentido opuesto (A->B y B->A) queden pendientes a la vez si se mandan
  // casi al mismo tiempo, algo que un índice único solo sobre {from, to} no puede prevenir
  // porque para Mongo son dos documentos con claves distintas.
  pairKey: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined'],
    default: 'pending',
  },
  createdAt: { type: Date, default: Date.now },
});

// sparse: si en algún momento hay documentos viejos sin pairKey (schema previo a este campo),
// no deben chocar entre sí por "faltarles" el campo al mismo valor; los documentos nuevos
// siempre lo traen seteado desde el service, así que la unicidad sigue protegida para todos
// los casos que importan.
friendRequestSchema.index({ pairKey: 1 }, { unique: true, sparse: true });

export const FriendRequest = model<FriendRequestDocument>('FriendRequest', friendRequestSchema);
