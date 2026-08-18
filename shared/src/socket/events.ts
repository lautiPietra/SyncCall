import type { PublicUser, UserStatus } from '../types/user.types';
import type { Message, MessageReactionEmoji } from '../types/message.types';
import type { FriendRequest } from '../types/friend.types';
import type { ConversationRequestStatus, MessageRequestSummary } from '../types/conversation.types';
import type { Channel, GroupInvitePreview, GroupMemberDetail, GroupSummary } from '../types/group.types';
import type { GroupMessage } from '../types/groupMessage.types';

export const SOCKET_EVENTS = {
  DM_SEND: 'dm:send',
  DM_TYPING: 'dm:typing',
  DM_ERROR: 'dm:error',
  MESSAGE_NEW: 'message:new',
  MESSAGE_EDIT: 'message:edit',
  MESSAGE_DELETE: 'message:delete',
  MESSAGE_REACT: 'message:react',
  MESSAGE_UNREACT: 'message:unreact',
  MESSAGE_UPDATED: 'message:updated',
  MESSAGE_REQUEST_NEW: 'message-request:new',
  MESSAGE_REQUEST_RESOLVED: 'message-request:resolved',
  PRESENCE_UPDATE: 'presence:update',
  PROFILE_UPDATED: 'profile:updated',
  FRIEND_REQUEST_NEW: 'friend-request:new',
  FRIEND_REQUEST_ACCEPTED: 'friend-request:accepted',
  FRIEND_REQUEST_DECLINED: 'friend-request:declined',
  FRIEND_REQUEST_CANCELLED: 'friend-request:cancelled',
  FRIEND_REMOVED: 'friend:removed',
  CONVERSATION_UPDATED: 'conversation:updated',

  GROUP_MESSAGE_SEND: 'group-message:send',
  GROUP_MESSAGE_EDIT: 'group-message:edit',
  GROUP_MESSAGE_DELETE: 'group-message:delete',
  GROUP_MESSAGE_NEW: 'group-message:new',
  GROUP_MESSAGE_UPDATED: 'group-message:updated',
  GROUP_TYPING: 'group:typing',
  GROUP_ERROR: 'group:error',
  GROUP_CREATED: 'group:created',
  GROUP_UPDATED: 'group:updated',
  GROUP_DELETED: 'group:deleted',
  GROUP_MEMBER_ADDED: 'group:member-added',
  GROUP_MEMBER_REMOVED: 'group:member-removed',
  GROUP_CHANNEL_CREATED: 'group:channel-created',
  GROUP_CHANNEL_DELETED: 'group:channel-deleted',
  GROUP_INVITE_NEW: 'group-invite:new',
  GROUP_INVITE_RESOLVED: 'group-invite:resolved',
  GROUP_INVITE_CANCELLED: 'group-invite:cancelled',
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

export interface MessageEditPayload {
  messageId: string;
  content: string;
}

export interface MessageDeletePayload {
  messageId: string;
}

export interface MessageReactPayload {
  messageId: string;
  emoji: MessageReactionEmoji;
}

export interface MessageUnreactPayload {
  messageId: string;
}

/** El mensaje completo ya actualizado: cubre edición, borrado y cambios de reacciones. */
export interface MessageUpdatedPayload {
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

/** Le llega a quien había enviado la solicitud: el destinatario la rechazó. */
export interface FriendRequestDeclinedPayload {
  requestId: string;
}

/** Le llega a quien había recibido la solicitud: quien la envió la canceló antes de que la respondiera. */
export interface FriendRequestCancelledPayload {
  requestId: string;
}

export interface FriendRemovedPayload {
  friendId: string;
}

export interface ConversationUpdatedPayload {
  conversationId: string;
  lastMessageAt: string;
}

export interface GroupMessageSendPayload {
  channelId: string;
  content: string;
}

export interface GroupMessageEditPayload {
  messageId: string;
  content: string;
}

export interface GroupMessageDeletePayload {
  messageId: string;
}

export interface GroupMessageNewPayload {
  message: GroupMessage;
}

/** Cubre edición y borrado (mismo mensaje ya actualizado), igual que MessageUpdatedPayload para DMs. */
export interface GroupMessageUpdatedPayload {
  message: GroupMessage;
}

export interface GroupTypingPayload {
  channelId: string;
  isTyping: boolean;
  /** Ausente en lo que el cliente emite (el server lo completa): a diferencia de un DM, un
   * canal de grupo puede tener varias personas escribiendo a la vez, así que hace falta saber quién. */
  userId?: string;
}

export interface GroupErrorPayload {
  channelId: string;
  message: string;
}

export interface GroupCreatedPayload {
  group: GroupSummary;
}

export interface GroupUpdatedPayload {
  group: GroupSummary;
}

export interface GroupDeletedPayload {
  groupId: string;
}

export interface GroupMemberAddedPayload {
  groupId: string;
  member: GroupMemberDetail;
}

export interface GroupMemberRemovedPayload {
  groupId: string;
  userId: string;
}

export interface GroupChannelCreatedPayload {
  groupId: string;
  channel: Channel;
}

export interface GroupChannelDeletedPayload {
  groupId: string;
  channelId: string;
}

export interface GroupInviteNewPayload {
  invite: GroupInvitePreview;
}

/** Le llega al dueño del grupo cuando la persona invitada acepta o rechaza. */
export interface GroupInviteResolvedPayload {
  groupId: string;
  userId: string;
  status: 'accepted' | 'declined';
}

/** Le llega a quien fue invitado, si el dueño cancela la invitación antes de que la responda. */
export interface GroupInviteCancelledPayload {
  groupId: string;
}
