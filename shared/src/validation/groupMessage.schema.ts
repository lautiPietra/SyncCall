import { z } from 'zod';
import { objectIdSchema } from './friend.schema';
import { messageContentSchema } from './message.schema';

export const sendGroupMessageSchema = z.object({ channelId: objectIdSchema, content: messageContentSchema });
export const editGroupMessageSchema = z.object({ messageId: objectIdSchema, content: messageContentSchema });
export const deleteGroupMessageSchema = z.object({ messageId: objectIdSchema });

export const paginateGroupMessagesQuerySchema = z.object({
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type SendGroupMessageInput = z.infer<typeof sendGroupMessageSchema>;
export type EditGroupMessageInput = z.infer<typeof editGroupMessageSchema>;
export type DeleteGroupMessageInput = z.infer<typeof deleteGroupMessageSchema>;
export type PaginateGroupMessagesQueryInput = z.infer<typeof paginateGroupMessagesQuerySchema>;
