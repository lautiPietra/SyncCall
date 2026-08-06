import { describe, expect, it } from 'vitest';
import { findOrCreateOAuthUser } from './users.service';
import { User } from './users.model';

describe('findOrCreateOAuthUser', () => {
  it('crea un usuario nuevo con username generado a partir del displayName', async () => {
    const user = await findOrCreateOAuthUser({
      provider: 'google',
      providerId: 'g-1',
      displayName: 'Ana Pérez',
      avatarUrl: 'https://example.com/a.png',
    });

    expect(user.username).toBe('anaprez');
    expect(user.googleId).toBe('g-1');
  });

  it('devuelve el mismo usuario si ya existe para ese provider + id', async () => {
    const first = await findOrCreateOAuthUser({
      provider: 'github',
      providerId: 'gh-1',
      displayName: 'Juan',
      avatarUrl: '',
    });

    const second = await findOrCreateOAuthUser({
      provider: 'github',
      providerId: 'gh-1',
      displayName: 'Juan',
      avatarUrl: '',
    });

    expect(second._id.toString()).toBe(first._id.toString());
    expect(await User.countDocuments()).toBe(1);
  });

  it('agrega un sufijo numérico si el username generado ya existe', async () => {
    await findOrCreateOAuthUser({
      provider: 'google',
      providerId: 'g-2',
      displayName: 'Lucas',
      avatarUrl: '',
    });

    const second = await findOrCreateOAuthUser({
      provider: 'github',
      providerId: 'gh-2',
      displayName: 'Lucas',
      avatarUrl: '',
    });

    expect(second.username).toBe('lucas1');
  });
});
