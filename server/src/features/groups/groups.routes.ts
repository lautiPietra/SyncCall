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
  updateChannelSchema,
  updateGroupSchema,
  updateMemberRoleSchema,
} from '@synccall/shared';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth } from '../../middleware/auth.middleware';
import { chatMediaLimiter, groupLimiter, groupPhotoLimiter } from '../../middleware/rateLimit.middleware';
import { uploadAudio, uploadImage } from '../../middleware/upload.middleware';
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
  markChannelRead,
  removeMember,
  respondInvite,
  setMemberRole,
  updateChannel,
  updateGroup,
  uploadChannelMedia,
  uploadChannelVoice,
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
groupsRouter.patch(
  '/:id/members/:userId/role',
  validate(groupMemberParamsSchema, 'params'),
  validate(updateMemberRoleSchema, 'body'),
  asyncHandler(setMemberRole),
);
groupsRouter.get('/:id/invites', validate(groupIdParamsSchema, 'params'), asyncHandler(listGroupPendingInvites));
groupsRouter.delete('/:id/invites/:userId', validate(groupMemberParamsSchema, 'params'), asyncHandler(cancelInvite));
groupsRouter.post('/:id/leave', validate(groupIdParamsSchema, 'params'), asyncHandler(leaveGroup));
groupsRouter.post(
  '/:id/channels',
  validate(groupIdParamsSchema, 'params'),
  validate(createChannelSchema, 'body'),
  asyncHandler(createChannel),
);
groupsRouter.patch(
  '/:id/channels/:channelId',
  validate(channelParamsSchema, 'params'),
  validate(updateChannelSchema, 'body'),
  asyncHandler(updateChannel),
);
groupsRouter.delete('/:id/channels/:channelId', validate(channelParamsSchema, 'params'), asyncHandler(deleteChannel));
groupsRouter.get(
  '/:id/channels/:channelId/messages',
  validate(channelParamsSchema, 'params'),
  validate(paginateGroupMessagesQuerySchema, 'query'),
  asyncHandler(getGroupMessages),
);
groupsRouter.post(
  '/:id/channels/:channelId/read',
  validate(channelParamsSchema, 'params'),
  asyncHandler(markChannelRead),
);
groupsRouter.post(
  '/:id/channels/:channelId/media',
  validate(channelParamsSchema, 'params'),
  chatMediaLimiter,
  uploadImage.single('image'),
  asyncHandler(uploadChannelMedia),
);
groupsRouter.post(
  '/:id/channels/:channelId/voice',
  validate(channelParamsSchema, 'params'),
  chatMediaLimiter,
  uploadAudio.single('audio'),
  asyncHandler(uploadChannelVoice),
);
