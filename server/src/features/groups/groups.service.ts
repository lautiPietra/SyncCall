import { Types } from 'mongoose';
import type { ChannelType, GroupInvitePreview, GroupMemberDetail, GroupSummary, PendingGroupInvite } from '@synccall/shared';
import { Group, Channel } from './groups.model';
import type { ChannelDocument, GroupDocument } from './groups.types';
import { GroupInvite } from './groupInvites.model';
import type { GroupInviteDocument } from './groupInvites.types';
import { GroupChannelRead } from './groupChannelRead.model';
import { GroupMessage } from './groupMessages.model';
import { User } from '../users/users.model';
import { areFriends, PUBLIC_USER_FIELDS } from '../friends/friends.service';
import { toPublicUser, type LeanPublicUser } from '../conversations/conversations.service';
import { ApiError } from '../../lib/ApiError';

const MAX_MEMBERS = 50;
const DEFAULT_CHANNEL_NAME = 'general';
const DEFAULT_VOICE_CHANNEL_NAME = 'general';

export function assertMember(group: { members: { user: Types.ObjectId }[] }, userId: string): void {
  const isMember = group.members.some((m) => m.user.toString() === userId);
  if (!isMember) {
    throw new ApiError(403, 'No formás parte de este grupo');
  }
}

export function assertOwner(group: { owner: Types.ObjectId }, userId: string): void {
  if (group.owner.toString() !== userId) {
    throw new ApiError(403, 'Solo el dueño del grupo puede hacer esto');
  }
}

function isOwnerOrAdmin(group: { owner: Types.ObjectId; members: { user: Types.ObjectId; role: string }[] }, userId: string): boolean {
  if (group.owner.toString() === userId) {
    return true;
  }
  return group.members.some((m) => m.user.toString() === userId && m.role === 'admin');
}

export function assertOwnerOrAdmin(
  group: { owner: Types.ObjectId; members: { user: Types.ObjectId; role: string }[] },
  userId: string,
): void {
  if (!isOwnerOrAdmin(group, userId)) {
    throw new ApiError(403, 'Solo el dueño o un administrador del grupo puede hacer esto');
  }
}

export async function createGroup(
  ownerId: string,
  name: string,
  memberIds: string[],
): Promise<{ group: GroupDocument; defaultChannel: ChannelDocument; defaultVoiceChannel: ChannelDocument; invites: GroupInviteDocument[] }> {
  const uniqueMemberIds = [...new Set(memberIds)].filter((id) => id !== ownerId);

  const friendChecks = await Promise.all(uniqueMemberIds.map((id) => areFriends(ownerId, id)));
  if (friendChecks.some((isFriend) => !isFriend)) {
    throw new ApiError(400, 'Solo podés agregar amigos al grupo');
  }

  if (uniqueMemberIds.length + 1 > MAX_MEMBERS) {
    throw new ApiError(400, `Los grupos tienen un máximo de ${MAX_MEMBERS} miembros`);
  }

  // Solo quien crea el grupo entra directo: a los demás se los invita, y recién son
  // miembros de verdad si aceptan (ver respondGroupInvite).
  const group = await Group.create({
    name,
    owner: ownerId,
    members: [{ user: ownerId, role: 'owner' }],
  });

  const defaultChannel = await Channel.create({ group: group._id, name: DEFAULT_CHANNEL_NAME, type: 'text' });
  const defaultVoiceChannel = await Channel.create({ group: group._id, name: DEFAULT_VOICE_CHANNEL_NAME, type: 'voice' });

  const invites = await Promise.all(
    uniqueMemberIds.map((memberId) => GroupInvite.create({ group: group._id, invitedUser: memberId, invitedBy: ownerId })),
  );

  return { group, defaultChannel, defaultVoiceChannel, invites };
}

export async function listMyGroups(userId: string): Promise<GroupSummary[]> {
  const groups = await Group.find({ 'members.user': userId }).lean();
  if (groups.length === 0) {
    return [];
  }

  const groupIds = groups.map((g) => g._id);
  const [defaultChannels, unreadTotals] = await Promise.all([
    Channel.aggregate<{ _id: Types.ObjectId; channelId: Types.ObjectId }>([
      { $match: { group: { $in: groupIds }, type: 'text' } },
      { $sort: { group: 1, createdAt: 1 } },
      { $group: { _id: '$group', channelId: { $first: '$_id' } } },
    ]),
    GroupChannelRead.aggregate<{ _id: Types.ObjectId; total: number }>([
      { $match: { group: { $in: groupIds }, user: new Types.ObjectId(userId) } },
      { $group: { _id: '$group', total: { $sum: '$unreadCount' } } },
    ]),
  ]);
  const defaultChannelByGroup = new Map(defaultChannels.map((c) => [c._id.toString(), c.channelId.toString()]));
  const unreadByGroup = new Map(unreadTotals.map((u) => [u._id.toString(), u.total]));

  return groups
    .map((g) => {
      const defaultChannelId = defaultChannelByGroup.get(g._id.toString());
      return defaultChannelId ? toGroupSummary(g, defaultChannelId, unreadByGroup.get(g._id.toString()) ?? 0) : null;
    })
    .filter((g): g is GroupSummary => g !== null);
}

