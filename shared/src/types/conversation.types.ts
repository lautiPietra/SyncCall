import type { PublicUser } from './user.types';
import type { MessageType } from './message.types';

/**
 * 'pending': el destinatario (requestedBy es la otra persona) todavía no decidió si acepta
 * mensajes de quien inició la conversación. 'declined': el destinatario los rechazó
 * explícitamente. 'accepted': flujo normal, sin restricciones.
 */
export type ConversationRequestStatus = 'pending' | 'accepted' | 'declined';

export interface Conversation {
  id: string;
  participants: [string, string];
  requestStatus: ConversationRequestStatus;
  requestedBy: string | null;
  lastMessageAt: string;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  otherUser: PublicUser;
  lastMessage: { id: string; type: MessageType; content: string; senderId: string; createdAt: string; deleted: boolean } | null;
  unreadCount: number;
  requestStatus: ConversationRequestStatus;
  requestedBy: string | null;
  lastMessageAt: string;
  createdAt: string;
}

export interface ListConversationsResponse {
  conversations: ConversationSummary[];
  nextCursor: string | null;
}

export interface MessageRequestSummary {
  conversationId: string;
  user: PublicUser;
  lastMessage: { type: MessageType; content: string; createdAt: string } | null;
  createdAt: string;
}

export interface ListMessageRequestsResponse {
  requests: MessageRequestSummary[];
}

export interface ConversationStatusResponse {
  exists: boolean;
  conversationId: string | null;
  requestStatus: ConversationRequestStatus | null;
  requestedBy: string | null;
}
