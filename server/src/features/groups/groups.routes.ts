import { Router } from 'express';
import {
  addGroupMemberSchema,
  channelParamsSchema,
  createChannelSchema,
  createGroupSchema,
  groupIdParamsSchema,
  groupMemberParamsSchema,
  inviteIdParamsSchema,
  paginateGroupMessagesQuerySchema,
  respondGroupInviteSchema,
  updateGroupSchema,
} from '@synccall/shared';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth } from '../../middleware/auth.middleware';
import { groupLimiter, groupPhotoLimiter } from '../../middleware/rateLimit.middleware';
import { uploadImage } from '../../middleware/upload.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  cancelInvite,
  createChannel,
  createGroup,
  deleteChannel,
  deleteGroup,
  getGroup,
  getGroupMessages,
  inviteMember,
  leaveGroup,
  listGroupPendingInvites,
  listGroups,
  listInvites,
  removeMember,
  respondInvite,
  updateGroup,
  uploadGroupPhoto,
} from './groups.controller';

export const groupsRouter = Router();
groupsRouter.use(requireAuth);

groupsRouter.get('/', asyncHandler(listGroups));
groupsRouter.post('/', groupLimiter, validate(createGroupSchema, 'body'), asyncHandler(createGroup));
groupsRouter.get('/invites', asyncHandler(listInvites));
groupsRouter.post(
  '/invites/:id/respond',
  validate(inviteIdParamsSchema, 'params'),
  validate(respondGroupInviteSchema, 'body'),
  asyncHandler(respondInvite),
);
groupsRouter.get('/:id', validate(groupIdParamsSchema, 'params'), asyncHandler(getGroup));
groupsRouter.patch(
  '/:id',
  validate(groupIdParamsSchema, 'params'),
  validate(updateGroupSchema, 'body'),
  asyncHandler(updateGroup),
);
groupsRouter.post(
  '/:id/photo',
  validate(groupIdParamsSchema, 'params'),
  groupPhotoLimiter,
  uploadImage.single('photo'),
  asyncHandler(uploadGroupPhoto),
);
groupsRouter.delete('/:id', validate(groupIdParamsSchema, 'params'), asyncHandler(deleteGroup));
groupsRouter.post(
  '/:id/members',
  validate(groupIdParamsSchema, 'params'),
  validate(addGroupMemberSchema, 'body'),
  asyncHandler(inviteMember),
);
groupsRouter.delete('/:id/members/:userId', validate(groupMemberParamsSchema, 'params'), asyncHandler(removeMember));
groupsRouter.get('/:id/invites', validate(groupIdParamsSchema, 'params'), asyncHandler(listGroupPendingInvites));
groupsRouter.delete('/:id/invites/:userId', validate(groupMemberParamsSchema, 'params'), asyncHandler(cancelInvite));
groupsRouter.post('/:id/leave', validate(groupIdParamsSchema, 'params'), asyncHandler(leaveGroup));
groupsRouter.post(
  '/:id/channels',
  validate(groupIdParamsSchema, 'params'),
  validate(createChannelSchema, 'body'),
  asyncHandler(createChannel),
);
groupsRouter.delete('/:id/channels/:channelId', validate(channelParamsSchema, 'params'), asyncHandler(deleteChannel));
groupsRouter.get(
  '/:id/channels/:channelId/messages',
  validate(channelParamsSchema, 'params'),
  validate(paginateGroupMessagesQuerySchema, 'query'),
  asyncHandler(getGroupMessages),
);
