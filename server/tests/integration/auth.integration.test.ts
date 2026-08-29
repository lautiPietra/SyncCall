import { describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { createApp } from '../../src/app';
import { config } from '../../src/config/env';
import { User } from '../../src/features/users/users.model';
import {
  issueJwt,
  issueRefreshToken,
  verifyJwt,
  verifyRefreshToken,
} from '../../src/features/auth/auth.service';
import { findOrCreateOAuthUser } from '../../src/features/users/users.service';

const app = createApp();

async function createTestUser(overrides: Record<string, unknown> = {}) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const user = await User.create({
    googleId: `g-${suffix}`,
    username: `user${suffix}`,
    displayName: 'Test User',
    avatarUrl: 'https://example.com/a.png',
    accentColor: '#5B6DFF',
    ...overrides,
  });
  const token = issueJwt(user._id.toString());
  const refreshToken = issueRefreshToken(user._id.toString());
  return { user, token, refreshToken };
}

function makeAlgNoneToken(payload: Record<string, unknown>): string {
  const b64url = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.`;
}

// authLimiter (10 req/15min) es compartido por /google, /google/callback, /github y
// /github/callback: cualquier test que pegue a estas rutas consume el mismo cupo. Por eso
// el test de rate limiting va al final de este describe y no asume un conteo exacto previo.
describe('Inicio de sesión OAuth', () => {
  it('GET /api/auth/google redirige al consentimiento de Google', async () => {
    const res = await request(app).get('/api/auth/google');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('accounts.google.com');
  });

  it('GET /api/auth/github redirige al consentimiento de GitHub', async () => {
    const res = await request(app).get('/api/auth/github');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('github.com');
  });

  it('bloquea con 429 tras superar el límite de intentos de login', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 15; i++) {
      const res = await request(app).get('/api/auth/google');
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
    // Una vez bloqueado dentro de la ventana, se mantiene bloqueado.
    expect(statuses[statuses.length - 1]).toBe(429);
  });
});

describe('GET /api/auth/me', () => {
  it('devuelve 401 sin cookie', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('devuelve 401 con una cookie de token con formato inválido', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'token=esto-no-es-un-jwt');
    expect(res.status).toBe(401);
  });

  it('devuelve 401 con un JWT firmado con un secreto distinto', async () => {
    const { user } = await createTestUser();
    const forged = jwt.sign({ sub: user._id.toString() }, 'un-secreto-que-no-es-el-real-1234567890');
    const res = await request(app).get('/api/auth/me').set('Cookie', `token=${forged}`);
    expect(res.status).toBe(401);
  });

  it('devuelve 401 con un JWT vencido', async () => {
    const { user } = await createTestUser();
    const expired = jwt.sign({ sub: user._id.toString() }, config.jwtSecret, { expiresIn: '-10s' });
    const res = await request(app).get('/api/auth/me').set('Cookie', `token=${expired}`);
    expect(res.status).toBe(401);
  });

  it('devuelve 401 con un token alg:none (bypass clásico de firma JWT)', async () => {
    const { user } = await createTestUser();
    const noneToken = makeAlgNoneToken({ sub: user._id.toString() });
    const res = await request(app).get('/api/auth/me').set('Cookie', `token=${noneToken}`);
    expect(res.status).toBe(401);
  });

  it('devuelve 401 si el token es en realidad un refresh token (secretos cruzados)', async () => {
    const { user } = await createTestUser();
    const refreshAsAccess = issueRefreshToken(user._id.toString());
    const res = await request(app).get('/api/auth/me').set('Cookie', `token=${refreshAsAccess}`);
    expect(res.status).toBe(401);
  });

  it('devuelve 401 para un id de usuario con formato inválido (no ObjectId)', async () => {
    const malformed = issueJwt('no-soy-un-object-id');
    const res = await request(app).get('/api/auth/me').set('Cookie', `token=${malformed}`);
    expect(res.status).toBe(401);
  });

  it('devuelve 401 para un ObjectId válido que no existe en la base', async () => {
    const ghost = issueJwt(new mongoose.Types.ObjectId().toString());
    const res = await request(app).get('/api/auth/me').set('Cookie', `token=${ghost}`);
    expect(res.status).toBe(401);
  });

  it('devuelve 401 para un usuario que borró su cuenta (deletedAt seteado)', async () => {
    const { user, token } = await createTestUser();
    await User.findByIdAndUpdate(user._id, { deletedAt: new Date() });
    const res = await request(app).get('/api/auth/me').set('Cookie', `token=${token}`);
    expect(res.status).toBe(401);
  });

  it('devuelve el perfil con una sesión válida', async () => {
    const { user, token } = await createTestUser({ username: 'perfilok', githubId: undefined });
    const res = await request(app).get('/api/auth/me').set('Cookie', `token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user._id.toString());
    expect(res.body.user.username).toBe('perfilok');
    expect(res.body.user.provider).toBe('google');
    // Campos internos que nunca deben llegar al cliente.
    expect(res.body.user.googleId).toBeUndefined();
    expect(res.body.user.deletedAt).toBeUndefined();
  });
});

