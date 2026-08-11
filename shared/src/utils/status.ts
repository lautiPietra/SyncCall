import type { UserStatus } from '../types/user.types';

/**
 * El status elegido por el usuario ("online") solo se muestra como tal si
 * realmente tiene una conexión activa; si no, cae a "idle". Los estados
 * elegidos manualmente (idle/dnd/invisible) se respetan siempre tal cual.
 */
export function getEffectiveStatus(status: UserStatus, isOnline: boolean): UserStatus {
  if (status === 'online') {
    return isOnline ? 'online' : 'idle';
  }
  return status;
}
