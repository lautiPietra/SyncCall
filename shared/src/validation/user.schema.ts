import { z } from 'zod';
import { AVATAR_FRAME_IDS, NAMEPLATE_IDS } from '../types/user.types';

export const usernameSchema = z
  .string()
  .min(3)
  .max(20)
  .regex(/^[a-zA-Z0-9_.]+$/, 'Solo se permiten letras, números, "_" y "."');

export const bioSchema = z.string().max(190).optional();

export const accentColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color hex inválido');

export const userStatusSchema = z.enum(['online', 'idle', 'dnd', 'invisible']);

export const avatarFrameSchema = z.enum(AVATAR_FRAME_IDS);

export const nameplateSchema = z.enum(NAMEPLATE_IDS);

export const updateProfileSchema = z.object({
  username: usernameSchema.optional(),
  displayName: z.string().min(1).max(32).optional(),
  bio: bioSchema,
  accentColor: accentColorSchema.optional(),
  avatarFrame: avatarFrameSchema.optional(),
  nameplate: nameplateSchema.optional(),
  status: userStatusSchema.optional(),
});

export const searchUsersQuerySchema = z.object({
  q: z.string().min(1).max(20),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type SearchUsersQueryInput = z.infer<typeof searchUsersQuerySchema>;
