import { useEffect, useState } from 'react';
import type { GroupErrorPayload, GroupMessage, GroupMessageNewPayload, GroupMessageUpdatedPayload } from '@synccall/shared';
import { SOCKET_EVENTS } from '@synccall/shared';
import { ApiClientError } from '../../../lib/apiClient';
import { socket } from '../../../lib/socketClient';
import * as groupsApi from '../api/groups.api';

export function useGroupChannelMessages(groupId: string | null, channelId: string | null) {
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId || !channelId) {
      return;
    }
    setLoading(true);
    setError(null);
    groupsApi
      .getChannelMessages(channelId, groupId)
      .then((page) => {
        setMessages(page.messages);
        setNextCursor(page.nextCursor);
      })
      .catch((err) => {
        setError(err instanceof ApiClientError ? err.message : 'No se pudo cargar el canal');
      })
      .finally(() => setLoading(false));
  }, [groupId, channelId]);

  useEffect(() => {
    if (!channelId) {
      return;
    }

    function handleNewMessage(payload: GroupMessageNewPayload): void {
      if (payload.message.channel !== channelId) {
        return;
      }
      setMessages((prev) => (prev.some((m) => m.id === payload.message.id) ? prev : [...prev, payload.message]));
    }

    function handleError(payload: GroupErrorPayload): void {
      if (payload.channelId !== channelId) {
        return;
      }
      setError(payload.message);
    }

    function handleMessageUpdated(payload: GroupMessageUpdatedPayload): void {
      if (payload.message.channel !== channelId) {
        return;
      }
      setMessages((prev) => prev.map((m) => (m.id === payload.message.id ? payload.message : m)));
    }

    socket.on(SOCKET_EVENTS.GROUP_MESSAGE_NEW, handleNewMessage);
    socket.on(SOCKET_EVENTS.GROUP_ERROR, handleError);
    socket.on(SOCKET_EVENTS.GROUP_MESSAGE_UPDATED, handleMessageUpdated);
    return () => {
      socket.off(SOCKET_EVENTS.GROUP_MESSAGE_NEW, handleNewMessage);
      socket.off(SOCKET_EVENTS.GROUP_ERROR, handleError);
      socket.off(SOCKET_EVENTS.GROUP_MESSAGE_UPDATED, handleMessageUpdated);
    };
  }, [channelId]);

  async function loadOlder(): Promise<void> {
    if (!groupId || !channelId || !nextCursor || loadingOlder) {
      return;
    }
    setLoadingOlder(true);
    try {
      const page = await groupsApi.getChannelMessages(channelId, groupId, nextCursor);
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
    if (!channelId || !trimmed) {
      return;
    }
    socket.emit(SOCKET_EVENTS.GROUP_MESSAGE_SEND, { channelId, content: trimmed });
  }

  function editMessage(messageId: string, content: string): void {
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }
    socket.emit(SOCKET_EVENTS.GROUP_MESSAGE_EDIT, { messageId, content: trimmed });
  }

  function deleteMessage(messageId: string): void {
    socket.emit(SOCKET_EVENTS.GROUP_MESSAGE_DELETE, { messageId });
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
  };
}
