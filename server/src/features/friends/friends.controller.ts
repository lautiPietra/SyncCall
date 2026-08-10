import type { Request, Response } from 'express';
import type { RespondFriendRequestInput, SendFriendRequestInput } from '@synccall/shared';
import * as friendsService from './friends.service';

export async function sendRequest(req: Request, res: Response): Promise<void> {
  const { to } = req.body as SendFriendRequestInput;
  const request = await friendsService.sendFriendRequest(req.user!._id.toString(), to);
  res.status(201).json({ request });
}

export async function listRequests(req: Request, res: Response): Promise<void> {
  const result = await friendsService.listFriendRequests(req.user!._id.toString());
  res.json(result);
}

export async function respondRequest(req: Request, res: Response): Promise<void> {
  const { status } = req.body as RespondFriendRequestInput;
  const result = await friendsService.respondFriendRequest(
    req.params.id,
    req.user!._id.toString(),
    status,
  );
  res.json(result);
}

export async function cancelRequest(req: Request, res: Response): Promise<void> {
  await friendsService.cancelFriendRequest(req.params.id, req.user!._id.toString());
  res.status(204).send();
}

export async function listFriends(req: Request, res: Response): Promise<void> {
  const friends = await friendsService.listFriends(req.user!._id.toString());
  res.json({ friends });
}

export async function removeFriend(req: Request, res: Response): Promise<void> {
  await friendsService.removeFriend(req.user!._id.toString(), req.params.id);
  res.status(204).send();
}
