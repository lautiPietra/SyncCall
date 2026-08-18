import { Router } from 'express';
import {
  conversationIdParamsSchema,
  createConversationSchema,
  friendIdParamsSchema,
  paginateConversationsQuerySchema,
  paginateMessagesQuerySchema,
  respondMessageRequestSchema,
} from '@synccall/shared';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth } from '../../middleware/auth.middleware';
import { chatMediaLimiter } from '../../middleware/rateLimit.middleware';
import { uploadAudio, uploadImage } from '../../middleware/upload.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  createConversation,
  getMessages,
  getStatus,
  hideConversation,
  listConversations,
  listRequests,
  markRead,
  respondRequest,
  uploadMedia,
  uploadVoiceMessage,
} from './conversations.controller';

export const conversationsRouter = Router();
conversationsRouter.use(requireAuth);

conversationsRouter.get('/', validate(paginateConversationsQuerySchema, 'query'), asyncHandler(listConversations));
conversationsRouter.post('/', validate(createConversationSchema, 'body'), asyncHandler(createConversation));
conversationsRouter.get('/requests', asyncHandler(listRequests));
conversationsRouter.get('/status/:friendId', validate(friendIdParamsSchema, 'params'), asyncHandler(getStatus));
conversationsRouter.get(
  '/:id/messages',
  validate(conversationIdParamsSchema, 'params'),
  validate(paginateMessagesQuerySchema, 'query'),
  asyncHandler(getMessages),
);
conversationsRouter.post('/:id/read', validate(conversationIdParamsSchema, 'params'), asyncHandler(markRead));
conversationsRouter.post('/:id/hide', validate(conversationIdParamsSchema, 'params'), asyncHandler(hideConversation));
conversationsRouter.patch(
  '/:id/request',
  validate(conversationIdParamsSchema, 'params'),
  validate(respondMessageRequestSchema, 'body'),
  asyncHandler(respondRequest),
);
conversationsRouter.post(
  '/:id/media',
  validate(conversationIdParamsSchema, 'params'),
  chatMediaLimiter,
  uploadImage.single('image'),
  asyncHandler(uploadMedia),
);
conversationsRouter.post(
  '/:id/voice',
  validate(conversationIdParamsSchema, 'params'),
  chatMediaLimiter,
  uploadAudio.single('audio'),
  asyncHandler(uploadVoiceMessage),
);
