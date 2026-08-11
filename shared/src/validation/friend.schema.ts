import { z } from 'zod';

export const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Id inválido');

export const sendFriendRequestSchema = z.object({
  to: objectIdSchema,
});

export const respondFriendRequestSchema = z.object({
  status: z.enum(['accepted', 'declined']),
});

export const friendRequestIdParamsSchema = z.object({
  id: objectIdSchema,
});

export const mutualFriendsParamsSchema = z.object({
  userId: objectIdSchema,
});

export type SendFriendRequestInput = z.infer<typeof sendFriendRequestSchema>;
export type RespondFriendRequestInput = z.infer<typeof respondFriendRequestSchema>;
