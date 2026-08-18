import type { Request, Response } from 'express';
import { SOCKET_EVENTS } from '@synccall/shared';
import type {
  FriendRemovedPayload,
  FriendRequestAcceptedPayload,
  FriendRequestCancelledPayload,
  FriendRequestDeclinedPayload,
  FriendRequestNewPayload,
  RespondFriendRequestInput,
  SendFriendRequestInput,
} from '@synccall/shared';
import * as friendsService from './friends.service';
import { tryGetIo } from '../../sockets/io';

export async function sendRequest(req: Request, res: Response): Promise<void> {
  const fromId = req.user!._id.toString();
  const { to } = req.body as SendFriendRequestInput;
  const request = await friendsService.sendFriendRequest(fromId, to);

  const payload: FriendRequestNewPayload = {
    request: {
      id: request._id.toString(),
      from: fromId,
      to,
      status: 'pending',
      createdAt: request.createdAt.toISOString(),
    },
  };
  tryGetIo()?.to(`user:${to}`).emit(SOCKET_EVENTS.FRIEND_REQUEST_NEW, payload);

  res.status(201).json({ request });
}

export async function listRequests(req: Request, res: Response): Promise<void> {
  const result = await friendsService.listFriendRequests(req.user!._id.toString());
  res.json(result);
}

export async function respondRequest(req: Request, res: Response): Promise<void> {
  const { status } = req.body as RespondFriendRequestInput;
  const userId = req.user!._id.toString();
  const result = await friendsService.respondFriendRequest(req.params.id, userId, status);

  if (result.status === 'accepted') {
    const payload: FriendRequestAcceptedPayload = {
      request: {
        id: req.params.id,
        from: result.fromUserId,
        to: userId,
        status: 'accepted',
        createdAt: new Date().toISOString(),
      },
    };
    tryGetIo()?.to(`user:${result.fromUserId}`).emit(SOCKET_EVENTS.FRIEND_REQUEST_ACCEPTED, payload);
  } else {
    const payload: FriendRequestDeclinedPayload = { requestId: req.params.id };
    tryGetIo()?.to(`user:${result.fromUserId}`).emit(SOCKET_EVENTS.FRIEND_REQUEST_DECLINED, payload);
  }

  res.json({ status: result.status });
}

export async function cancelRequest(req: Request, res: Response): Promise<void> {
  const { toUserId } = await friendsService.cancelFriendRequest(req.params.id, req.user!._id.toString());

  const payload: FriendRequestCancelledPayload = { requestId: req.params.id };
  tryGetIo()?.to(`user:${toUserId}`).emit(SOCKET_EVENTS.FRIEND_REQUEST_CANCELLED, payload);

  res.status(204).send();
}

export async function listFriends(req: Request, res: Response): Promise<void> {
  const friends = await friendsService.listFriends(req.user!._id.toString());
  res.json({ friends });
}

export async function removeFriend(req: Request, res: Response): Promise<void> {
  const userId = req.user!._id.toString();
  const { otherUserId } = await friendsService.removeFriend(userId, req.params.id);

  const payload: FriendRemovedPayload = { friendId: userId };
  tryGetIo()?.to(`user:${otherUserId}`).emit(SOCKET_EVENTS.FRIEND_REMOVED, payload);

  res.status(204).send();
}

export async function listMutualFriends(req: Request, res: Response): Promise<void> {
  const { friends, friendsCount } = await friendsService.listMutualFriends(
    req.user!._id.toString(),
    req.params.userId,
  );
  res.json({ friends, friendsCount });
}
