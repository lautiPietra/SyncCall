/** userId -> ids de los sockets abiertos (soporta varias pestañas/dispositivos por usuario). */
const onlineSockets = new Map<string, Set<string>>();

/** true si esta era la primera conexión del usuario (recién pasó a estar online). */
export function addConnection(userId: string, socketId: string): boolean {
  const sockets = onlineSockets.get(userId);
  if (!sockets) {
    onlineSockets.set(userId, new Set([socketId]));
    return true;
  }
  sockets.add(socketId);
  return false;
}

/** true si esta era la última conexión del usuario (recién pasó a estar offline). */
export function removeConnection(userId: string, socketId: string): boolean {
  const sockets = onlineSockets.get(userId);
  if (!sockets) {
    return false;
  }
  sockets.delete(socketId);
  if (sockets.size === 0) {
    onlineSockets.delete(userId);
    return true;
  }
  return false;
}

export function isUserOnline(userId: string): boolean {
  return (onlineSockets.get(userId)?.size ?? 0) > 0;
}
