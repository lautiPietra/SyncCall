import type { Request, Response } from 'express';
import type { UploadApiResponse } from 'cloudinary';
import { SOCKET_EVENTS } from '@synccall/shared';
import type {
  AddGroupMemberInput,
  CreateChannelInput,
  CreateGroupInput,
  GroupChannelCreatedPayload,
  GroupChannelDeletedPayload,
  GroupCreatedPayload,
  GroupDeletedPayload,
  GroupDetailResponse,
  GroupInviteCancelledPayload,
  GroupInviteNewPayload,
  GroupInvitePreview,
  GroupInviteResolvedPayload,
  GroupMemberAddedPayload,
  GroupMemberRemovedPayload,
  GroupUpdatedPayload,
  ListGroupInvitesResponse,
  ListGroupsResponse,
  ListPendingGroupInvitesResponse,
  PaginateGroupMessagesQueryInput,
  RespondGroupInviteInput,
  UpdateGroupInput,
} from '@synccall/shared';
import * as groupsService from './groups.service';
import * as groupMessagesService from './groupMessages.service';
import { toPublicUser } from '../conversations/conversations.service';
import { cloudinary } from '../../config/cloudinary';
import { ApiError } from '../../lib/ApiError';
import { joinUserToGroupRoom, leaveUserFromGroupRoom, tryGetIo } from '../../sockets/io';

export async function listGroups(req: Request, res: Response): Promise<void> {
  const groups = await groupsService.listMyGroups(req.user!._id.toString());
  res.json({ groups } satisfies ListGroupsResponse);
}

export async function getGroup(req: Request, res: Response): Promise<void> {
  const userId = req.user!._id.toString();
  const { group, members, channels } = await groupsService.getGroupDetail(req.params.id, userId);

  const response: GroupDetailResponse = {
    group: {
      id: group._id.toString(),
      name: group.name,
      description: group.description,
      photoUrl: group.photoUrl,
      owner: group.owner.toString(),
      members: group.members.map((m) => m.user.toString()),
      createdAt: group.createdAt.toISOString(),
      channels: channels.map((c) => ({
        id: c._id.toString(),
        group: c.group.toString(),
        name: c.name,
        createdAt: c.createdAt.toISOString(),
      })),
    },
    members,
  };
  res.json(response);
}

export async function createGroup(req: Request, res: Response): Promise<void> {
  const ownerId = req.user!._id.toString();
  const { name, memberIds } = req.body as CreateGroupInput;
  const { group, defaultChannel, invites } = await groupsService.createGroup(ownerId, name, memberIds);

  const summary = groupsService.toGroupSummary(group, defaultChannel._id.toString());
  const io = tryGetIo();

  joinUserToGroupRoom(ownerId, group._id.toString());
  io?.to(`user:${ownerId}`).emit(SOCKET_EVENTS.GROUP_CREATED, { group: summary } satisfies GroupCreatedPayload);

  const inviterPublic = toPublicUser(req.user!);
  invites.forEach((invite) => {
    const invitedUserId = invite.invitedUser.toString();
    const invitePreview: GroupInvitePreview = {
      id: invite._id.toString(),
      groupId: group._id.toString(),
      groupName: group.name,
      groupPhotoUrl: group.photoUrl,
      invitedBy: inviterPublic,
      createdAt: invite.createdAt.toISOString(),
    };
    io?.to(`user:${invitedUserId}`).emit(SOCKET_EVENTS.GROUP_INVITE_NEW, { invite: invitePreview } satisfies GroupInviteNewPayload);
  });

  res.status(201).json({ group: summary });
}

export async function updateGroup(req: Request, res: Response): Promise<void> {
  const userId = req.user!._id.toString();
  const updates = req.body as UpdateGroupInput;
  const group = await groupsService.updateGroup(req.params.id, userId, updates);

  const summary = groupsService.toGroupSummary(group, await groupsService.getDefaultChannelId(group._id.toString()));
  tryGetIo()
    ?.to(`group:${group._id.toString()}`)
    .emit(SOCKET_EVENTS.GROUP_UPDATED, { group: summary } satisfies GroupUpdatedPayload);

  res.json({ group: summary });
}