export async function getGroupDetail(
  groupId: string,
  userId: string,
): Promise<{
  group: GroupDocument;
  members: GroupMemberDetail[];
  channels: ChannelDocument[];
  channelUnreadCounts: Map<string, number>;
}> {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(404, 'Grupo no encontrado');
  }
  assertMember(group, userId);

  const userIds = group.members.map((m) => m.user);
  const users = await User.find({ _id: { $in: userIds } }).select(PUBLIC_USER_FIELDS).lean<LeanPublicUser[]>();
  const userById = new Map(users.map((u) => [u._id.toString(), u]));

  const members: GroupMemberDetail[] = group.members
    .map((m): GroupMemberDetail | null => {
      const user = userById.get(m.user.toString());
      if (!user) {
        return null;
      }
      return { user: toPublicUser(user), role: m.role, joinedAt: m.joinedAt.toISOString() };
    })
    .filter((m): m is GroupMemberDetail => m !== null);

  const channels = await Channel.find({ group: groupId }).sort({ createdAt: 1 });

  const reads = await GroupChannelRead.find({ user: userId, channel: { $in: channels.map((c) => c._id) } })
    .select('channel unreadCount')
    .lean();
  const channelUnreadCounts = new Map(reads.map((r) => [r.channel.toString(), r.unreadCount]));

  return { group, members, channels, channelUnreadCounts };
}

export async function updateGroup(
  groupId: string,
  userId: string,
  updates: { name?: string; description?: string },
): Promise<GroupDocument> {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(404, 'Grupo no encontrado');
  }
  assertOwnerOrAdmin(group, userId);

  if (updates.name !== undefined) {
    group.name = updates.name;
  }
  if (updates.description !== undefined) {
    group.description = updates.description;
  }
  await group.save();

  return group;
}

export async function updateGroupPhoto(
  groupId: string,
  userId: string,
  photoUrl: string,
): Promise<{ group: GroupDocument; previousPhotoUrl?: string }> {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(404, 'Grupo no encontrado');
  }
  assertOwnerOrAdmin(group, userId);

  const previousPhotoUrl = group.photoUrl;
  group.photoUrl = photoUrl;
  await group.save();

  return { group, previousPhotoUrl };
}

export async function deleteGroup(groupId: string, userId: string): Promise<{ memberIds: string[] }> {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(404, 'Grupo no encontrado');
  }
  assertOwner(group, userId);

  const channelIds = (await Channel.find({ group: groupId }).select('_id').lean()).map((c) => c._id);
  await GroupMessage.deleteMany({ channel: { $in: channelIds } });
  await GroupChannelRead.deleteMany({ group: groupId });
  await Channel.deleteMany({ group: groupId });
  await GroupInvite.deleteMany({ group: groupId });
  const memberIds = group.members.map((m) => m.user.toString());
  await group.deleteOne();

  return { memberIds };
}

/** El dueño invita a un amigo: no lo agrega directo, crea una invitación pendiente que esa persona tiene que aceptar. */
export async function inviteMember(groupId: string, ownerId: string, newUserId: string): Promise<GroupInviteDocument> {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(404, 'Grupo no encontrado');
  }
  assertOwnerOrAdmin(group, ownerId);

  if (group.members.some((m) => m.user.toString() === newUserId)) {
    throw new ApiError(409, 'Ya es miembro del grupo');
  }
  if (await GroupInvite.exists({ group: groupId, invitedUser: newUserId })) {
    throw new ApiError(409, 'Ya tiene una invitación pendiente a este grupo');
  }
  if (!(await areFriends(ownerId, newUserId))) {
    throw new ApiError(400, 'Solo podés agregar amigos al grupo');
  }

  const pendingCount = await GroupInvite.countDocuments({ group: groupId });
  if (group.members.length + pendingCount + 1 > MAX_MEMBERS) {
    throw new ApiError(400, `Los grupos tienen un máximo de ${MAX_MEMBERS} miembros`);
  }

  try {
    return await GroupInvite.create({ group: groupId, invitedUser: newUserId, invitedBy: ownerId });
  } catch (err) {
    // Dos admins invitando a la misma persona casi al mismo tiempo pasan el chequeo de arriba
    // antes de que cualquiera termine de crear la invitación; el índice único {group,invitedUser}
    // frena al segundo, y acá se lo convierte en el mismo 409 prolijo en vez de un 500 crudo.
    if (isDuplicateKeyError(err)) {
      throw new ApiError(409, 'Ya tiene una invitación pendiente a este grupo');
    }
    throw err;
  }
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