describe('POST /api/auth/refresh', () => {
  it('devuelve 403 sin el header anti-CSRF', async () => {
    const { refreshToken } = await createTestUser();
    const res = await request(app).post('/api/auth/refresh').set('Cookie', `refreshToken=${refreshToken}`);
    expect(res.status).toBe(403);
  });

  it('devuelve 401 sin cookie de refresh', async () => {
    const res = await request(app).post('/api/auth/refresh').set('X-Requested-With', 'XMLHttpRequest');
    expect(res.status).toBe(401);
  });

  it('devuelve 401 con una cookie de refresh corrupta', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', 'refreshToken=basura');
    expect(res.status).toBe(401);
  });

  it('devuelve 401 si se reusa el access token como refresh token', async () => {
    const { token } = await createTestUser();
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', `refreshToken=${token}`);
    expect(res.status).toBe(401);
  });

  it('devuelve 401 con un refresh token vencido', async () => {
    const { user } = await createTestUser();
    const expired = jwt.sign({ sub: user._id.toString() }, config.jwtRefreshSecret, { expiresIn: '-10s' });
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', `refreshToken=${expired}`);
    expect(res.status).toBe(401);
  });

  it('devuelve 401 si el usuario del refresh token borró la cuenta', async () => {
    const { user, refreshToken } = await createTestUser();
    await User.findByIdAndUpdate(user._id, { deletedAt: new Date() });
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', `refreshToken=${refreshToken}`);
    expect(res.status).toBe(401);
  });

  it('emite un nuevo access token válido para el mismo usuario', async () => {
    const { user, refreshToken } = await createTestUser();
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', `refreshToken=${refreshToken}`);
    expect(res.status).toBe(204);

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const tokenCookie = setCookie.find((c) => c.startsWith('token='));
    expect(tokenCookie).toBeDefined();
    const newToken = tokenCookie!.split(';')[0].split('=')[1];
    expect(verifyJwt(newToken).sub).toBe(user._id.toString());
  });
});

describe('POST /api/auth/logout', () => {
  it('devuelve 403 sin el header anti-CSRF', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(403);
  });

  it('limpia las cookies incluso sin estar autenticado', async () => {
    const res = await request(app).post('/api/auth/logout').set('X-Requested-With', 'XMLHttpRequest');
    expect(res.status).toBe(204);

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const tokenCookie = setCookie.find((c) => c.startsWith('token='));
    const refreshCookie = setCookie.find((c) => c.startsWith('refreshToken='));
    expect(tokenCookie).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(refreshCookie).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(refreshCookie).toMatch(/Path=\/api\/auth/);
  });

  it('limpia las cookies estando autenticado', async () => {
    const { token, refreshToken } = await createTestUser();
    const res = await request(app)
      .post('/api/auth/logout')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', [`token=${token}`, `refreshToken=${refreshToken}`]);
    expect(res.status).toBe(204);
  });
});

describe('auth.service: emisión y verificación de JWT', () => {
  it('el token emitido verifica correctamente', () => {
    const token = issueJwt('user-123');
    expect(verifyJwt(token).sub).toBe('user-123');
  });

  it('rechaza un token con la firma alterada', () => {
    const token = issueJwt('user-123');
    const tampered = token.slice(0, -2) + (token.slice(-2) === 'aa' ? 'bb' : 'aa');
    expect(() => verifyJwt(tampered)).toThrow();
  });

  it('rechaza un token con el payload alterado', () => {
    const token = issueJwt('user-123');
    const [h, p, s] = token.split('.');
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    payload.sub = 'user-456';
    const forgedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    expect(() => verifyJwt(`${h}.${forgedPayload}.${s}`)).toThrow();
  });

  it('un access token no verifica como refresh token y viceversa', () => {
    const access = issueJwt('user-123');
    const refresh = issueRefreshToken('user-123');
    expect(() => verifyRefreshToken(access)).toThrow();
    expect(() => verifyJwt(refresh)).toThrow();
  });

  it('rechaza un token alg:none', () => {
    const noneToken = makeAlgNoneToken({ sub: 'user-123' });
    expect(() => verifyJwt(noneToken)).toThrow();
  });
});

