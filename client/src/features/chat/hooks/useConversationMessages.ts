import { useEffect, useState } from 'react';
import type { DmErrorPayload, Message, MessageNewPayload, MessageReactionEmoji, MessageUpdatedPayload } from '@synccall/shared';
import { SOCKET_EVENTS } from '@synccall/shared';
import { ApiClientError } from '../../../lib/apiClient';
import { socket } from '../../../lib/socketClient';
import * as conversationsApi from '../api/conversations.api';

export function useConversationMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  useEffect(() => {
    if (!conversationId) {
      return;
    }
    setLoading(true);
    setError(null);
    conversationsApi
      .getMessages(conversationId)
      .then((page) => {
        setMessages(page.messages);
        setNextCursor(page.nextCursor);
      })
      .catch((err) => {
        setError(err instanceof ApiClientError ? err.message : 'No se pudo cargar la conversación');
      })
      .finally(() => setLoading(false));
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    function handleNewMessage(payload: MessageNewPayload): void {
      if (payload.message.conversation !== conversationId) {
        return;
      }
      setMessages((prev) => (prev.some((m) => m.id === payload.message.id) ? prev : [...prev, payload.message]));
    }

    function handleError(payload: DmErrorPayload): void {
      if (payload.conversationId !== conversationId) {
        return;
      }
      setError(payload.message);
    }

    function handleMessageUpdated(payload: MessageUpdatedPayload): void {
      if (payload.message.conversation !== conversationId) {
        return;
      }
      setMessages((prev) => prev.map((m) => (m.id === payload.message.id ? payload.message : m)));
    }

    socket.on(SOCKET_EVENTS.MESSAGE_NEW, handleNewMessage);
    socket.on(SOCKET_EVENTS.DM_ERROR, handleError);
    socket.on(SOCKET_EVENTS.MESSAGE_UPDATED, handleMessageUpdated);
    return () => {
      socket.off(SOCKET_EVENTS.MESSAGE_NEW, handleNewMessage);
      socket.off(SOCKET_EVENTS.DM_ERROR, handleError);
      socket.off(SOCKET_EVENTS.MESSAGE_UPDATED, handleMessageUpdated);
    };
  }, [conversationId]);

  async function loadOlder(): Promise<void> {
    if (!conversationId || !nextCursor || loadingOlder) {
      return;
    }
    setLoadingOlder(true);
    try {
      const page = await conversationsApi.getMessages(conversationId, nextCursor);
      setMessages((prev) => [...page.messages, ...prev]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudieron cargar mensajes anteriores');
    } finally {
      setLoadingOlder(false);
    }
  }

  function sendMessage(content: string): void {
    const trimmed = content.trim();
    if (!conversationId || !trimmed) {
      return;
    }
    socket.emit(SOCKET_EVENTS.DM_SEND, { conversationId, content: trimmed });
  }

  function editMessage(messageId: string, content: string): void {
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }
    socket.emit(SOCKET_EVENTS.MESSAGE_EDIT, { messageId, content: trimmed });
  }

  function deleteMessage(messageId: string): void {
    socket.emit(SOCKET_EVENTS.MESSAGE_DELETE, { messageId });
  }

  function reactToMessage(messageId: string, emoji: MessageReactionEmoji): void {
    socket.emit(SOCKET_EVENTS.MESSAGE_REACT, { messageId, emoji });
  }

  function unreactToMessage(messageId: string): void {
    socket.emit(SOCKET_EVENTS.MESSAGE_UNREACT, { messageId });
  }

  return {
    messages,
    loading,
    loadingOlder,
    hasMore: nextCursor !== null,
    error,
    loadOlder,
    sendMessage,
    editMessage,
    deleteMessage,
    reactToMessage,
    unreactToMessage,
  };
}
