import { z } from 'zod';

export const messageContentSchema = z.string().trim().min(1).max(2000);

export const sendMessageSchema = z.object({
  content: messageContentSchema,
});

export const paginateMessagesQuerySchema = z.object({
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type PaginateMessagesQueryInput = z.infer<typeof paginateMessagesQuerySchema>;
