import multer from 'multer';
import { ApiError } from '../lib/ApiError';

const ALLOWED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      cb(new ApiError(400, 'Formato de imagen no soportado (solo PNG, JPEG o WEBP)'));
      return;
    }
    cb(null, true);
  },
});

const MAX_AUDIO_SIZE = 15 * 1024 * 1024;

// Sin lista cerrada de mimetypes: MediaRecorder produce distinto formato según navegador
// (audio/webm en Chrome/Firefox, audio/mp4 en Safari) y a veces con parámetros de codec
// (";codecs=opus"), así que alcanza con exigir que arranque con "audio/".
export const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('audio/')) {
      cb(new ApiError(400, 'Formato de audio no soportado'));
      return;
    }
    cb(null, true);
  },
});
