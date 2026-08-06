export type UserStatus = 'online' | 'idle' | 'dnd' | 'invisible';

export const AVATAR_FRAME_IDS = [
  'none',
  'aurora',
  'neon',
  'gold',
  'orbit',
  'ice',
  'flame',
  'cosmic',
  'emerald',
  'rainbow',
] as const;

export type AvatarFrameId = (typeof AVATAR_FRAME_IDS)[number];

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bannerUrl?: string;
  bio?: string;
  accentColor: string;
  avatarFrame: AvatarFrameId;
  status: UserStatus;
  isOnline: boolean;
  createdAt: string;
}

export type PublicUser = Omit<User, 'isOnline'> & { isOnline: boolean };
