import { Router } from 'express';
import {
  friendRequestIdParamsSchema,
  mutualFriendsParamsSchema,
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
  listMutualFriends,
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
friendsRouter.get(
  '/mutual/:userId',
  validate(mutualFriendsParamsSchema, 'params'),
  asyncHandler(listMutualFriends),
);
friendsRouter.delete('/:id', validate(friendRequestIdParamsSchema, 'params'), asyncHandler(removeFriend));
