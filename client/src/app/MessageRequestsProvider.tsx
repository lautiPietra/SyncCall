import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type {
  MessageRequestNewPayload,
  MessageRequestResolvedPayload,
  MessageRequestSummary,
  ProfileUpdatedPayload,
} from '@synccall/shared';
import { SOCKET_EVENTS } from '@synccall/shared';
import { useAuth } from './AuthProvider';
import { useConversations } from './ConversationsProvider';
import { ApiClientError } from '../lib/apiClient';
import { socket } from '../lib/socketClient';
import * as conversationsApi from '../features/chat/api/conversations.api';

interface MessageRequestsContextValue {
  requests: MessageRequestSummary[];
  loading: boolean;
  error: string | null;
  respondingIds: Set<string>;
  accept: (conversationId: string) => Promise<void>;
  decline: (conversationId: string) => Promise<void>;
}

const MessageRequestsContext = createContext<MessageRequestsContextValue | undefined>(undefined);

export function MessageRequestsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const { refresh: refreshConversations } = useConversations();

  const [requests, setRequests] = useState<MessageRequestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [respondingIds, setRespondingIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const { requests: list } = await conversationsApi.listMessageRequests();
      setRequests(list);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudieron cargar las solicitudes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userId) {
      void refresh();
    }
  }, [userId, refresh]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    function handleNewRequest(payload: MessageRequestNewPayload): void {
      setRequests((prev) => {
        const index = prev.findIndex((r) => r.conversationId === payload.request.conversationId);
        if (index === -1) {
          return [payload.request, ...prev];
        }
        const next = prev.filter((_, i) => i !== index);
        next.unshift(payload.request);
        return next;
      });
    }

    function handleResolved(payload: MessageRequestResolvedPayload): void {
      setRequests((prev) => prev.filter((r) => r.conversationId !== payload.conversationId));
      if (payload.status === 'accepted') {
        void refreshConversations();
      }
    }

    function handleProfileUpdated(payload: ProfileUpdatedPayload): void {
      setRequests((prev) =>
        prev.map((r) => (r.user.id === payload.user.id ? { ...r, user: payload.user } : r)),
      );
    }

    socket.on(SOCKET_EVENTS.MESSAGE_REQUEST_NEW, handleNewRequest);
    socket.on(SOCKET_EVENTS.MESSAGE_REQUEST_RESOLVED, handleResolved);
    socket.on(SOCKET_EVENTS.PROFILE_UPDATED, handleProfileUpdated);
    return () => {
      socket.off(SOCKET_EVENTS.MESSAGE_REQUEST_NEW, handleNewRequest);
      socket.off(SOCKET_EVENTS.MESSAGE_REQUEST_RESOLVED, handleResolved);
      socket.off(SOCKET_EVENTS.PROFILE_UPDATED, handleProfileUpdated);
    };
  }, [userId, refreshConversations]);

  async function respond(conversationId: string, status: 'accepted' | 'declined'): Promise<void> {
    setRespondingIds((prev) => new Set(prev).add(conversationId));
    setError(null);
    try {
      await conversationsApi.respondMessageRequest(conversationId, status);
      setRequests((prev) => prev.filter((r) => r.conversationId !== conversationId));
      if (status === 'accepted') {
        void refreshConversations();
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Algo salió mal, probá de nuevo');
    } finally {
      setRespondingIds((prev) => {
        const next = new Set(prev);
        next.delete(conversationId);
        return next;
      });
    }
  }

  const value: MessageRequestsContextValue = {
    requests,
    loading,
    error,
    respondingIds,
    accept: (conversationId) => respond(conversationId, 'accepted'),
    decline: (conversationId) => respond(conversationId, 'declined'),
  };

  return <MessageRequestsContext.Provider value={value}>{children}</MessageRequestsContext.Provider>;
}

export function useMessageRequests(): MessageRequestsContextValue {
  const ctx = useContext(MessageRequestsContext);
  if (!ctx) {
    throw new Error('useMessageRequests debe usarse dentro de <MessageRequestsProvider>');
  }
  return ctx;
}
