import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ProfileUpdatedPayload, User } from '@synccall/shared';
import { SOCKET_EVENTS } from '@synccall/shared';
import { fetchMe, logout as logoutRequest } from '../features/auth/api/auth.api';
import { socket } from '../lib/socketClient';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMe()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // Si guardás tu perfil en otra pestaña/dispositivo, esto lo refleja acá sin recargar
    // (el server también manda este evento de vuelta al propio usuario, no solo a sus amigos).
    function handleProfileUpdated(payload: ProfileUpdatedPayload): void {
      setUser((prev) => (prev && prev.id === payload.user.id ? { ...prev, ...payload.user } : prev));
    }
    socket.on(SOCKET_EVENTS.PROFILE_UPDATED, handleProfileUpdated);
    return () => {
      socket.off(SOCKET_EVENTS.PROFILE_UPDATED, handleProfileUpdated);
    };
  }, []);

  async function logout(): Promise<void> {
    await logoutRequest();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  }
  return ctx;
}
