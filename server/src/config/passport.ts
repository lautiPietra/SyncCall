import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy, type Profile as GitHubProfile } from 'passport-github2';
import type { VerifyCallback } from 'passport-oauth2';
import { config } from './env';
import { findOrCreateOAuthUser } from '../features/users/users.service';

passport.use(
  new GoogleStrategy(
    {
      clientID: config.google.clientId,
      clientSecret: config.google.clientSecret,
      callbackURL: config.google.callbackUrl,
    },
    (_accessToken, _refreshToken, profile, done) => {
      findOrCreateOAuthUser({
        provider: 'google',
        providerId: profile.id,
        displayName: profile.displayName,
        avatarUrl: profile.photos?.[0]?.value ?? '',
      })
        .then((user) => done(null, user))
        .catch((err: unknown) => done(err as Error));
    },
  ),
);

if (config.github.clientId && config.github.clientSecret) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: config.github.clientId,
        clientSecret: config.github.clientSecret,
        callbackURL: config.github.callbackUrl,
      },
      (_accessToken: string, _refreshToken: string, profile: GitHubProfile, done: VerifyCallback) => {
        findOrCreateOAuthUser({
          provider: 'github',
          providerId: profile.id,
          displayName: profile.displayName || profile.username || 'Usuario',
          avatarUrl: profile.photos?.[0]?.value ?? '',
        })
          .then((user) => done(null, user))
          .catch((err: unknown) => done(err as Error));
      },
    ),
  );
}
