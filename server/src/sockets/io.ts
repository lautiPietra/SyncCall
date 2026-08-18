import type { Server } from 'socket.io';

let ioInstance: Server | null = null;

export function setIo(io: Server): void {
  ioInstance = io;
}

/**
 * Puede ser null: en tests de integración se usa createApp() directo, sin
 * levantar el httpServer ni initSocket(). Los emisores deben tolerar esto.
 */
export function tryGetIo(): Server | null {
  return ioInstance;
}

/**
 * Une todas las pestañas/dispositivos activos de un usuario a la sala de un grupo, en vivo
 * (sin esto, alguien agregado a un grupo mid-sesión no recibiría sus mensajes hasta reconectar).
 * Vive acá (no en sockets/index.ts) para que los controllers de features/groups puedan
 * importarlo sin crear un ciclo (index.ts ya importa, indirectamente, a esos controllers).
 */
export function joinUserToGroupRoom(userId: string, groupId: string): void {
  if (!ioInstance) {
    return;
  }
  for (const socket of ioInstance.sockets.sockets.values()) {
    if (socket.data.userId === userId) {
      void socket.join(`group:${groupId}`);
    }
  }
}

export function leaveUserFromGroupRoom(userId: string, groupId: string): void {
  if (!ioInstance) {
    return;
  }
  for (const socket of ioInstance.sockets.sockets.values()) {
    if (socket.data.userId === userId) {
      void socket.leave(`group:${groupId}`);
    }
  }
}
