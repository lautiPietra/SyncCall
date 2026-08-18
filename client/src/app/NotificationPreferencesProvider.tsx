import { createContext, useContext, useState, type ReactNode } from 'react';

const MUTED_ALL_KEY = 'synccall.notifications.mutedAll';
const MUTED_FRIENDS_KEY = 'synccall.notifications.mutedFriendIds';

function readMutedAll(): boolean {
  try {
    return localStorage.getItem(MUTED_ALL_KEY) === 'true';
  } catch {
    return false;
  }
}

function readMutedFriendIds(): Set<string> {
  try {
    const raw = localStorage.getItem(MUTED_FRIENDS_KEY);
    if (!raw) {
      return new Set();
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((v): v is string => typeof v === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

interface NotificationPreferencesContextValue {
  mutedAll: boolean;
  setMutedAll: (muted: boolean) => void;
  mutedFriendIds: Set<string>;
  isFriendMuted: (friendId: string) => boolean;
  setFriendMuted: (friendId: string, muted: boolean) => void;
}

const NotificationPreferencesContext = createContext<NotificationPreferencesContextValue | undefined>(undefined);

/**
 * Preferencias de notificación (silenciar todo / silenciar a un amigo puntual): son solo del
 * dispositivo/navegador actual, viven en localStorage, no hace falta tocar el server para esto.
 */
export function NotificationPreferencesProvider({ children }: { children: ReactNode }) {
  const [mutedAll, setMutedAllState] = useState(readMutedAll);
  const [mutedFriendIds, setMutedFriendIds] = useState<Set<string>>(readMutedFriendIds);

  function setMutedAll(muted: boolean): void {
    setMutedAllState(muted);
    try {
      localStorage.setItem(MUTED_ALL_KEY, String(muted));
    } catch {
      // localStorage puede fallar (modo privado, cuota llena): el silencio no persiste pero sigue funcionando en esta sesión.
    }
  }

  function setFriendMuted(friendId: string, muted: boolean): void {
    setMutedFriendIds((prev) => {
      const next = new Set(prev);
      if (muted) {
        next.add(friendId);
      } else {
        next.delete(friendId);
      }
      try {
        localStorage.setItem(MUTED_FRIENDS_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // ídem: no persiste, pero no rompe la sesión actual.
      }
      return next;
    });
  }

  function isFriendMuted(friendId: string): boolean {
    return mutedFriendIds.has(friendId);
  }

  const value: NotificationPreferencesContextValue = {
    mutedAll,
    setMutedAll,
    mutedFriendIds,
    isFriendMuted,
    setFriendMuted,
  };

  return <NotificationPreferencesContext.Provider value={value}>{children}</NotificationPreferencesContext.Provider>;
}

export function useNotificationPreferences(): NotificationPreferencesContextValue {
  const ctx = useContext(NotificationPreferencesContext);
  if (!ctx) {
    throw new Error('useNotificationPreferences debe usarse dentro de <NotificationPreferencesProvider>');
  }
  return ctx;
}
