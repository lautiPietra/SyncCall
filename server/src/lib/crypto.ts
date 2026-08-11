import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { config } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/** Cifrado at-rest: protege el contenido si alguien accede directo a la base de datos (dump, backup filtrado, credencial de solo lectura comprometida). No es cifrado extremo a extremo: el servidor sigue teniendo la clave y puede leer los mensajes en memoria al procesarlos. */
export function encryptText(plaintext: string): EncryptedPayload {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, config.messageEncryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptText(payload: EncryptedPayload): string {
  const decipher = createDecipheriv(ALGORITHM, config.messageEncryptionKey, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
}
