import { Router } from 'express';
import passport from 'passport';
import { config } from '../../config/env';
import { requireAuth } from '../../middleware/auth.middleware';
import { authLimiter } from '../../middleware/rateLimit.middleware';
import { logout, me, oauthCallback, refresh } from './auth.controller';

const router = Router();

router.get(
  '/google',
  authLimiter,
  passport.authenticate('google', { scope: ['profile'], session: false }),
);
router.get(
  '/google/callback',
  authLimiter,
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${config.clientOrigin}/login`,
  }),
  oauthCallback,
);

router.get('/github', authLimiter, passport.authenticate('github', { session: false }));
router.get(
  '/github/callback',
  authLimiter,
  passport.authenticate('github', {
    session: false,
    failureRedirect: `${config.clientOrigin}/login`,
  }),
  oauthCallback,
);

router.post('/logout', logout);
router.post('/refresh', refresh);
router.get('/me', requireAuth, me);

export default router;
