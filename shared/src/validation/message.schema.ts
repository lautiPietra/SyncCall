import { z } from 'zod';
import { MESSAGE_REACTION_EMOJIS } from '../types/message.types';
import { objectIdSchema } from './friend.schema';

export const messageContentSchema = z.string().trim().min(1).max(2000);

export const sendMessageSchema = z.object({
  content: messageContentSchema,
});

export const paginateMessagesQuerySchema = z.object({
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const editMessageSchema = z.object({
  messageId: objectIdSchema,
  content: messageContentSchema,
});

export const deleteMessageSchema = z.object({
  messageId: objectIdSchema,
});

export const reactToMessageSchema = z.object({
  messageId: objectIdSchema,
  emoji: z.enum(MESSAGE_REACTION_EMOJIS),
});

export const unreactToMessageSchema = z.object({
  messageId: objectIdSchema,
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type PaginateMessagesQueryInput = z.infer<typeof paginateMessagesQuerySchema>;
export type EditMessageInput = z.infer<typeof editMessageSchema>;
export type DeleteMessageInput = z.infer<typeof deleteMessageSchema>;
export type ReactToMessageInput = z.infer<typeof reactToMessageSchema>;
export type UnreactToMessageInput = z.infer<typeof unreactToMessageSchema>;
