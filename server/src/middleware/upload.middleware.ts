import multer from 'multer';
import { ApiError } from '../lib/ApiError';

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(new ApiError(400, 'Formato de imagen no soportado (solo PNG, JPEG o WEBP)'));
      return;
    }
    cb(null, true);
  },
});
