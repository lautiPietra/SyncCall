import type { NextFunction, Request, Response } from 'express';
import {
  getAuthCookieOptions,
  getRefreshCookieOptions,
  issueJwt,
  issueRefreshToken,
  verifyRefreshToken,
} from './auth.service';
import { User } from '../users/users.model';
import { config } from '../../config/env';
import { ApiError } from '../../lib/ApiError';

export function oauthCallback(req: Request, res: Response): void {
  const userId = req.user!._id.toString();

  res.cookie('token', issueJwt(userId), getAuthCookieOptions());
  res.cookie('refreshToken', issueRefreshToken(userId), getRefreshCookieOptions());
  res.redirect(config.clientOrigin);
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const refreshToken = req.cookies?.refreshToken as string | undefined;
    if (!refreshToken) {
      throw new ApiError(401, 'No autenticado');
    }

    const { sub: userId } = verifyRefreshToken(refreshToken);

    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(401, 'No autenticado');
    }

    res.cookie('token', issueJwt(userId), getAuthCookieOptions());
    res.status(204).send();
  } catch {
    next(new ApiError(401, 'No autenticado'));
  }
}

export function logout(_req: Request, res: Response): void {
  res.clearCookie('token', { path: '/' });
  res.clearCookie('refreshToken', { path: '/api/auth' });
  res.status(204).send();
}

export function me(req: Request, res: Response): void {
  res.json({ user: req.user });
}
