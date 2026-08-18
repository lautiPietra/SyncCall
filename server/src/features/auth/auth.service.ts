import jwt from 'jsonwebtoken';
import ms from 'ms';
import type { CookieOptions } from 'express';
import { config } from '../../config/env';
import type { JwtPayload } from './auth.types';

export function issueJwt(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as ms.StringValue,
  });
}

export function verifyJwt(token: string): JwtPayload {
  return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as JwtPayload;
}

export function getAuthCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: ms(config.jwtExpiresIn as ms.StringValue),
    path: '/',
  };
}

export function issueRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwtRefreshSecret, {
    expiresIn: config.jwtRefreshExpiresIn as ms.StringValue,
  });
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtRefreshSecret, { algorithms: ['HS256'] }) as JwtPayload;
}

export function getRefreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: ms(config.jwtRefreshExpiresIn as ms.StringValue),
    path: '/api/auth',
  };
}