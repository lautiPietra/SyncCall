import { z } from 'zod';

export const sendFriendRequestSchema = z.object({
  to: z.string().min(1),
});

export const respondFriendRequestSchema = z.object({
  status: z.enum(['accepted', 'declined']),
});