export async function uploadGroupPhoto(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    throw new ApiError(400, 'No se recibió ningún archivo');
  }

  const userId = req.user!._id.toString();
  const groupId = req.params.id;

  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'synccall/groups', resource_type: 'image' },
      (error, uploadResult) => {
        if (error || !uploadResult) {
          reject(error ?? new Error('Error al subir la imagen'));
          return;
        }
        resolve(uploadResult);
      },
    );
    stream.end(req.file!.buffer);
  });

  const { group, previousPhotoUrl } = await groupsService.updateGroupPhoto(groupId, userId, result.secure_url);

  const previousPublicId = previousPhotoUrl ? extractCloudinaryPublicId(previousPhotoUrl) : null;
  if (previousPublicId) {
    try {
      await cloudinary.uploader.destroy(previousPublicId);
    } catch (err) {
      console.error('No se pudo borrar la foto anterior del grupo de Cloudinary:', err);
    }
  }

  const summary = groupsService.toGroupSummary(group, await groupsService.getDefaultChannelId(groupId));
  tryGetIo()
    ?.to(`group:${groupId}`)
    .emit(SOCKET_EVENTS.GROUP_UPDATED, { group: summary } satisfies GroupUpdatedPayload);

  res.json({ group: summary });
}

function extractCloudinaryPublicId(url: string): string | null {
  const match = url.match(/\/upload\/v\d+\/(.+)\.\w+$/);
  return match ? match[1] : null;
}

export async function deleteGroup(req: Request, res: Response): Promise<void> {
  const userId = req.user!._id.toString();
  const groupId = req.params.id;
  const { memberIds } = await groupsService.deleteGroup(groupId, userId);

  const io = tryGetIo();
  memberIds.forEach((uid) => {
    io?.to(`user:${uid}`).emit(SOCKET_EVENTS.GROUP_DELETED, { groupId } satisfies GroupDeletedPayload);
    leaveUserFromGroupRoom(uid, groupId);
  });

  res.status(204).send();
}

export async function inviteMember(req: Request, res: Response): Promise<void> {
  const ownerId = req.user!._id.toString();
  const groupId = req.params.id;
  const { userId: newUserId } = req.body as AddGroupMemberInput;
  const invite = await groupsService.inviteMember(groupId, ownerId, newUserId);

  const { group } = await groupsService.getGroupDetail(groupId, ownerId);
  const invitePreview: GroupInvitePreview = {
    id: invite._id.toString(),
    groupId,
    groupName: group.name,
    groupPhotoUrl: group.photoUrl,
    invitedBy: toPublicUser(req.user!),
    createdAt: invite.createdAt.toISOString(),
  };
  tryGetIo()
    ?.to(`user:${newUserId}`)
    .emit(SOCKET_EVENTS.GROUP_INVITE_NEW, { invite: invitePreview } satisfies GroupInviteNewPayload);

  res.status(201).json({ invited: true });
}

export async function respondInvite(req: Request, res: Response): Promise<void> {
  const userId = req.user!._id.toString();
  const { status } = req.body as RespondGroupInviteInput;
  const result = await groupsService.respondGroupInvite(req.params.id, userId, status);

  const io = tryGetIo();
  io?.to(`user:${result.ownerId}`).emit(SOCKET_EVENTS.GROUP_INVITE_RESOLVED, {
    groupId: result.groupId,
    userId,
    status: result.status,
  } satisfies GroupInviteResolvedPayload);

  if (result.status === 'accepted' && result.member) {
    joinUserToGroupRoom(userId, result.groupId);
    io?.to(`group:${result.groupId}`).emit(SOCKET_EVENTS.GROUP_MEMBER_ADDED, {
      groupId: result.groupId,
      member: result.member,
    } satisfies GroupMemberAddedPayload);

    const defaultChannelId = await groupsService.getDefaultChannelId(result.groupId);
    const { group } = await groupsService.getGroupDetail(result.groupId, userId);
    const summary = groupsService.toGroupSummary(group, defaultChannelId);
    io?.to(`user:${userId}`).emit(SOCKET_EVENTS.GROUP_CREATED, { group: summary } satisfies GroupCreatedPayload);
  }

  res.json({ status: result.status });
}