describe('findOrCreateOAuthUser', () => {
  it('crea un usuario nuevo con username derivado del displayName', async () => {
    const user = await findOrCreateOAuthUser({
      provider: 'google',
      providerId: 'nuevo-1',
      displayName: 'Juan Pérez',
      avatarUrl: '',
    });
    expect(user.username).toMatch(/^[a-z0-9_.]+$/);
    expect(user.avatarUrl).toBeTruthy();
  });

  it('es idempotente: la misma providerId no crea un segundo usuario', async () => {
    const first = await findOrCreateOAuthUser({
      provider: 'google',
      providerId: 'repetido-1',
      displayName: 'Ana',
      avatarUrl: '',
    });
    const second = await findOrCreateOAuthUser({
      provider: 'google',
      providerId: 'repetido-1',
      displayName: 'Ana',
      avatarUrl: '',
    });
    expect(second._id.toString()).toBe(first._id.toString());
    const count = await User.countDocuments({ googleId: 'repetido-1' });
    expect(count).toBe(1);
  });

  it('genera usernames distintos para displayNames que colisionan', async () => {
    const a = await findOrCreateOAuthUser({
      provider: 'google',
      providerId: 'colision-a',
      displayName: 'Mismo Nombre',
      avatarUrl: '',
    });
    const b = await findOrCreateOAuthUser({
      provider: 'github',
      providerId: 'colision-b',
      displayName: 'Mismo Nombre',
      avatarUrl: '',
    });
    expect(a.username).not.toBe(b.username);
  });

  it('cae al username "user" cuando el displayName no tiene caracteres válidos', async () => {
    const user = await findOrCreateOAuthUser({
      provider: 'google',
      providerId: 'solo-emoji',
      displayName: '🎉🎉🎉',
      avatarUrl: '',
    });
    expect(user.username).toMatch(/^user\d*$/);
  });

  it('trunca displayNames muy largos a un username válido', async () => {
    const user = await findOrCreateOAuthUser({
      provider: 'google',
      providerId: 'nombre-largo',
      displayName: 'a'.repeat(200),
      avatarUrl: '',
    });
    expect(user.username.length).toBeLessThanOrEqual(20);
  });

  it('resuelve la colisión de username incluso con muchos usuarios previos del mismo nombre', async () => {
    const docs = Array.from({ length: 50 }, (_, i) => ({
      username: i === 0 ? 'popular' : `popular${i}`,
      displayName: 'Popular',
      avatarUrl: 'https://example.com/a.png',
      accentColor: '#5B6DFF',
      googleId: `popular-seed-${i}`,
    }));
    await User.insertMany(docs);

    const user = await findOrCreateOAuthUser({
      provider: 'google',
      providerId: 'popular-final',
      displayName: 'Popular',
      avatarUrl: '',
    });
    expect(user.username).toBe('popular50');
    const count = await User.countDocuments({ username: user.username });
    expect(count).toBe(1);
  });

  it('condición de carrera: logins simultáneos con la misma providerId no deberían duplicar ni tirar errores sin manejar', async () => {
    await User.init();
    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        findOrCreateOAuthUser({
          provider: 'google',
          providerId: 'carrera-simultanea',
          displayName: 'Carrera',
          avatarUrl: '',
        }),
      ),
    );

    const rejected = attempts.filter((a) => a.status === 'rejected');
    const count = await User.countDocuments({ googleId: 'carrera-simultanea' });

    expect(count).toBe(1);
    expect(rejected).toHaveLength(0);
  });
});

describe('Capacidad: acceso concurrente de muchos usuarios autenticados', () => {
  it('sostiene cientos de sesiones distintas verificando /me en paralelo', async () => {
    const USER_COUNT = 300;
    const docs = Array.from({ length: USER_COUNT }, (_, i) => ({
      username: `bulk${i}`,
      displayName: `Bulk User ${i}`,
      avatarUrl: 'https://example.com/a.png',
      accentColor: '#5B6DFF',
      googleId: `bulk-g-${i}`,
    }));
    const created = await User.insertMany(docs);

    const start = Date.now();
    const responses = await Promise.all(
      created.map((u) => {
        const token = issueJwt(u._id.toString());
        return request(app).get('/api/auth/me').set('Cookie', `token=${token}`);
      }),
    );
    const elapsedMs = Date.now() - start;

    expect(responses.every((r) => r.status === 200)).toBe(true);
    const returnedIds = new Set(responses.map((r) => r.body.user.id));
    expect(returnedIds.size).toBe(USER_COUNT);
    // No es un límite estricto de producto, es una alarma temprana si esto se degrada mucho.
    expect(elapsedMs).toBeLessThan(20000);
  });
});
