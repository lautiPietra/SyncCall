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

export type AuthProvider = 'google' | 'github';

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
  /** Con qué proveedor iniciaste sesión. Solo viaja en las respuestas de "mi" perfil, nunca en PublicUser. */
  provider: AuthProvider;
  /** Preferencias de privacidad: solo importan del lado de quien las tiene (se validan en el
   * server cuando alguien más intenta agregarte/buscarte), nunca se exponen en PublicUser. */
  allowFriendRequests: boolean;
  visibleInSearch: boolean;
}

export type PublicUser = Omit<User, 'isOnline' | 'provider' | 'allowFriendRequests' | 'visibleInSearch'> & { isOnline: boolean };