export async function listInvites(req: Request, res: Response): Promise<void> {
  const invites = await groupsService.listMyGroupInvites(req.user!._id.toString());
  res.json({ invites } satisfies ListGroupInvitesResponse);
}

export async function listGroupPendingInvites(req: Request, res: Response): Promise<void> {
  const ownerId = req.user!._id.toString();
  const invites = await groupsService.listPendingInvitesForGroup(req.params.id, ownerId);
  res.json({ invites } satisfies ListPendingGroupInvitesResponse);
}

export async function cancelInvite(req: Request, res: Response): Promise<void> {
  const ownerId = req.user!._id.toString();
  const groupId = req.params.id;
  const targetUserId = req.params.userId;
  await groupsService.cancelGroupInvite(groupId, ownerId, targetUserId);

  tryGetIo()
    ?.to(`user:${targetUserId}`)
    .emit(SOCKET_EVENTS.GROUP_INVITE_CANCELLED, { groupId } satisfies GroupInviteCancelledPayload);

  res.status(204).send();
}

export async function removeMember(req: Request, res: Response): Promise<void> {
  const ownerId = req.user!._id.toString();
  const groupId = req.params.id;
  const targetUserId = req.params.userId;
  await groupsService.removeMember(groupId, ownerId, targetUserId);

  const io = tryGetIo();
  io?.to(`group:${groupId}`).emit(SOCKET_EVENTS.GROUP_MEMBER_REMOVED, { groupId, userId: targetUserId } satisfies GroupMemberRemovedPayload);
  io?.to(`user:${targetUserId}`).emit(SOCKET_EVENTS.GROUP_DELETED, { groupId } satisfies GroupDeletedPayload);
  leaveUserFromGroupRoom(targetUserId, groupId);

  res.status(204).send();
}

export async function leaveGroup(req: Request, res: Response): Promise<void> {
  const userId = req.user!._id.toString();
  const groupId = req.params.id;
  await groupsService.leaveGroup(groupId, userId);

  const io = tryGetIo();
  io?.to(`group:${groupId}`).emit(SOCKET_EVENTS.GROUP_MEMBER_REMOVED, { groupId, userId } satisfies GroupMemberRemovedPayload);
  io?.to(`user:${userId}`).emit(SOCKET_EVENTS.GROUP_DELETED, { groupId } satisfies GroupDeletedPayload);
  leaveUserFromGroupRoom(userId, groupId);

  res.status(204).send();
}

export async function createChannel(req: Request, res: Response): Promise<void> {
  const ownerId = req.user!._id.toString();
  const groupId = req.params.id;
  const { name } = req.body as CreateChannelInput;
  const channel = await groupsService.createChannel(groupId, ownerId, name);

  const payload: GroupChannelCreatedPayload = {
    groupId,
    channel: { id: channel._id.toString(), group: channel.group.toString(), name: channel.name, createdAt: channel.createdAt.toISOString() },
  };
  tryGetIo()?.to(`group:${groupId}`).emit(SOCKET_EVENTS.GROUP_CHANNEL_CREATED, payload);

  res.status(201).json({ channel: payload.channel });
}

export async function deleteChannel(req: Request, res: Response): Promise<void> {
  const ownerId = req.user!._id.toString();
  const groupId = req.params.id;
  const channelId = req.params.channelId;
  await groupsService.deleteChannel(groupId, channelId, ownerId);

  const payload: GroupChannelDeletedPayload = { groupId, channelId };
  tryGetIo()?.to(`group:${groupId}`).emit(SOCKET_EVENTS.GROUP_CHANNEL_DELETED, payload);

  res.status(204).send();
}

export async function getGroupMessages(req: Request, res: Response): Promise<void> {
  const userId = req.user!._id.toString();
  const { limit, before } = req.query as unknown as PaginateGroupMessagesQueryInput;
  const result = await groupMessagesService.getGroupMessages(req.params.channelId, userId, { limit, before });
  res.json(result);
}
