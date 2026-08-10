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

function authed(token: string) {
  return { Cookie: `token=${token}`, 'X-Requested-With': 'XMLHttpRequest' };
}

describe('POST /api/friend-requests', () => {
  it('devuelve 403 sin el header anti-CSRF', async () => {
    const { token } = await createTestUser();
    const { user: other } = await createTestUser();

    const res = await request(app)
      .post('/api/friend-requests')
      .set('Cookie', `token=${token}`)
      .send({ to: other._id.toString() });

    expect(res.status).toBe(403);
  });

  it('crea una solicitud pendiente', async () => {
    const { token } = await createTestUser();
    const { user: other } = await createTestUser();

    const res = await request(app)
      .post('/api/friend-requests')
      .set(authed(token))
      .send({ to: other._id.toString() });

    expect(res.status).toBe(201);
    expect(res.body.request.to.toString()).toBe(other._id.toString());
  });

  it('devuelve 400 si te enviás una solicitud a vos mismo', async () => {
    const { token, user } = await createTestUser();

    const res = await request(app)
      .post('/api/friend-requests')
      .set(authed(token))
      .send({ to: user._id.toString() });

    expect(res.status).toBe(400);
  });

  it('devuelve 409 si ya existe una solicitud pendiente en esa dirección', async () => {
    const { token } = await createTestUser();
    const { user: other } = await createTestUser();

    await request(app).post('/api/friend-requests').set(authed(token)).send({ to: other._id.toString() });
    const res = await request(app)
      .post('/api/friend-requests')
      .set(authed(token))
      .send({ to: other._id.toString() });

    expect(res.status).toBe(409);
  });

  it('devuelve 409 si el otro usuario ya te envió una solicitud (dirección inversa)', async () => {
    const { token: tokenA, user: userA } = await createTestUser();
    const { token: tokenB, user: userB } = await createTestUser();

    const resA = await request(app)
      .post('/api/friend-requests')
      .set(authed(tokenA))
      .send({ to: userB._id.toString() });
    expect(resA.status).toBe(201);

    const resB = await request(app)
      .post('/api/friend-requests')
      .set(authed(tokenB))
      .send({ to: userA._id.toString() });

    expect(resB.status).toBe(409);
  });

  it('devuelve 404 si el usuario destino no existe', async () => {
    const { token } = await createTestUser();

    const res = await request(app)
      .post('/api/friend-requests')
      .set(authed(token))
      .send({ to: '64b000000000000000000000' });

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/friend-requests/:id', () => {
  it('acepta una solicitud y crea la amistad', async () => {
    const { token: tokenA } = await createTestUser();
    const { token: tokenB, user: userB } = await createTestUser();

    const sendRes = await request(app)
      .post('/api/friend-requests')
      .set(authed(tokenA))
      .send({ to: userB._id.toString() });
    const requestId = sendRes.body.request._id ?? sendRes.body.request.id;

    const acceptRes = await request(app)
      .patch(`/api/friend-requests/${requestId}`)
      .set(authed(tokenB))
      .send({ status: 'accepted' });

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.status).toBe('accepted');

    const friendsRes = await request(app).get('/api/friends').set(authed(tokenA));
    expect(friendsRes.body.friends).toHaveLength(1);
  });

  it('rechaza una solicitud y no crea amistad', async () => {
    const { token: tokenA } = await createTestUser();
    const { token: tokenB, user: userB } = await createTestUser();

    const sendRes = await request(app)
      .post('/api/friend-requests')
      .set(authed(tokenA))
      .send({ to: userB._id.toString() });
    const requestId = sendRes.body.request._id ?? sendRes.body.request.id;

    const declineRes = await request(app)
      .patch(`/api/friend-requests/${requestId}`)
      .set(authed(tokenB))
      .send({ status: 'declined' });

    expect(declineRes.status).toBe(200);
    expect(declineRes.body.status).toBe('declined');

    const friendsRes = await request(app).get('/api/friends').set(authed(tokenA));
    expect(friendsRes.body.friends).toHaveLength(0);
  });

  it('devuelve 404 si quien responde no es el destinatario', async () => {
    const { token: tokenA } = await createTestUser();
    const { user: userB } = await createTestUser();
    const { token: tokenC } = await createTestUser();

    const sendRes = await request(app)
      .post('/api/friend-requests')
      .set(authed(tokenA))
      .send({ to: userB._id.toString() });
    const requestId = sendRes.body.request._id ?? sendRes.body.request.id;

    const res = await request(app)
      .patch(`/api/friend-requests/${requestId}`)
      .set(authed(tokenC))
      .send({ status: 'accepted' });

    expect(res.status).toBe(404);
  });
});

describe('GET /api/friends y DELETE /api/friends/:id', () => {
  it('lista amigos con la info pública del otro usuario y permite eliminarlos', async () => {
    const { token: tokenA } = await createTestUser();
    const { token: tokenB, user: userB } = await createTestUser({ username: 'amigob' });

    const sendRes = await request(app)
      .post('/api/friend-requests')
      .set(authed(tokenA))
      .send({ to: userB._id.toString() });
    const requestId = sendRes.body.request._id ?? sendRes.body.request.id;
    await request(app)
      .patch(`/api/friend-requests/${requestId}`)
      .set(authed(tokenB))
      .send({ status: 'accepted' });

    const listRes = await request(app).get('/api/friends').set(authed(tokenA));
    expect(listRes.body.friends).toHaveLength(1);
    expect(listRes.body.friends[0].user.username).toBe('amigob');

    const friendshipId = listRes.body.friends[0].friendshipId;
    const deleteRes = await request(app).delete(`/api/friends/${friendshipId}`).set(authed(tokenA));
    expect(deleteRes.status).toBe(204);

    const afterRes = await request(app).get('/api/friends').set(authed(tokenB));
    expect(afterRes.body.friends).toHaveLength(0);
  });
});
