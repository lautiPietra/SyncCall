import type { NextFunction, Request, Response } from 'express';
import { verifyJwt } from '../features/auth/auth.service';
import { User } from '../features/users/users.model';
import { ApiError } from '../lib/ApiError';

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.token as string | undefined;
    if (!token) {
      throw new ApiError(401, 'No autenticado');
    }

    const payload = verifyJwt(token);
    const user = await User.findById(payload.sub);
    if (!user) {
      throw new ApiError(401, 'No autenticado');
    }

    req.user = user;
    next();
  } catch {
    next(new ApiError(401, 'No autenticado'));
  }
}
