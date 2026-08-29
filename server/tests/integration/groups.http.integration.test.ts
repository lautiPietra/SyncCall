import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { User } from '../../src/features/users/users.model';
import { Friendship } from '../../src/features/friends/friendship.model';
import { GroupInvite } from '../../src/features/groups/groupInvites.model';
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

async function makeFriends(userAId: string, userBId: string): Promise<void> {
  const [userA, userB] = [userAId, userBId].sort();
  await Friendship.create({ userA, userB });
}

function authed(token: string) {
  return { Cookie: `token=${token}`, 'X-Requested-With': 'XMLHttpRequest' };
}

describe('POST /api/groups', () => {
  it('devuelve 403 sin el header anti-CSRF', async () => {
    const { token } = await createTestUser();
    const res = await request(app)
      .post('/api/groups')
      .set('Cookie', `token=${token}`)
      .send({ name: 'Grupo', memberIds: [] });
    expect(res.status).toBe(403);
  });

  it('devuelve 400 si memberIds está vacío (hay que invitar al menos a un amigo)', async () => {
    const { token } = await createTestUser();
    const res = await request(app).post('/api/groups').set(authed(token)).send({ name: 'Grupo', memberIds: [] });
    expect(res.status).toBe(400);
  });

  it('devuelve 400 con un nombre vacío o demasiado largo', async () => {
    const { token, user } = await createTestUser();
    const { user: friend } = await createTestUser();
    await makeFriends(user._id.toString(), friend._id.toString());

    const empty = await request(app)
      .post('/api/groups')
      .set(authed(token))
      .send({ name: '', memberIds: [friend._id.toString()] });
    expect(empty.status).toBe(400);

    const tooLong = await request(app)
      .post('/api/groups')
      .set(authed(token))
      .send({ name: 'a'.repeat(51), memberIds: [friend._id.toString()] });
    expect(tooLong.status).toBe(400);
  });

  it('crea el grupo cuando el body es válido y el miembro es amigo', async () => {
    const { token, user } = await createTestUser();
    const { user: friend } = await createTestUser();
    await makeFriends(user._id.toString(), friend._id.toString());

    const res = await request(app)
      .post('/api/groups')
      .set(authed(token))
      .send({ name: 'Grupo válido', memberIds: [friend._id.toString()] });

    expect(res.status).toBe(201);
    expect(res.body.group.memberCount).toBe(1);
  });

  it('devuelve 400 si se intenta agregar a alguien que no es amigo', async () => {
    const { token } = await createTestUser();
    const { user: stranger } = await createTestUser();

    const res = await request(app)
      .post('/api/groups')
      .set(authed(token))
      .send({ name: 'Grupo', memberIds: [stranger._id.toString()] });
    expect(res.status).toBe(400);
  });

  it('bloquea con 429 después de 10 grupos creados en la ventana (groupLimiter)', async () => {
    const { token, user } = await createTestUser();
    const { user: friend } = await createTestUser();
    await makeFriends(user._id.toString(), friend._id.toString());

    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await request(app)
        .post('/api/groups')
        .set(authed(token))
        .send({ name: `Grupo ${i}`, memberIds: [friend._id.toString()] });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });
});

describe('GET /api/groups/:id', () => {
  it('devuelve 403 si no sos miembro del grupo', async () => {
    const { token: ownerToken, user: owner } = await createTestUser();
    const { user: friend } = await createTestUser();
    await makeFriends(owner._id.toString(), friend._id.toString());
    const createRes = await request(app)
      .post('/api/groups')
      .set(authed(ownerToken))
      .send({ name: 'Grupo privado', memberIds: [friend._id.toString()] });

    const { token: outsiderToken } = await createTestUser();
    const res = await request(app).get(`/api/groups/${createRes.body.group.id}`).set(authed(outsiderToken));
    expect(res.status).toBe(403);
  });

  it('devuelve 404 para un grupo inexistente', async () => {
    const { token } = await createTestUser();
    const res = await request(app).get('/api/groups/64b000000000000000000000').set(authed(token));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/groups/:id/channels', () => {
  it('devuelve 400 si el nombre del canal tiene mayúsculas o espacios', async () => {
    const { token, user } = await createTestUser();
    const { user: friend } = await createTestUser();
    await makeFriends(user._id.toString(), friend._id.toString());
    const createRes = await request(app)
      .post('/api/groups')
      .set(authed(token))
      .send({ name: 'Grupo', memberIds: [friend._id.toString()] });
    const groupId = createRes.body.group.id;

    const res = await request(app)
      .post(`/api/groups/${groupId}/channels`)
      .set(authed(token))
      .send({ name: 'Canal Con Espacios', type: 'text' });
    expect(res.status).toBe(400);
  });
});

describe('condición de carrera a nivel HTTP: invitar a la misma persona dos veces a la vez', () => {
  it('una request gana con 201 y el resto recibe 409, nunca un 500', async () => {
    const { token, user } = await createTestUser();
    const { user: other } = await createTestUser();
    await makeFriends(user._id.toString(), other._id.toString());
    const groupRes = await request(app)
      .post('/api/groups')
      .set(authed(token))
      .send({ name: 'Grupo carrera', memberIds: [other._id.toString()] });
    const groupId = groupRes.body.group.id;

    const { user: invitee } = await createTestUser();
    await makeFriends(user._id.toString(), invitee._id.toString());

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        request(app)
          .post(`/api/groups/${groupId}/members`)
          .set(authed(token))
          .send({ userId: invitee._id.toString() }),
      ),
    );
    const statuses = results.map((r) => (r.status === 'fulfilled' ? r.value.status : -1));
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(4);
    expect(statuses.every((s) => s !== 500)).toBe(true);

    const pending = await GroupInvite.countDocuments({ group: groupId, invitedUser: invitee._id });
    expect(pending).toBe(1);
  });
});
