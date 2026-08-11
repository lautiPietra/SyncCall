import type { PublicUser, UserStatus } from '../types/user.types';
import type { Message } from '../types/message.types';
import type { FriendRequest } from '../types/friend.types';
import type { ConversationRequestStatus, MessageRequestSummary } from '../types/conversation.types';

export const SOCKET_EVENTS = {
  DM_SEND: 'dm:send',
  DM_TYPING: 'dm:typing',
  DM_ERROR: 'dm:error',
  MESSAGE_NEW: 'message:new',
  MESSAGE_REQUEST_NEW: 'message-request:new',
  MESSAGE_REQUEST_RESOLVED: 'message-request:resolved',
  PRESENCE_UPDATE: 'presence:update',
  PROFILE_UPDATED: 'profile:updated',
  FRIEND_REQUEST_NEW: 'friend-request:new',
  FRIEND_REQUEST_ACCEPTED: 'friend-request:accepted',
  FRIEND_REMOVED: 'friend:removed',
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

export interface DmErrorPayload {
  conversationId: string;
  message: string;
}

export interface MessageNewPayload {
  message: Message;
}

export interface MessageRequestNewPayload {
  request: MessageRequestSummary;
}

export interface MessageRequestResolvedPayload {
  conversationId: string;
  status: ConversationRequestStatus;
  /** El usuario que aceptó/rechazó la solicitud (el destinatario, no quien la inició). */
  resolvedBy: string;
}

export interface PresenceUpdatePayload {
  userId: string;
  isOnline: boolean;
  status: UserStatus;
}

/** Cambios de perfil (avatar, nombre, bio, banner, marco): todo salvo el estado online/ausente. */
export interface ProfileUpdatedPayload {
  user: PublicUser;
}

export interface FriendRequestNewPayload {
  request: FriendRequest;
}

export interface FriendRequestAcceptedPayload {
  request: FriendRequest;
}

export interface FriendRemovedPayload {
  friendId: string;
}

export interface ConversationUpdatedPayload {
  conversationId: string;
  lastMessageAt: string;
}
