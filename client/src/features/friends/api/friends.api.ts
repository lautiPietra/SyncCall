import type { Friend, FriendRequestsResponse, MutualFriendsResponse, PublicUser } from '@synccall/shared';
import { apiFetch } from '../../../lib/apiClient';

export function searchUsers(q: string): Promise<{ users: PublicUser[] }> {
  return apiFetch(`/users/search?q=${encodeURIComponent(q)}`);
}

export function listFriends(): Promise<{ friends: Friend[] }> {
  return apiFetch('/friends');
}

export function listFriendRequests(): Promise<FriendRequestsResponse> {
  return apiFetch('/friend-requests');
}

export function sendFriendRequest(to: string): Promise<void> {
  return apiFetch('/friend-requests', { method: 'POST', body: { to } });
}

export function respondFriendRequest(id: string, status: 'accepted' | 'declined'): Promise<void> {
  return apiFetch(`/friend-requests/${id}`, { method: 'PATCH', body: { status } });
}

export function cancelFriendRequest(id: string): Promise<void> {
  return apiFetch(`/friend-requests/${id}`, { method: 'DELETE' });
}

export function removeFriend(friendshipId: string): Promise<void> {
  return apiFetch(`/friends/${friendshipId}`, { method: 'DELETE' });
}

export function listMutualFriends(userId: string): Promise<MutualFriendsResponse> {
  return apiFetch(`/friends/mutual/${userId}`);
}
