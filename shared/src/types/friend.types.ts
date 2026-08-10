import type { PublicUser } from './user.types';

export type FriendRequestStatus = 'pending' | 'accepted' | 'declined';

export interface FriendRequest {
  id: string;
  from: string;
  to: string;
  status: FriendRequestStatus;
  createdAt: string;
}

export interface Friendship {
  id: string;
  userA: string;
  userB: string;
  createdAt: string;
}

export interface Friend {
  friendshipId: string;
  user: PublicUser;
}

export interface FriendRequestPreview {
  id: string;
  user: PublicUser;
  createdAt: string;
}

export interface FriendRequestsResponse {
  incoming: FriendRequestPreview[];
  outgoing: FriendRequestPreview[];
}