export async function respondGroupInvite(
  inviteId: string,
  userId: string,
  status: 'accepted' | 'declined',
): Promise<{ status: 'accepted' | 'declined'; groupId: string; ownerId: string; member?: GroupMemberDetail }> {
  const invite = await GroupInvite.findOne({ _id: inviteId, invitedUser: userId });
  if (!invite) {
    throw new ApiError(404, 'Invitación no encontrada');
  }
  const groupId = invite.group.toString();

  const group = await Group.findById(invite.group);
  if (!group) {
    await invite.deleteOne();
    throw new ApiError(404, 'Este grupo ya no existe');
  }
  const ownerId = group.owner.toString();

  if (status === 'declined') {
    await invite.deleteOne();
    return { status: 'declined', groupId, ownerId };
  }

  // $push condicionado por $expr en vez de "leer length, empujar en memoria, save()": esa
  // secuencia lee el tamaño del array en un momento y confía en que siga siendo así al guardar,
  // así que varias aceptaciones a la vez (grupo casi lleno, varios invitados aceptando juntos)
  // podían pasar todas el chequeo con el mismo snapshot y terminar en un grupo con más miembros
  // que MAX_MEMBERS. Acá el chequeo de cupo y el push son una sola operación atómica en Mongo.
  const userObjectId = new Types.ObjectId(userId);
  const joinedAt = new Date();
  let updatedGroup = await Group.findOneAndUpdate(
    {
      _id: group._id,
      $expr: { $lt: [{ $size: '$members' }, MAX_MEMBERS] },
      'members.user': { $ne: userObjectId },
    },
    { $push: { members: { user: userObjectId, role: 'member', joinedAt } } },
    { new: true },
  );

  if (!updatedGroup) {
    // O ya está lleno, o esta misma invitación se aceptó dos veces en simultáneo (doble click):
    // en ese segundo caso no es un error real, ya se unió, se responde igual que un éxito.
    const alreadyMember = await Group.findOne({ _id: group._id, 'members.user': userObjectId });
    if (!alreadyMember) {
      throw new ApiError(400, 'El grupo ya está lleno');
    }
    updatedGroup = alreadyMember;
  }
  await invite.deleteOne();

  const userDoc = await User.findById(userId).select(PUBLIC_USER_FIELDS).lean<LeanPublicUser>();
  if (!userDoc) {
    throw new ApiError(404, 'Usuario no encontrado');
  }
  const member = updatedGroup.members.find((m) => m.user.toString() === userId);

  return {
    status: 'accepted',
    groupId,
    ownerId,
    member: { user: toPublicUser(userDoc), role: 'member', joinedAt: (member?.joinedAt ?? joinedAt).toISOString() },
  };
}

export async function listMyGroupInvites(userId: string): Promise<GroupInvitePreview[]> {
  const invites = await GroupInvite.find({ invitedUser: userId }).sort({ createdAt: -1 });
  if (invites.length === 0) {
    return [];
  }

  const groupIds = invites.map((i) => i.group);
  const inviterIds = invites.map((i) => i.invitedBy);
  const [groups, inviters] = await Promise.all([
    Group.find({ _id: { $in: groupIds } }).select('name photoUrl').lean(),
    User.find({ _id: { $in: inviterIds } }).select(PUBLIC_USER_FIELDS).lean<LeanPublicUser[]>(),
  ]);
  const groupById = new Map(groups.map((g) => [g._id.toString(), g]));
  const inviterById = new Map(inviters.map((u) => [u._id.toString(), u]));

  return invites
    .map((invite): GroupInvitePreview | null => {
      const group = groupById.get(invite.group.toString());
      const inviter = inviterById.get(invite.invitedBy.toString());
      if (!group || !inviter) {
        return null;
      }
      return {
        id: invite._id.toString(),
        groupId: invite.group.toString(),
        groupName: group.name,
        groupPhotoUrl: group.photoUrl,
        invitedBy: toPublicUser(inviter),
        createdAt: invite.createdAt.toISOString(),
      };
    })
    .filter((i): i is GroupInvitePreview => i !== null);
}

