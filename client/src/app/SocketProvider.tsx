import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import { socket } from '../lib/socketClient';

const SocketConnectionContext = createContext<boolean>(false);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const isAuthenticated = !loading && !!user;
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    if (isAuthenticated) {
      socket.connect();
    } else {
      socket.disconnect();
    }

    return () => {
      socket.disconnect();
    };
  }, [isAuthenticated]);

  useEffect(() => {
    function handleConnect(): void {
      setConnected(true);
    }
    function handleDisconnect(): void {
      setConnected(false);
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  return (
    <SocketConnectionContext.Provider value={connected}>{children}</SocketConnectionContext.Provider>
  );
}

/** Estado real de la conexión del socket propio, para reflejar "en línea" sin depender del user.isOnline persistido (que puede haber quedado desactualizado desde el último fetch de /me). */
export function useSocketConnected(): boolean {
  return useContext(SocketConnectionContext);
}
