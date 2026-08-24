import type { PublicUser } from '@synccall/shared';
import { User } from './users.model';
import type { UserDocument } from './users.types';
import { Group } from '../groups/groups.model';
import { GroupInvite } from '../groups/groupInvites.model';
import * as groupsService from '../groups/groups.service';
import { Friendship } from '../friends/friendship.model';
import { FriendRequest } from '../friends/friendRequest.model';
import { getFriendIds } from '../friends/friends.service';
import { cloudinary } from '../../config/cloudinary';
import { ApiError } from '../../lib/ApiError';

const ACCENT_COLORS = ['#5B6DFF', '#7A5AF8', '#22C55E', '#F59E0B', '#EF4444'];

interface OAuthProfile {
  provider: 'google' | 'github';
  providerId: string;
  displayName: string;
  avatarUrl: string;
}

export async function findOrCreateOAuthUser(profile: OAuthProfile): Promise<UserDocument> {
  const providerField = profile.provider === 'google' ? 'googleId' : 'githubId';

  const existing = await User.findOne({ [providerField]: profile.providerId });
  if (existing) {
    return existing;
  }

  const username = await generateUniqueUsername(profile.displayName);

  return User.create({
    [providerField]: profile.providerId,
    username,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl || defaultAvatarUrl(profile.displayName),
    accentColor: ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)],
  });
}

function defaultAvatarUrl(name: string): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
}

/** Perfil completo para el dueño de la cuenta (incluye `provider` y privacidad, nunca se manda a otros usuarios). */
export function toSelfUser(user: UserDocument): PublicUser & { provider: 'google' | 'github'; allowFriendRequests: boolean; visibleInSearch: boolean } {
  return {
    id: user._id.toString(),
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bannerUrl: user.bannerUrl,
    bio: user.bio,
    accentColor: user.accentColor,
    avatarFrame: user.avatarFrame,
    nameplate: user.nameplate,
    status: user.status,
    isOnline: user.isOnline,
    createdAt: user.createdAt.toISOString(),
    provider: user.googleId ? 'google' : 'github',
    allowFriendRequests: user.allowFriendRequests,
    visibleInSearch: user.visibleInSearch,
  };
}

/**
 * Borra la cuenta: los grupos que sos dueño se eliminan del todo, de los que sos miembro te
 * vas (reusando exactamente el mismo camino que "eliminar grupo" / "abandonar grupo" para que
 * el resto de los usuarios reciba los mismos eventos de socket y mensajes de sistema de siempre).
 * El usuario en sí no se borra: como los mensajes (DM y de grupo) lo referencian por id y se
 * siguen mostrando a otros usuarios, se anonimiza en el lugar y se le saca el acceso.
 */
export async function deleteAccount(userId: string): Promise<{
  deletedGroups: { groupId: string; memberIds: string[] }[];
  leftGroups: { groupId: string; remainingMemberIds: string[] }[];
  removedFriendIds: string[];
  removedFriendRequests: { requestId: string; counterpartId: string }[];
}> {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, 'Usuario no encontrado');
  }

  const [ownedGroups, memberGroups] = await Promise.all([
    Group.find({ owner: userId }).select('_id').lean(),
    Group.find({ 'members.user': userId, owner: { $ne: userId } }).select('_id').lean(),
  ]);

  const deletedGroups: { groupId: string; memberIds: string[] }[] = [];
  for (const g of ownedGroups) {
    const groupId = g._id.toString();
    const { memberIds } = await groupsService.deleteGroup(groupId, userId);
    deletedGroups.push({ groupId, memberIds });
  }

  const leftGroups: { groupId: string; remainingMemberIds: string[] }[] = [];
  for (const g of memberGroups) {
    const groupId = g._id.toString();
    const group = await groupsService.leaveGroup(groupId, userId);
    leftGroups.push({ groupId, remainingMemberIds: group.members.map((m) => m.user.toString()) });
  }

  await GroupInvite.deleteMany({ $or: [{ invitedUser: userId }, { invitedBy: userId }] });

  const friendRequests = await FriendRequest.find({ $or: [{ from: userId }, { to: userId }] })
    .select('_id from to')
    .lean();
  const removedFriendRequests = friendRequests.map((r) => ({
    requestId: r._id.toString(),
    counterpartId: r.from.toString() === userId ? r.to.toString() : r.from.toString(),
  }));
  await FriendRequest.deleteMany({ _id: { $in: friendRequests.map((r) => r._id) } });

  const removedFriendIds = await getFriendIds(userId);
  await Friendship.deleteMany({ $or: [{ userA: userId }, { userB: userId }] });

  const avatarPublicId = extractCloudinaryPublicId(user.avatarUrl);
  const bannerPublicId = user.bannerUrl ? extractCloudinaryPublicId(user.bannerUrl) : null;

  await User.findByIdAndUpdate(userId, {
    $set: {
      username: `usuario-eliminado-${userId}`,
      displayName: 'Usuario eliminado',
      avatarUrl: defaultAvatarUrl('Usuario eliminado'),
      bannerUrl: '',
      bio: '',
      avatarFrame: 'none',
      nameplate: 'none',
      status: 'invisible',
      isOnline: false,
      deletedAt: new Date(),
    },
    $unset: { googleId: '', githubId: '' },
  });

  for (const publicId of [avatarPublicId, bannerPublicId]) {
    if (!publicId) {
      continue;
    }
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (err) {
      console.error('No se pudo borrar una imagen de Cloudinary al eliminar la cuenta:', err);
    }
  }

  return { deletedGroups, leftGroups, removedFriendIds, removedFriendRequests };
}

function extractCloudinaryPublicId(url: string): string | null {
  const match = url.match(/\/upload\/v\d+\/(.+)\.\w+$/);
  return match ? match[1] : null;
}

async function generateUniqueUsername(seed: string): Promise<string> {
  const base = seed.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 16) || 'user';

  let candidate = base;
  let suffix = 0;

  while (await User.exists({ username: candidate })) {
    suffix += 1;
    candidate = `${base}${suffix}`.slice(0, 20);
  }

  return candidate;
}
