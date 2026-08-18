import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { verifyJwt } from '../features/auth/auth.service';

/**
 * Los límites "por usuario" deben contar por cuenta, no por IP: en dev, varias cuentas
 * de prueba comparten la misma IP y se pisarían entre sí. Se decodifica el JWT directo
 * de la cookie (sin ir a la base) porque estos limiters corren antes que requireAuth.
 */
function userOrIpKey(req: Request): string {
  const token = req.cookies?.token as string | undefined;
  if (token) {
    try {
      return verifyJwt(token).sub;
    } catch {
      // token inválido o vencido: cae al límite por IP
    }
  }
  return req.ip ?? 'unknown';
}

function userKey(req: Request): string {
  return req.user?._id.toString() ?? req.ip ?? 'unknown';
}

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Piso general contra scraping/bots, no un throttle del uso normal: se aplica a TODA la
 * API (app.use antes de montar los routers), incluyendo el historial de mensajes y la
 * lista de conversaciones del chat, que de por sí generan bastante más tráfico legítimo
 * de lectura que el resto de la app. Los endpoints con riesgo real de abuso (búsqueda,
 * solicitudes de amistad, subida de avatar/imágenes) ya tienen su propio límite, más
 * estricto, encima de este.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
});

export const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKey,
});

export const friendRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKey,
});

export const avatarLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKey,
});

export const chatMediaLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKey,
});

export const groupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKey,
});

export const groupPhotoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKey,
});
