import { FriendRequest } from './friendRequest.model';
import { Friendship } from './friendship.model';
import { User } from '../users/users.model';
import type { UserDocument } from '../users/users.types';
import { Conversation } from '../conversations/conversations.model';
import { ApiError } from '../../lib/ApiError';

export const PUBLIC_USER_FIELDS =
  'username displayName avatarUrl avatarFrame nameplate accentColor status isOnline bio bannerUrl createdAt';

export async function sendFriendRequest(fromId: string, toId: string) {
  if (fromId === toId) {
    throw new ApiError(400, 'No podés enviarte una solicitud a vos mismo');
  }

  const target = await User.findById(toId).select('allowFriendRequests').lean();
  if (!target) {
    throw new ApiError(404, 'Usuario no encontrado');
  }
  if (target.allowFriendRequests === false) {
    throw new ApiError(403, 'Este usuario no acepta solicitudes de amistad por ahora');
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
    return await FriendRequest.create({ from: fromId, to: toId, pairKey: pairKeyFor(fromId, toId) });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new ApiError(409, 'Ya existe una solicitud pendiente entre ustedes');
    }
    throw err;
  }
}

function pairKeyFor(userId: string, otherUserId: string): string {
  return [userId, otherUserId].sort().join('_');
}

export async function respondFriendRequest(
  requestId: string,
  userId: string,
  status: 'accepted' | 'declined',
): Promise<{ status: 'accepted' | 'declined'; fromUserId: string }> {
  const request = await FriendRequest.findOne({ _id: requestId, to: userId });
  if (!request) {
    throw new ApiError(404, 'Solicitud no encontrada');
  }
  const fromUserId = request.from.toString();

  if (status === 'declined') {
    await request.deleteOne();
    return { status: 'declined', fromUserId };
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
  return { status: 'accepted', fromUserId };
}

export async function cancelFriendRequest(requestId: string, userId: string): Promise<{ toUserId: string }> {
  const request = await FriendRequest.findOneAndDelete({ _id: requestId, from: userId });
  if (!request) {
    throw new ApiError(404, 'Solicitud no encontrada');
  }
  return { toUserId: request.to.toString() };
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
    return { friendshipId: f._id.toString(), user: other, friendsSince: f.createdAt.toISOString() };
  });
}

export async function listMutualFriends(userId: string, otherUserId: string) {
  const isFriend = await Friendship.exists({
    $or: [
      { userA: userId, userB: otherUserId },
      { userA: otherUserId, userB: userId },
    ],
  });
  if (!isFriend) {
    throw new ApiError(403, 'Solo podés ver los amigos en común de tus propios amigos');
  }

  const [myFriendIds, theirFriendIds] = await Promise.all([getFriendIds(userId), getFriendIds(otherUserId)]);
  const theirSet = new Set(theirFriendIds);
  const mutualIds = myFriendIds.filter((id) => theirSet.has(id));

  const friends =
    mutualIds.length === 0 ? [] : await User.find({ _id: { $in: mutualIds } }).select(PUBLIC_USER_FIELDS);

  return { friends, friendsCount: theirFriendIds.length };
}

export async function areFriends(userId: string, otherUserId: string): Promise<boolean> {
  return Boolean(
    await Friendship.exists({
      $or: [
        { userA: userId, userB: otherUserId },
        { userA: otherUserId, userB: userId },
      ],
    }),
  );
}

export async function getFriendIds(userId: string): Promise<string[]> {
  const friendships = await Friendship.find({ $or: [{ userA: userId }, { userB: userId }] }).select(
    'userA userB',
  );
  return friendships.map((f) =>
    f.userA.toString() === userId ? f.userB.toString() : f.userA.toString(),
  );
}

export async function removeFriend(userId: string, friendshipId: string): Promise<{ otherUserId: string }> {
  const friendship = await Friendship.findOne({
    _id: friendshipId,
    $or: [{ userA: userId }, { userB: userId }],
  });
  if (!friendship) {
    throw new ApiError(404, 'Amistad no encontrada');
  }

  const otherUserId =
    friendship.userA.toString() === userId ? friendship.userB.toString() : friendship.userA.toString();
  await friendship.deleteOne();

  // Ya no se pueden mandar mensajes nuevos entre sí (ver messages.service): se oculta el DM de
  // la lista de los dos en vez de dejarlo colgado ahí sin poder reabrirlo ni escribir. Si vuelven
  // a ser amigos y se escriben de nuevo, se reabre solo (getOrCreateConversation ya lo des-oculta).
  const [a, b] = [userId, otherUserId].sort();
  await Conversation.updateOne({ participantA: a, participantB: b }, { $set: { hiddenForA: true, hiddenForB: true } });

  return { otherUserId };
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}
