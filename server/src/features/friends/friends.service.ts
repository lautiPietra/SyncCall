import { FriendRequest } from './friendRequest.model';
import { Friendship } from './friendship.model';
import { User } from '../users/users.model';
import type { UserDocument } from '../users/users.types';
import { ApiError } from '../../lib/ApiError';

const PUBLIC_USER_FIELDS = 'username displayName avatarUrl avatarFrame accentColor status isOnline';

export async function sendFriendRequest(fromId: string, toId: string) {
  if (fromId === toId) {
    throw new ApiError(400, 'No podés enviarte una solicitud a vos mismo');
  }

  const toExists = await User.exists({ _id: toId });
  if (!toExists) {
    throw new ApiError(404, 'Usuario no encontrado');
  }

  const alreadyFriends = await Friendship.exists({
    $or: [
      { userA: fromId, userB: toId },
      { userA: toId, userB: fromId },
    ],
  });
  if (alreadyFriends) {
    throw new ApiError(409, 'Ya son amigos');
  }

  const reverseRequest = await FriendRequest.exists({ from: toId, to: fromId });
  if (reverseRequest) {
    throw new ApiError(
      409,
      'Ese usuario ya te envió una solicitud, respondela desde tus solicitudes pendientes',
    );
  }

  try {
    return await FriendRequest.create({ from: fromId, to: toId });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new ApiError(409, 'Ya le enviaste una solicitud a ese usuario');
    }
    throw err;
  }
}

export async function respondFriendRequest(
  requestId: string,
  userId: string,
  status: 'accepted' | 'declined',
): Promise<{ status: 'accepted' | 'declined' }> {
  const request = await FriendRequest.findOne({ _id: requestId, to: userId });
  if (!request) {
    throw new ApiError(404, 'Solicitud no encontrada');
  }

  if (status === 'declined') {
    await request.deleteOne();
    return { status: 'declined' };
  }

  const [userA, userB] = [request.from.toString(), request.to.toString()].sort();
  try {
    await Friendship.create({ userA, userB });
  } catch (err) {
    if (!isDuplicateKeyError(err)) {
      throw err;
    }
  }
  await request.deleteOne();
  return { status: 'accepted' };
}

export async function cancelFriendRequest(requestId: string, userId: string): Promise<void> {
  const result = await FriendRequest.deleteOne({ _id: requestId, from: userId });
  if (result.deletedCount === 0) {
    throw new ApiError(404, 'Solicitud no encontrada');
  }
}

export async function listFriendRequests(userId: string) {
  const [incoming, outgoing] = await Promise.all([
    FriendRequest.find({ to: userId })
      .sort({ createdAt: -1 })
      .populate<{ from: UserDocument }>('from', PUBLIC_USER_FIELDS),
    FriendRequest.find({ from: userId })
      .sort({ createdAt: -1 })
      .populate<{ to: UserDocument }>('to', PUBLIC_USER_FIELDS),
  ]);

  return {
    incoming: incoming.map((r) => ({ id: r._id.toString(), user: r.from, createdAt: r.createdAt })),
    outgoing: outgoing.map((r) => ({ id: r._id.toString(), user: r.to, createdAt: r.createdAt })),
  };
}

export async function listFriends(userId: string) {
  const friendships = await Friendship.find({ $or: [{ userA: userId }, { userB: userId }] })
    .sort({ createdAt: -1 })
    .populate<{ userA: UserDocument }>('userA', PUBLIC_USER_FIELDS)
    .populate<{ userB: UserDocument }>('userB', PUBLIC_USER_FIELDS);

  return friendships.map((f) => {
    const other = f.userA._id.toString() === userId ? f.userB : f.userA;
    return { friendshipId: f._id.toString(), user: other };
  });
}

export async function removeFriend(userId: string, friendshipId: string): Promise<void> {
  const result = await Friendship.deleteOne({
    _id: friendshipId,
    $or: [{ userA: userId }, { userB: userId }],
  });
  if (result.deletedCount === 0) {
    throw new ApiError(404, 'Amistad no encontrada');
  }
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}
