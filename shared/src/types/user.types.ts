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

export const NAMEPLATE_IDS = [
  'none',
  'dragon',
  'serpent',
  'phoenix',
  'wolf',
  'tiger',
  'warrior',
  'galaxy',
  'kraken',
] as const;

export type NameplateId = (typeof NAMEPLATE_IDS)[number];

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bannerUrl?: string;
  bio?: string;
  accentColor: string;
  avatarFrame: AvatarFrameId;
  /** Placa animada que se muestra detrás de tu fila en Mensajes Directos (propia y ajena). */
  nameplate: NameplateId;
  status: UserStatus;
  isOnline: boolean;
  createdAt: string;
}

export type PublicUser = Omit<User, 'isOnline'> & { isOnline: boolean };
