import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  SOCKET_EVENTS,
  type PresenceUpdatePayload,
  type ProfileUpdatedPayload,
  type PublicUser,
  type UserStatus,
} from '@synccall/shared';
import { config } from '../config/env';
import { verifyJwt } from '../features/auth/auth.service';
import { User } from '../features/users/users.model';
import { getFriendIds } from '../features/friends/friends.service';
import { addConnection, isUserOnline, removeConnection } from './presence';
import { setIo, tryGetIo } from './io';
import { clearMessageBucket } from './messageRateLimiter';
import { registerMessageHandlers } from './handlers/message.handlers';

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) {
    return undefined;
  }
  const match = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

export function initSocket(httpServer: HttpServer): void {
  const io = new Server(httpServer, {
    cors: { origin: config.clientOrigin, credentials: true },
  });

  io.use((socket, next) => {
    try {
      const token = readCookie(socket.handshake.headers.cookie, 'token');
      if (!token) {
        throw new Error('No autenticado');
      }
      socket.data.userId = verifyJwt(token).sub;
      next();
    } catch {
      next(new Error('No autenticado'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;
    void socket.join(`user:${userId}`);
    void handleConnect(io, userId, socket.id);
    registerMessageHandlers(io, socket, userId);

    socket.on('disconnect', () => {
      void handleDisconnect(io, userId, socket.id);
    });
  });

  setIo(io);
}

async function handleConnect(io: Server, userId: string, socketId: string): Promise<void> {
  const justConnected = addConnection(userId, socketId);
  if (!justConnected) {
    return;
  }

  const user = await User.findByIdAndUpdate(userId, { isOnline: true }, { new: true }).select('status');
  await broadcastPresenceToFriends(io, userId, true, user?.status ?? 'online');
}

async function handleDisconnect(io: Server, userId: string, socketId: string): Promise<void> {
  const wentOffline = removeConnection(userId, socketId);
  if (!wentOffline) {
    return;
  }

  clearMessageBucket(userId);
  const user = await User.findByIdAndUpdate(userId, { isOnline: false }, { new: true }).select('status');
  await broadcastPresenceToFriends(io, userId, false, user?.status ?? 'online');
}

async function broadcastPresenceToFriends(
  io: Server,
  userId: string,
  isOnline: boolean,
  status: UserStatus,
): Promise<void> {
  const friendIds = await getFriendIds(userId);
  const payload: PresenceUpdatePayload = { userId, isOnline, status };
  friendIds.forEach((friendId) => {
    io.to(`user:${friendId}`).emit(SOCKET_EVENTS.PRESENCE_UPDATE, payload);
  });
}

/** Avisa a los amigos que la preferencia de estado (online/ausente/no molestar/invisible) cambió, sin esperar a una reconexión. */
export async function broadcastStatusChange(userId: string, status: UserStatus): Promise<void> {
  const io = tryGetIo();
  if (!io) {
    return;
  }
  await broadcastPresenceToFriends(io, userId, isUserOnline(userId), status);
}

/** Avisa a los amigos que el perfil (avatar, nombre, bio, banner, marco) cambió, para que lo vean sin recargar. */
export async function broadcastProfileUpdate(userId: string, user: PublicUser): Promise<void> {
  const io = tryGetIo();
  if (!io) {
    return;
  }
  const friendIds = await getFriendIds(userId);
  const payload: ProfileUpdatedPayload = { user };
  friendIds.forEach((friendId) => {
    io.to(`user:${friendId}`).emit(SOCKET_EVENTS.PROFILE_UPDATED, payload);
  });
}
