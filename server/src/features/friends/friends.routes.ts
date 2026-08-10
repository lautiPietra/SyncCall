import { Router } from 'express';
import {
  friendRequestIdParamsSchema,
  respondFriendRequestSchema,
  sendFriendRequestSchema,
} from '@synccall/shared';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth } from '../../middleware/auth.middleware';
import { friendRequestLimiter } from '../../middleware/rateLimit.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  cancelRequest,
  listFriends,
  listRequests,
  removeFriend,
  respondRequest,
  sendRequest,
} from './friends.controller';

export const friendRequestsRouter = Router();
friendRequestsRouter.use(requireAuth);

friendRequestsRouter.get('/', asyncHandler(listRequests));
friendRequestsRouter.post(
  '/',
  friendRequestLimiter,
  validate(sendFriendRequestSchema, 'body'),
  asyncHandler(sendRequest),
);
friendRequestsRouter.patch(
  '/:id',
  validate(friendRequestIdParamsSchema, 'params'),
  validate(respondFriendRequestSchema, 'body'),
  asyncHandler(respondRequest),
);
friendRequestsRouter.delete(
  '/:id',
  validate(friendRequestIdParamsSchema, 'params'),
  asyncHandler(cancelRequest),
);

export const friendsRouter = Router();
friendsRouter.use(requireAuth);

friendsRouter.get('/', asyncHandler(listFriends));
friendsRouter.delete('/:id', validate(friendRequestIdParamsSchema, 'params'), asyncHandler(removeFriend));
