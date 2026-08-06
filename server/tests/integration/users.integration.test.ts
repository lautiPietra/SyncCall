import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { User } from '../../src/features/users/users.model';
import { issueJwt } from '../../src/features/auth/auth.service';

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
  return { user, token };
}

describe('GET /api/users/search', () => {
  it('devuelve 401 sin cookie de sesión', async () => {
    const res = await request(app).get('/api/users/search?q=test');
    expect(res.status).toBe(401);
  });

  it('excluye al propio usuario y respeta el prefijo buscado', async () => {
    const { token } = await createTestUser({ username: 'buscador' });
    await createTestUser({ username: 'buscado1' });
    await createTestUser({ username: 'otro' });

    const res = await request(app)
      .get('/api/users/search?q=busca')
      .set('Cookie', `token=${token}`);

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0].username).toBe('buscado1');
  });
});

describe('PATCH /api/users/me', () => {
  it('devuelve 403 sin el header anti-CSRF', async () => {
    const { token } = await createTestUser();

    const res = await request(app)
      .patch('/api/users/me')
      .set('Cookie', `token=${token}`)
      .send({ bio: 'hola' });

    expect(res.status).toBe(403);
  });

  it('actualiza el perfil con el header presente', async () => {
    const { token } = await createTestUser();

    const res = await request(app)
      .patch('/api/users/me')
      .set('Cookie', `token=${token}`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ bio: 'nueva bio', status: 'dnd' });

    expect(res.status).toBe(200);
    expect(res.body.user.bio).toBe('nueva bio');
    expect(res.body.user.status).toBe('dnd');
  });

  it('devuelve 409 si el username ya está en uso', async () => {
    await createTestUser({ username: 'tomado' });
    const { token } = await createTestUser();

    const res = await request(app)
      .patch('/api/users/me')
      .set('Cookie', `token=${token}`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ username: 'tomado' });

    expect(res.status).toBe(409);
  });

  it('devuelve 400 con una bio demasiado larga', async () => {
    const { token } = await createTestUser();

    const res = await request(app)
      .patch('/api/users/me')
      .set('Cookie', `token=${token}`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ bio: 'a'.repeat(200) });

    expect(res.status).toBe(400);
  });
});
