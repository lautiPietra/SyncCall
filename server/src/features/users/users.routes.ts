import { Router } from 'express';
import { searchUsersQuerySchema, updateProfileSchema } from '@synccall/shared';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth } from '../../middleware/auth.middleware';
import { avatarLimiter, searchLimiter } from '../../middleware/rateLimit.middleware';
import { uploadImage } from '../../middleware/upload.middleware';
import { validate } from '../../middleware/validate.middleware';
import { searchUsers, updateMe, uploadAvatar, uploadBanner } from './users.controller';

const router = Router();

router.use(requireAuth);

router.get(
  '/search',
  searchLimiter,
  validate(searchUsersQuerySchema, 'query'),
  asyncHandler(searchUsers),
);
router.patch('/me', validate(updateProfileSchema, 'body'), asyncHandler(updateMe));
router.post('/me/avatar', avatarLimiter, uploadImage.single('avatar'), asyncHandler(uploadAvatar));
router.post('/me/banner', avatarLimiter, uploadImage.single('banner'), asyncHandler(uploadBanner));

export default router;
