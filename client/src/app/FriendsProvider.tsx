import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type {
  Friend,
  FriendRemovedPayload,
  FriendRequestPreview,
  PresenceUpdatePayload,
  ProfileUpdatedPayload,
  PublicUser,
} from '@synccall/shared';
import { SOCKET_EVENTS } from '@synccall/shared';
import { useAuth } from './AuthProvider';
import { ApiClientError } from '../lib/apiClient';
import { socket } from '../lib/socketClient';
import * as friendsApi from '../features/friends/api/friends.api';

interface FriendsContextValue {
  friends: Friend[];
  incoming: FriendRequestPreview[];
  outgoing: FriendRequestPreview[];
  loading: boolean;
  error: string | null;
  pendingIds: Set<string>;
  refresh: () => Promise<void>;
  sendRequest: (toId: string) => Promise<void>;
  acceptRequest: (id: string) => Promise<void>;
  declineRequest: (id: string) => Promise<void>;
  cancelRequest: (id: string) => Promise<void>;
  removeFriend: (friendshipId: string) => Promise<void>;
}

const FriendsContext = createContext<FriendsContextValue | undefined>(undefined);

export function FriendsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;

  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<FriendRequestPreview[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequestPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [friendsRes, requestsRes] = await Promise.all([
        friendsApi.listFriends(),
        friendsApi.listFriendRequests(),
      ]);
      setFriends(friendsRes.friends);
      setIncoming(requestsRes.incoming);
      setOutgoing(requestsRes.outgoing);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudo cargar la información');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userId) {
      void refresh();
    }
  }, [userId, refresh]);

  useEffect(() => {
    function handlePresence(payload: PresenceUpdatePayload): void {
      setFriends((prev) =>
        prev.map((f) =>
          f.user.id === payload.userId
            ? { ...f, user: { ...f.user, isOnline: payload.isOnline, status: payload.status } }
            : f,
        ),
      );
    }

    function handleFriendsChanged(): void {
      void refresh();
    }

    function handleFriendRemoved(payload: FriendRemovedPayload): void {
      setFriends((prev) => prev.filter((f) => f.user.id !== payload.friendId));
    }

    function handleProfileUpdated(payload: ProfileUpdatedPayload): void {
      // El estado online/ausente lo maneja aparte PRESENCE_UPDATE (más al día en tiempo
      // real); acá solo pisamos los datos de perfil en sí (avatar, nombre, bio, etc).
      const patch = (u: PublicUser): PublicUser =>
        u.id === payload.user.id ? { ...payload.user, status: u.status, isOnline: u.isOnline } : u;
      setFriends((prev) => prev.map((f) => (f.user.id === payload.user.id ? { ...f, user: patch(f.user) } : f)));
      setIncoming((prev) => prev.map((r) => (r.user.id === payload.user.id ? { ...r, user: patch(r.user) } : r)));
      setOutgoing((prev) => prev.map((r) => (r.user.id === payload.user.id ? { ...r, user: patch(r.user) } : r)));
    }

    socket.on(SOCKET_EVENTS.PRESENCE_UPDATE, handlePresence);
    socket.on(SOCKET_EVENTS.FRIEND_REQUEST_NEW, handleFriendsChanged);
    socket.on(SOCKET_EVENTS.FRIEND_REQUEST_ACCEPTED, handleFriendsChanged);
    socket.on(SOCKET_EVENTS.FRIEND_REMOVED, handleFriendRemoved);
    socket.on(SOCKET_EVENTS.PROFILE_UPDATED, handleProfileUpdated);

    return () => {
      socket.off(SOCKET_EVENTS.PRESENCE_UPDATE, handlePresence);
      socket.off(SOCKET_EVENTS.FRIEND_REQUEST_NEW, handleFriendsChanged);
      socket.off(SOCKET_EVENTS.FRIEND_REQUEST_ACCEPTED, handleFriendsChanged);
      socket.off(SOCKET_EVENTS.FRIEND_REMOVED, handleFriendRemoved);
      socket.off(SOCKET_EVENTS.PROFILE_UPDATED, handleProfileUpdated);
    };
  }, [refresh]);

  async function withPending(id: string, action: () => Promise<void>): Promise<void> {
    setPendingIds((prev) => new Set(prev).add(id));
    setError(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Algo salió mal, probá de nuevo');
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  const value: FriendsContextValue = {
    friends,
    incoming,
    outgoing,
    loading,
    error,
    pendingIds,
    refresh,
    sendRequest: (toId) => withPending(toId, () => friendsApi.sendFriendRequest(toId)),
    acceptRequest: (id) => withPending(id, () => friendsApi.respondFriendRequest(id, 'accepted')),
    declineRequest: (id) => withPending(id, () => friendsApi.respondFriendRequest(id, 'declined')),
    cancelRequest: (id) => withPending(id, () => friendsApi.cancelFriendRequest(id)),
    removeFriend: (friendshipId) => withPending(friendshipId, () => friendsApi.removeFriend(friendshipId)),
  };

  return <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>;
}

export function useFriends(): FriendsContextValue {
  const ctx = useContext(FriendsContext);
  if (!ctx) {
    throw new Error('useFriends debe usarse dentro de <FriendsProvider>');
  }
  return ctx;
}