export async function listPendingInvitesForGroup(groupId: string, ownerId: string): Promise<PendingGroupInvite[]> {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(404, 'Grupo no encontrado');
  }
  assertOwnerOrAdmin(group, ownerId);

  const invites = await GroupInvite.find({ group: groupId }).sort({ createdAt: -1 });
  if (invites.length === 0) {
    return [];
  }
  const invitedUsers = await User.find({ _id: { $in: invites.map((i) => i.invitedUser) } })
    .select(PUBLIC_USER_FIELDS)
    .lean<LeanPublicUser[]>();
  const userById = new Map(invitedUsers.map((u) => [u._id.toString(), u]));

  return invites
    .map((invite): PendingGroupInvite | null => {
      const user = userById.get(invite.invitedUser.toString());
      if (!user) {
        return null;
      }
      return { id: invite._id.toString(), invitedUser: toPublicUser(user), createdAt: invite.createdAt.toISOString() };
    })
    .filter((i): i is PendingGroupInvite => i !== null);
}

export async function cancelGroupInvite(groupId: string, ownerId: string, targetUserId: string): Promise<void> {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(404, 'Grupo no encontrado');
  }
  assertOwnerOrAdmin(group, ownerId);

  const result = await GroupInvite.deleteOne({ group: groupId, invitedUser: targetUserId });
  if (result.deletedCount === 0) {
    throw new ApiError(404, 'Invitación no encontrada');
  }
}

export async function removeMember(groupId: string, actorId: string, targetUserId: string): Promise<GroupDocument> {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(404, 'Grupo no encontrado');
  }
  assertOwnerOrAdmin(group, actorId);

  if (targetUserId === group.owner.toString()) {
    throw new ApiError(400, 'No se puede sacar al dueño del grupo');
  }

  const index = group.members.findIndex((m) => m.user.toString() === targetUserId);
  if (index === -1) {
    throw new ApiError(404, 'Ese usuario no es miembro del grupo');
  }

  if (group.members[index].role === 'admin' && group.owner.toString() !== actorId) {
    throw new ApiError(403, 'Solo el dueño puede sacar a un administrador');
  }

  // $pull en vez de splice()+save(): splice() marca el array entero como modificado, así que
  // save() lo pisa completo con el snapshot en memoria. Sacar a dos miembros distintos al mismo
  // tiempo (dos admins actuando a la vez, o esta acción y un "abandonar grupo" cruzándose) podía
  // perder una de las dos bajas, o directamente explotar con un VersionError de Mongoose.
  const updated = await Group.findOneAndUpdate(
    { _id: groupId },
    { $pull: { members: { user: new Types.ObjectId(targetUserId) } } },
    { new: true },
  );
  if (!updated) {
    throw new ApiError(404, 'Grupo no encontrado');
  }
  await GroupChannelRead.deleteMany({ group: groupId, user: targetUserId });

  return updated;
}

/** Solo el dueño puede ascender/descender administradores. */
export async function setMemberRole(
  groupId: string,
  ownerId: string,
  targetUserId: string,
  role: 'admin' | 'member',
): Promise<GroupMemberDetail> {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(404, 'Grupo no encontrado');
  }
  assertOwner(group, ownerId);

  if (targetUserId === group.owner.toString()) {
    throw new ApiError(400, 'El dueño ya administra el grupo');
  }

  const member = group.members.find((m) => m.user.toString() === targetUserId);
  if (!member) {
    throw new ApiError(404, 'Ese usuario no es miembro del grupo');
  }

  // $set posicional en vez de mutar el subdocumento y hacer save() del array completo: así el
  // cambio de rol de esta persona no puede pisar (ni ser pisado por) una baja/alta concurrente
  // de otro miembro distinto en el mismo grupo.
  const updated = await Group.findOneAndUpdate(
    { _id: groupId, 'members.user': targetUserId },
    { $set: { 'members.$.role': role } },
    { new: true },
  );
  if (!updated) {
    throw new ApiError(404, 'Ese usuario no es miembro del grupo');
  }

  const userDoc = await User.findById(targetUserId).select(PUBLIC_USER_FIELDS).lean<LeanPublicUser>();
  if (!userDoc) {
    throw new ApiError(404, 'Usuario no encontrado');
  }

  return { user: toPublicUser(userDoc), role, joinedAt: member.joinedAt.toISOString() };
}

