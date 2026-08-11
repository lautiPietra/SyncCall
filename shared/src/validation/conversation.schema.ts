import { z } from 'zod';
import { objectIdSchema } from './friend.schema';

export const createConversationSchema = z.object({
  friendId: objectIdSchema,
});

export const conversationIdParamsSchema = z.object({
  id: objectIdSchema,
});

export const paginateConversationsQuerySchema = z.object({
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const respondMessageRequestSchema = z.object({
  status: z.enum(['accepted', 'declined']),
});

export const friendIdParamsSchema = z.object({
  friendId: objectIdSchema,
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type PaginateConversationsQueryInput = z.infer<typeof paginateConversationsQuerySchema>;
export type RespondMessageRequestInput = z.infer<typeof respondMessageRequestSchema>;
