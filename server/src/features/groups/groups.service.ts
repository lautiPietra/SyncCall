import { Types } from 'mongoose';
import type { GroupInvitePreview, GroupMemberDetail, GroupSummary, PendingGroupInvite } from '@synccall/shared';
import { Group, Channel } from './groups.model';
import type { ChannelDocument, GroupDocument } from './groups.types';
import { GroupInvite } from './groupInvites.model';
import type { GroupInviteDocument } from './groupInvites.types';
import { GroupMessage } from './groupMessages.model';
import { User } from '../users/users.model';
import { areFriends, PUBLIC_USER_FIELDS } from '../friends/friends.service';
import { toPublicUser, type LeanPublicUser } from '../conversations/conversations.service';
import { ApiError } from '../../lib/ApiError';

const MAX_MEMBERS = 50;
const DEFAULT_CHANNEL_NAME = 'general';

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

export async function createGroup(
  ownerId: string,
  name: string,
  memberIds: string[],
): Promise<{ group: GroupDocument; defaultChannel: ChannelDocument; invites: GroupInviteDocument[] }> {
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

  const defaultChannel = await Channel.create({ group: group._id, name: DEFAULT_CHANNEL_NAME });

  const invites = await Promise.all(
    uniqueMemberIds.map((memberId) => GroupInvite.create({ group: group._id, invitedUser: memberId, invitedBy: ownerId })),
  );

  return { group, defaultChannel, invites };
}

export async function listMyGroups(userId: string): Promise<GroupSummary[]> {
  const groups = await Group.find({ 'members.user': userId }).lean();
  if (groups.length === 0) {
    return [];
  }

  const groupIds = groups.map((g) => g._id);
  const defaultChannels = await Channel.aggregate<{ _id: Types.ObjectId; channelId: Types.ObjectId }>([
    { $match: { group: { $in: groupIds } } },
    { $sort: { group: 1, createdAt: 1 } },
    { $group: { _id: '$group', channelId: { $first: '$_id' } } },
  ]);
  const defaultChannelByGroup = new Map(defaultChannels.map((c) => [c._id.toString(), c.channelId.toString()]));

  return groups
    .map((g) => {
      const defaultChannelId = defaultChannelByGroup.get(g._id.toString());
      return defaultChannelId ? toGroupSummary(g, defaultChannelId) : null;
    })
    .filter((g): g is GroupSummary => g !== null);
}

export async function getGroupDetail(
  groupId: string,
  userId: string,
): Promise<{ group: GroupDocument; members: GroupMemberDetail[]; channels: ChannelDocument[] }> {
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

  return { group, members, channels };
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
  assertOwner(group, userId);

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
  assertOwner(group, userId);

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
  assertOwner(group, ownerId);

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

  return GroupInvite.create({ group: groupId, invitedUser: newUserId, invitedBy: ownerId });
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

  if (group.members.length + 1 > MAX_MEMBERS) {
    throw new ApiError(400, 'El grupo ya está lleno');
  }

  const joinedAt = new Date();
  group.members.push({ user: new Types.ObjectId(userId), role: 'member', joinedAt });
  await group.save();
  await invite.deleteOne();

  const userDoc = await User.findById(userId).select(PUBLIC_USER_FIELDS).lean<LeanPublicUser>();
  if (!userDoc) {
    throw new ApiError(404, 'Usuario no encontrado');
  }

  return {
    status: 'accepted',
    groupId,
    ownerId,
    member: { user: toPublicUser(userDoc), role: 'member', joinedAt: joinedAt.toISOString() },
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
  assertOwner(group, ownerId);

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
  assertOwner(group, ownerId);

  const result = await GroupInvite.deleteOne({ group: groupId, invitedUser: targetUserId });
  if (result.deletedCount === 0) {
    throw new ApiError(404, 'Invitación no encontrada');
  }
}

export async function removeMember(groupId: string, ownerId: string, targetUserId: string): Promise<GroupDocument> {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(404, 'Grupo no encontrado');
  }
  assertOwner(group, ownerId);

  if (targetUserId === ownerId) {
    throw new ApiError(400, 'No podés quitarte a vos mismo del grupo, usá "Salir del grupo"');
  }

  const index = group.members.findIndex((m) => m.user.toString() === targetUserId);
  if (index === -1) {
    throw new ApiError(404, 'Ese usuario no es miembro del grupo');
  }
  group.members.splice(index, 1);
  await group.save();

  return group;
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

  const index = group.members.findIndex((m) => m.user.toString() === userId);
  group.members.splice(index, 1);
  await group.save();

  return group;
}

export async function createChannel(groupId: string, ownerId: string, name: string): Promise<ChannelDocument> {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(404, 'Grupo no encontrado');
  }
  assertOwner(group, ownerId);

  const existing = await Channel.findOne({ group: groupId, name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } });
  if (existing) {
    throw new ApiError(409, 'Ya existe un canal con ese nombre');
  }

  return Channel.create({ group: groupId, name });
}

export async function deleteChannel(groupId: string, channelId: string, ownerId: string): Promise<void> {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(404, 'Grupo no encontrado');
  }
  assertOwner(group, ownerId);

  const channel = await Channel.findOne({ _id: channelId, group: groupId });
  if (!channel) {
    throw new ApiError(404, 'Canal no encontrado');
  }

  const channelCount = await Channel.countDocuments({ group: groupId });
  if (channelCount <= 1) {
    throw new ApiError(400, 'No podés eliminar el único canal del grupo');
  }

  await GroupMessage.deleteMany({ channel: channelId });
  await channel.deleteOne();
}

export async function getDefaultChannelId(groupId: string): Promise<string> {
  const channel = await Channel.findOne({ group: groupId }).sort({ createdAt: 1 }).select('_id').lean();
  if (!channel) {
    throw new ApiError(404, 'El grupo no tiene canales');
  }
  return channel._id.toString();
}

export function toGroupSummary(
  group: { _id: Types.ObjectId; name: string; photoUrl?: string; owner: Types.ObjectId; members: { user: Types.ObjectId }[] },
  defaultChannelId: string,
): GroupSummary {
  return {
    id: group._id.toString(),
    name: group.name,
    photoUrl: group.photoUrl,
    ownerId: group.owner.toString(),
    memberCount: group.members.length,
    defaultChannelId,
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
