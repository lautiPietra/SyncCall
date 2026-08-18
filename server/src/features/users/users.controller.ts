import type { Request, Response } from 'express';
import type { PublicUser, UpdateProfileInput, SearchUsersQueryInput } from '@synccall/shared';
import type { UploadApiResponse } from 'cloudinary';
import { User } from './users.model';
import type { UserDocument } from './users.types';
import { cloudinary } from '../../config/cloudinary';
import { ApiError } from '../../lib/ApiError';
import { broadcastProfileUpdate, broadcastStatusChange } from '../../sockets';
import { PUBLIC_USER_FIELDS } from '../friends/friends.service';

function toPublicUser(user: UserDocument): PublicUser {
  return {
    id: user._id.toString(),
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bannerUrl: user.bannerUrl,
    bio: user.bio,
    accentColor: user.accentColor,
    avatarFrame: user.avatarFrame,
    nameplate: user.nameplate,
    status: user.status,
    isOnline: user.isOnline,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function updateMe(req: Request, res: Response): Promise<void> {
  const updates = req.body as UpdateProfileInput;

  let user;
  try {
    user = await User.findByIdAndUpdate(req.user!._id, updates, {
      new: true,
      runValidators: true,
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new ApiError(409, 'Ese nombre de usuario ya está en uso');
    }
    throw err;
  }

  if (user) {
    if (updates.status) {
      await broadcastStatusChange(user._id.toString(), user.status);
    }
    // Avatar, nombre, bio, marco, etc.: los amigos los tienen que ver sin recargar la página.
    await broadcastProfileUpdate(user._id.toString(), toPublicUser(user));
  }

  res.json({ user });
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

export async function searchUsers(req: Request, res: Response): Promise<void> {
  const { q } = req.query as unknown as SearchUsersQueryInput;

  const users = await User.find({
    username: { $regex: `^${escapeRegex(q)}`, $options: 'i' },
    _id: { $ne: req.user!._id },
  })
    .select(PUBLIC_USER_FIELDS)
    .limit(20);

  res.json({ users });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function uploadAvatar(req: Request, res: Response): Promise<void> {
  await uploadUserImage(req, res, {
    field: 'avatarUrl',
    folder: 'synccall/avatars',
    errorLabel: 'el avatar anterior',
  });
}

export async function uploadBanner(req: Request, res: Response): Promise<void> {
  await uploadUserImage(req, res, {
    field: 'bannerUrl',
    folder: 'synccall/banners',
    errorLabel: 'el banner anterior',
  });
}

async function uploadUserImage(
  req: Request,
  res: Response,
  options: { field: 'avatarUrl' | 'bannerUrl'; folder: string; errorLabel: string },
): Promise<void> {
  if (!req.file) {
    throw new ApiError(400, 'No se recibió ningún archivo');
  }

  const previousUrl = req.user![options.field];

  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: options.folder, resource_type: 'image' },
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

  const user = await User.findByIdAndUpdate(
    req.user!._id,
    { [options.field]: result.secure_url },
    { new: true },
  );

  const previousPublicId = previousUrl ? extractCloudinaryPublicId(previousUrl) : null;
  if (previousPublicId) {
    try {
      await cloudinary.uploader.destroy(previousPublicId);
    } catch (err) {
      console.error(`No se pudo borrar ${options.errorLabel} de Cloudinary:`, err);
    }
  }

  if (user) {
    await broadcastProfileUpdate(user._id.toString(), toPublicUser(user));
  }

  res.json({ user });
}

function extractCloudinaryPublicId(url: string): string | null {
  const match = url.match(/\/upload\/v\d+\/(.+)\.\w+$/);
  return match ? match[1] : null;
}
