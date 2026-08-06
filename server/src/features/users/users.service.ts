import { User } from './users.model';
import type { UserDocument } from './users.types';

const ACCENT_COLORS = ['#5B6DFF', '#7A5AF8', '#22C55E', '#F59E0B', '#EF4444'];

interface OAuthProfile {
  provider: 'google' | 'github';
  providerId: string;
  displayName: string;
  avatarUrl: string;
}

export async function findOrCreateOAuthUser(profile: OAuthProfile): Promise<UserDocument> {
  const providerField = profile.provider === 'google' ? 'googleId' : 'githubId';

  const existing = await User.findOne({ [providerField]: profile.providerId });
  if (existing) {
    return existing;
  }

  const username = await generateUniqueUsername(profile.displayName);

  return User.create({
    [providerField]: profile.providerId,
    username,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl || defaultAvatarUrl(profile.displayName),
    accentColor: ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)],
  });
}

function defaultAvatarUrl(name: string): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
}

async function generateUniqueUsername(seed: string): Promise<string> {
  const base = seed.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 16) || 'user';

  let candidate = base;
  let suffix = 0;

  while (await User.exists({ username: candidate })) {
    suffix += 1;
    candidate = `${base}${suffix}`.slice(0, 20);
  }

  return candidate;
}
