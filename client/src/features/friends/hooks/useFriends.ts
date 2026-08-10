import { useCallback, useEffect, useState } from 'react';
import type { Friend, FriendRequestPreview } from '@synccall/shared';
import { ApiClientError } from '../../../lib/apiClient';
import * as friendsApi from '../api/friends.api';

export function useFriends() {
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
    void refresh();
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

  return {
    friends,
    incoming,
    outgoing,
    loading,
    error,
    pendingIds,
    refresh,
    sendRequest: (toId: string) => withPending(toId, () => friendsApi.sendFriendRequest(toId)),
    acceptRequest: (id: string) => withPending(id, () => friendsApi.respondFriendRequest(id, 'accepted')),
    declineRequest: (id: string) => withPending(id, () => friendsApi.respondFriendRequest(id, 'declined')),
    cancelRequest: (id: string) => withPending(id, () => friendsApi.cancelFriendRequest(id)),
    removeFriend: (friendshipId: string) => withPending(friendshipId, () => friendsApi.removeFriend(friendshipId)),
  };
}
