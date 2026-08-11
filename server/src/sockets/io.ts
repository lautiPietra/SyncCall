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
