import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/ApiError';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (!MUTATING_METHODS.has(req.method)) {
    next();
    return;
  }

  if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
    next(new ApiError(403, 'Falta el header requerido para esta operación'));
    return;
  }

  next();
}
