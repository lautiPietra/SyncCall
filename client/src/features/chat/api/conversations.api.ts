import type {
  Conversation,
  ConversationStatusResponse,
  ListConversationsResponse,
  ListMessageRequestsResponse,
  Message,
  MessagesPageResponse,
} from '@synccall/shared';
import { apiFetch } from '../../../lib/apiClient';

export function listConversations(before?: string): Promise<ListConversationsResponse> {
  const query = before ? `?before=${encodeURIComponent(before)}` : '';
  return apiFetch(`/conversations${query}`);
}

export function getOrCreateConversation(friendId: string): Promise<{ conversation: Conversation }> {
  return apiFetch('/conversations', { method: 'POST', body: { friendId } });
}

export function listMessageRequests(): Promise<ListMessageRequestsResponse> {
  return apiFetch('/conversations/requests');
}

export function respondMessageRequest(
  conversationId: string,
  status: 'accepted' | 'declined',
): Promise<{ status: 'accepted' | 'declined' }> {
  return apiFetch(`/conversations/${conversationId}/request`, { method: 'PATCH', body: { status } });
}

export function getConversationStatus(friendId: string): Promise<ConversationStatusResponse> {
  return apiFetch(`/conversations/status/${friendId}`);
}

export function hideConversation(conversationId: string): Promise<void> {
  return apiFetch(`/conversations/${conversationId}/hide`, { method: 'POST' });
}

export function getMessages(conversationId: string, before?: string, limit = 50): Promise<MessagesPageResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) {
    params.set('before', before);
  }
  return apiFetch(`/conversations/${conversationId}/messages?${params.toString()}`);
}

export function markConversationRead(conversationId: string): Promise<void> {
  return apiFetch(`/conversations/${conversationId}/read`, { method: 'POST' });
}

export function uploadMessageImage(conversationId: string, file: File, caption?: string): Promise<{ message: Message }> {
  const formData = new FormData();
  formData.append('image', file);
  if (caption) {
    formData.append('caption', caption);
  }
  return apiFetch(`/conversations/${conversationId}/media`, { method: 'POST', body: formData });
}

export function uploadVoiceMessage(conversationId: string, blob: Blob): Promise<{ message: Message }> {
  const formData = new FormData();
  const extension = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
  formData.append('audio', blob, `voice-message.${extension}`);
  return apiFetch(`/conversations/${conversationId}/voice`, { method: 'POST', body: formData });
}
