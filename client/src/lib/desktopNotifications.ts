export function isDesktopNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getDesktopNotificationPermission(): NotificationPermission | null {
  return isDesktopNotificationSupported() ? Notification.permission : null;
}

export async function requestDesktopNotificationPermission(): Promise<NotificationPermission> {
  if (!isDesktopNotificationSupported()) {
    return 'denied';
  }
  return Notification.requestPermission();
}

/** Solo tiene sentido avisar así cuando ni siquiera tenés la pestaña a la vista: si la app está
 * abierta y visible, el toast/sonido/badge de siempre ya cumplen ese rol. */
export function showDesktopNotification(title: string, options?: NotificationOptions): void {
  if (!isDesktopNotificationSupported() || Notification.permission !== 'granted') {
    return;
  }
  if (document.visibilityState === 'visible') {
    return;
  }
  try {
    new Notification(title, options);
  } catch {
    // Algunos navegadores pueden rechazarla según el contexto; no es crítico, simplemente no se muestra.
  }
}