export async function leaveGroup(groupId: string, userId: string): Promise<GroupDocument> {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(404, 'Grupo no encontrado');
  }
  assertMember(group, userId);

  if (group.owner.toString() === userId) {
    throw new ApiError(400, 'El dueño no puede abandonar el grupo, tenés que eliminarlo');
  }

  // Mismo motivo que en removeMember: $pull atómico en vez de splice()+save(), para que
  // abandonar el grupo no pise (ni sea pisado por) otro cambio concurrente en members.
  const updated = await Group.findOneAndUpdate(
    { _id: groupId },
    { $pull: { members: { user: new Types.ObjectId(userId) } } },
    { new: true },
  );
  if (!updated) {
    throw new ApiError(404, 'Grupo no encontrado');
  }
  await GroupChannelRead.deleteMany({ group: groupId, user: userId });

  return updated;
}

export async function createChannel(groupId: string, ownerId: string, name: string, type: ChannelType): Promise<ChannelDocument> {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(404, 'Grupo no encontrado');
  }
  assertOwnerOrAdmin(group, ownerId);

  // El nombre solo tiene que ser único dentro del mismo tipo: un canal de texto y uno de voz
  // pueden llamarse igual (son categorías separadas, igual que en Discord).
  const existing = await Channel.findOne({ group: groupId, type, name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } });
  if (existing) {
    throw new ApiError(409, 'Ya existe un canal con ese nombre');
  }

  return Channel.create({ group: groupId, name, type });
}

export async function renameChannel(groupId: string, channelId: string, actorId: string, name: string): Promise<ChannelDocument> {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(404, 'Grupo no encontrado');
  }
  assertOwnerOrAdmin(group, actorId);

  const channel = await Channel.findOne({ _id: channelId, group: groupId });
  if (!channel) {
    throw new ApiError(404, 'Canal no encontrado');
  }

  const existing = await Channel.findOne({
    group: groupId,
    type: channel.type,
    _id: { $ne: channelId },
    name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
  });
  if (existing) {
    throw new ApiError(409, 'Ya existe un canal con ese nombre');
  }

  channel.name = name;
  await channel.save();

  return channel;
}

export async function deleteChannel(groupId: string, channelId: string, ownerId: string): Promise<void> {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(404, 'Grupo no encontrado');
  }
  assertOwnerOrAdmin(group, ownerId);

  const channel = await Channel.findOne({ _id: channelId, group: groupId });
  if (!channel) {
    throw new ApiError(404, 'Canal no encontrado');
  }

  // Solo hace falta garantizar que quede al menos un canal de TEXTO (ahí vive el historial y
  // los mensajes de sistema del grupo); un grupo puede quedarse sin ningún canal de voz.
  if (channel.type === 'text') {
    const textChannelCount = await Channel.countDocuments({ group: groupId, type: 'text' });
    if (textChannelCount <= 1) {
      throw new ApiError(400, 'No podés eliminar el único canal de texto del grupo');
    }
  }

  await GroupMessage.deleteMany({ channel: channelId });
  await GroupChannelRead.deleteMany({ channel: channelId });
  await channel.deleteOne();
}

export async function getDefaultChannelId(groupId: string): Promise<string> {
  const channel = await Channel.findOne({ group: groupId, type: 'text' }).sort({ createdAt: 1 }).select('_id').lean();
  if (!channel) {
    throw new ApiError(404, 'El grupo no tiene canales de texto');
  }
  return channel._id.toString();
}

export function toGroupSummary(
  group: { _id: Types.ObjectId; name: string; photoUrl?: string; owner: Types.ObjectId; members: { user: Types.ObjectId }[] },
  defaultChannelId: string,
  unreadCount = 0,
): GroupSummary {
  return {
    id: group._id.toString(),
    name: group.name,
    photoUrl: group.photoUrl,
    ownerId: group.owner.toString(),
    memberCount: group.members.length,
    defaultChannelId,
    unreadCount,
  };
}

export async function getMyGroupIds(userId: string): Promise<string[]> {
  const groups = await Group.find({ 'members.user': userId }).select('_id').lean();
  return groups.map((g) => g._id.toString());
}

/** Helper reusado por groupMessages.service: busca el grupo y valida que el usuario sea miembro. */
export async function assertGroupAndMembership(groupId: string, userId: string): Promise<GroupDocument> {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(404, 'Grupo no encontrado');
  }
  assertMember(group, userId);
  return group;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
