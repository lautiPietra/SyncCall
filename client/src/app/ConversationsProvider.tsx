import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ConversationSummary, MessageNewPayload } from '@synccall/shared';
import { SOCKET_EVENTS } from '@synccall/shared';
import { useAuth } from './AuthProvider';
import { ApiClientError } from '../lib/apiClient';
import { socket } from '../lib/socketClient';
import * as conversationsApi from '../features/chat/api/conversations.api';

interface ConversationsContextValue {
  conversations: ConversationSummary[];
  loading: boolean;
  error: string | null;
  totalUnread: number;
  unreadByFriendId: Map<string, number>;
  refresh: () => Promise<void>;
  hide: (conversationId: string) => Promise<void>;
}

const ConversationsContext = createContext<ConversationsContextValue | undefined>(undefined);

export function ConversationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const { conversations: list } = await conversationsApi.listConversations();
      setConversations(list);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudieron cargar las conversaciones');
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

    // Actualiza en memoria con lo que ya viene en el propio mensaje del socket, en vez de
    // volver a pedirle la lista entera al server por cada mensaje (eso fue lo que agotó el
    // rate limit general: un refetch completo por cada mensaje enviado o recibido).
    function handleNewMessage(payload: MessageNewPayload): void {
      const { message } = payload;

      setConversations((prev) => {
        const index = prev.findIndex((c) => c.id === message.conversation);
        if (index === -1) {
          // Conversación que todavía no está en la lista local (recién creada): sí hace
          // falta traerla del server, pero esto es la excepción, no el caso de cada mensaje.
          void refresh();
          return prev;
        }

        const isMine = message.sender === userId;
        const updated: ConversationSummary = {
          ...prev[index],
          lastMessage: { type: message.type, content: message.content, senderId: message.sender, createdAt: message.createdAt },
          lastMessageAt: message.createdAt,
          unreadCount: isMine ? prev[index].unreadCount : prev[index].unreadCount + 1,
        };

        const next = prev.filter((_, i) => i !== index);
        next.unshift(updated);
        return next;
      });
    }

    socket.on(SOCKET_EVENTS.MESSAGE_NEW, handleNewMessage);
    return () => {
      socket.off(SOCKET_EVENTS.MESSAGE_NEW, handleNewMessage);
    };
  }, [refresh, userId]);

  async function hide(conversationId: string): Promise<void> {
    const previous = conversations;
    setConversations((prev) => prev.filter((c) => c.id !== conversationId));
    try {
      await conversationsApi.hideConversation(conversationId);
    } catch (err) {
      setConversations(previous);
      setError(err instanceof ApiClientError ? err.message : 'No se pudo eliminar la conversación');
    }
  }

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  const unreadByFriendId = new Map(conversations.map((c) => [c.otherUser.id, c.unreadCount]));

  const value: ConversationsContextValue = {
    conversations,
    loading,
    error,
    totalUnread,
    unreadByFriendId,
    refresh,
    hide,
  };

  return <ConversationsContext.Provider value={value}>{children}</ConversationsContext.Provider>;
}

export function useConversations(): ConversationsContextValue {
  const ctx = useContext(ConversationsContext);
  if (!ctx) {
    throw new Error('useConversations debe usarse dentro de <ConversationsProvider>');
  }
  return ctx;
}
