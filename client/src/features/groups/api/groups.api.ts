import type {
  Channel,
  GroupDetailResponse,
  GroupMessagesPageResponse,
  GroupSummary,
  ListGroupInvitesResponse,
  ListGroupsResponse,
  ListPendingGroupInvitesResponse,
} from '@synccall/shared';
import { apiFetch } from '../../../lib/apiClient';

export function listGroups(): Promise<ListGroupsResponse> {
  return apiFetch('/groups');
}

export function getGroup(groupId: string): Promise<GroupDetailResponse> {
  return apiFetch(`/groups/${groupId}`);
}

export function createGroup(name: string, memberIds: string[]): Promise<{ group: GroupSummary }> {
  return apiFetch('/groups', { method: 'POST', body: { name, memberIds } });
}

export function updateGroup(groupId: string, updates: { name?: string; description?: string }): Promise<{ group: GroupSummary }> {
  return apiFetch(`/groups/${groupId}`, { method: 'PATCH', body: updates });
}

export function uploadGroupPhoto(groupId: string, file: File): Promise<{ group: GroupSummary }> {
  const formData = new FormData();
  formData.append('photo', file);
  return apiFetch(`/groups/${groupId}/photo`, { method: 'POST', body: formData });
}

export function deleteGroup(groupId: string): Promise<void> {
  return apiFetch(`/groups/${groupId}`, { method: 'DELETE' });
}

export function inviteMember(groupId: string, userId: string): Promise<void> {
  return apiFetch(`/groups/${groupId}/members`, { method: 'POST', body: { userId } });
}

export function removeMember(groupId: string, userId: string): Promise<void> {
  return apiFetch(`/groups/${groupId}/members/${userId}`, { method: 'DELETE' });
}

export function listInvites(): Promise<ListGroupInvitesResponse> {
  return apiFetch('/groups/invites');
}

export function respondInvite(inviteId: string, status: 'accepted' | 'declined'): Promise<{ status: 'accepted' | 'declined' }> {
  return apiFetch(`/groups/invites/${inviteId}/respond`, { method: 'POST', body: { status } });
}

export function listGroupPendingInvites(groupId: string): Promise<ListPendingGroupInvitesResponse> {
  return apiFetch(`/groups/${groupId}/invites`);
}

export function cancelInvite(groupId: string, userId: string): Promise<void> {
  return apiFetch(`/groups/${groupId}/invites/${userId}`, { method: 'DELETE' });
}

export function leaveGroup(groupId: string): Promise<void> {
  return apiFetch(`/groups/${groupId}/leave`, { method: 'POST' });
}

export function createChannel(groupId: string, name: string): Promise<{ channel: Channel }> {
  return apiFetch(`/groups/${groupId}/channels`, { method: 'POST', body: { name } });
}

export function deleteChannel(groupId: string, channelId: string): Promise<void> {
  return apiFetch(`/groups/${groupId}/channels/${channelId}`, { method: 'DELETE' });
}

export function getChannelMessages(channelId: string, groupId: string, before?: string, limit = 50): Promise<GroupMessagesPageResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) {
    params.set('before', before);
  }
  return apiFetch(`/groups/${groupId}/channels/${channelId}/messages?${params.toString()}`);
}
