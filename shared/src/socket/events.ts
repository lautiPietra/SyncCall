import type { UserStatus } from '../types/user.types';
import type { Message } from '../types/message.types';
import type { FriendRequest } from '../types/friend.types';

export const SOCKET_EVENTS = {
  DM_SEND: 'dm:send',
  DM_TYPING: 'dm:typing',
  MESSAGE_NEW: 'message:new',
  PRESENCE_UPDATE: 'presence:update',
  FRIEND_REQUEST_NEW: 'friend-request:new',
  FRIEND_REQUEST_ACCEPTED: 'friend-request:accepted',
  CONVERSATION_UPDATED: 'conversation:updated',
} as const;

export interface DmSendPayload {
  conversationId: string;
  content: string;
}

export interface DmTypingPayload {
  conversationId: string;
  isTyping: boolean;
}

export interface MessageNewPayload {
  message: Message;
}

export interface PresenceUpdatePayload {
  userId: string;
  isOnline: boolean;
  status: UserStatus;
}

export interface FriendRequestNewPayload {
  request: FriendRequest;
}

export interface FriendRequestAcceptedPayload {
  request: FriendRequest;
}

export interface ConversationUpdatedPayload {
  conversationId: string;
  lastMessageAt: string;
}
