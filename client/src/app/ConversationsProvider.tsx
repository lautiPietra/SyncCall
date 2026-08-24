import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ConversationSummary, FriendRemovedPayload, MessageNewPayload, MessageUpdatedPayload, ProfileUpdatedPayload } from '@synccall/shared';
import { SOCKET_EVENTS } from '@synccall/shared';
import { useAuth } from './AuthProvider';
import { useNotificationPreferences } from './NotificationPreferencesProvider';
import { useToast } from './ToastProvider';
import { ApiClientError } from '../lib/apiClient';
import { socket } from '../lib/socketClient';
import { playMessageNotificationSound } from '../lib/notificationSound';
import { showDesktopNotification } from '../lib/desktopNotifications';
import * as conversationsApi from '../features/chat/api/conversations.api';

interface ConversationsContextValue {
  conversations: ConversationSummary[];
  loading: boolean;
  error: string | null;
  totalUnread: number;
  unreadByFriendId: Map<string, number>;
  refresh: () => Promise<void>;
  hide: (conversationId: string) => Promise<void>;
  /** Conversación que el usuario tiene abierta ahora mismo (la setea ChatPage al montar/desmontar): mientras un mensaje nuevo sea de esa misma conversación, no suena la notificación. */
  activeConversationId: string | null;
  setActiveConversationId: (conversationId: string | null) => void;
}

const ConversationsContext = createContext<ConversationsContextValue | undefined>(undefined);

export function ConversationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const { mutedAll, mutedFriendIds, desktopNotificationsEnabled } = useNotificationPreferences();
  const { showToast } = useToast();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationIdState] = useState<string | null>(null);
  // Ref en paralelo al state: el listener de sockets se registra una sola vez (no en cada
  // cambio de chat activo) y necesita leer siempre el valor más reciente sin re-suscribirse.
  const activeConversationIdRef = useRef<string | null>(null);
  const conversationsRef = useRef<ConversationSummary[]>([]);

  const setActiveConversationId = useCallback((conversationId: string | null) => {
    activeConversationIdRef.current = conversationId;
    setActiveConversationIdState(conversationId);
  }, []);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

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

      const isMine = message.sender === userId;
      const shouldNotify =
        !isMine && !mutedAll && !mutedFriendIds.has(message.sender) && message.conversation !== activeConversationIdRef.current;
      if (shouldNotify) {
        playMessageNotificationSound();
        if (desktopNotificationsEnabled) {
          const otherUser = conversationsRef.current.find((c) => c.id === message.conversation)?.otherUser;
          showDesktopNotification(otherUser?.displayName ?? 'Nuevo mensaje', {
            body: message.type === 'text' ? message.content : message.type === 'image' ? 'Te mandó una imagen' : 'Te mandó un audio',
            icon: otherUser?.avatarUrl,
            tag: message.conversation,
          });
        }
      }

      setConversations((prev) => {
        const index = prev.findIndex((c) => c.id === message.conversation);
        if (index === -1) {
          // Conversación que todavía no está en la lista local (recién creada): sí hace
          // falta traerla del server, pero esto es la excepción, no el caso de cada mensaje.
          void refresh();
          return prev;
        }

        const updated: ConversationSummary = {
          ...prev[index],
          lastMessage: {
            id: message.id,
            type: message.type,
            content: message.content,
            senderId: message.sender,
            createdAt: message.createdAt,
            deleted: message.deleted,
          },
          lastMessageAt: message.createdAt,
          unreadCount: isMine ? prev[index].unreadCount : prev[index].unreadCount + 1,
        };

        const next = prev.filter((_, i) => i !== index);
        next.unshift(updated);
        return next;
      });
    }

    // Al dejar de ser amigos (lo hayas hecho vos o la otra persona) el server ya oculta el DM
    // para los dos; acá lo sacamos también de este lado sin esperar a un refresh, sea cual sea
    // quien haya iniciado la acción (el server manda este mismo evento a ambos).
    function handleFriendRemoved(payload: FriendRemovedPayload): void {
      setConversations((prev) => prev.filter((c) => c.otherUser.id !== payload.friendId));
    }

    // El otro lado de una conversación (avatar, nombre, marco, placa, etc.) puede cambiar su
    // perfil sin que esta lista se refresque sola: la parcheamos en memoria con lo que llega
    // por socket, igual que hace FriendsProvider con su propio estado.
    function handleProfileUpdated(payload: ProfileUpdatedPayload): void {
      setConversations((prev) =>
        prev.map((c) =>
          c.otherUser.id === payload.user.id
            ? { ...c, otherUser: { ...payload.user, status: c.otherUser.status, isOnline: c.otherUser.isOnline } }
            : c,
        ),
      );
    }

    // Si el último mensaje de una conversación se edita o se borra, la preview del sidebar
    // tiene que reflejarlo sin esperar a un refetch (comparamos por id, no por posición).
    function handleMessageUpdated(payload: MessageUpdatedPayload): void {
      setConversations((prev) =>
        prev.map((c) =>
          c.lastMessage?.id === payload.message.id
            ? {
                ...c,
                lastMessage: {
                  id: payload.message.id,
                  type: payload.message.type,
                  content: payload.message.content,
                  senderId: payload.message.sender,
                  createdAt: payload.message.createdAt,
                  deleted: payload.message.deleted,
                },
              }
            : c,
        ),
      );
    }

    socket.on(SOCKET_EVENTS.MESSAGE_NEW, handleNewMessage);
    socket.on(SOCKET_EVENTS.FRIEND_REMOVED, handleFriendRemoved);
    socket.on(SOCKET_EVENTS.PROFILE_UPDATED, handleProfileUpdated);
    socket.on(SOCKET_EVENTS.MESSAGE_UPDATED, handleMessageUpdated);
    return () => {
      socket.off(SOCKET_EVENTS.MESSAGE_NEW, handleNewMessage);
      socket.off(SOCKET_EVENTS.FRIEND_REMOVED, handleFriendRemoved);
      socket.off(SOCKET_EVENTS.PROFILE_UPDATED, handleProfileUpdated);
      socket.off(SOCKET_EVENTS.MESSAGE_UPDATED, handleMessageUpdated);
    };
  }, [refresh, userId, mutedAll, mutedFriendIds, desktopNotificationsEnabled]);

  async function hide(conversationId: string): Promise<void> {
    const previous = conversations;
    setConversations((prev) => prev.filter((c) => c.id !== conversationId));
    try {
      await conversationsApi.hideConversation(conversationId);
    } catch (err) {
      setConversations(previous);
      showToast(err instanceof ApiClientError ? err.message : 'No se pudo eliminar la conversación', 'error');
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
    activeConversationId,
    setActiveConversationId,
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
