import { useCallback, useEffect, useState } from 'react';
import type { Channel, Group, GroupMemberDetail, GroupMessageNewPayload } from '@synccall/shared';
import { SOCKET_EVENTS } from '@synccall/shared';
import { useAuth } from '../../../app/AuthProvider';
import { useGroups } from '../../../app/GroupsProvider';
import { ApiClientError } from '../../../lib/apiClient';
import { socket } from '../../../lib/socketClient';
import * as groupsApi from '../api/groups.api';

/**
 * Trae grupo + canales + miembros y se resuscribe a los eventos que los pueden cambiar. Se
 * usa por separado en GroupRail (sidebar) y GroupChannelPage (panel de miembros): cada uno
 * mantiene su propia copia, ambas convergen vía los mismos eventos de socket.
 */
export function useGroupDetail(groupId: string | null) {
  const { user } = useAuth();
  const { activeChannelId } = useGroups();
  const [group, setGroup] = useState<(Group & { channels: Channel[] }) | null>(null);
  const [members, setMembers] = useState<GroupMemberDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!groupId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await groupsApi.getGroup(groupId);
      setGroup(res.group);
      setMembers(res.members);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudo cargar el grupo');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!groupId) {
      return;
    }

    function handleRelevantChange(payload: { groupId: string }): void {
      if (payload.groupId !== groupId) {
        return;
      }
      void refresh();
    }
    function handleGroupUpdated(payload: { group: { id: string } }): void {
      if (payload.group.id !== groupId) {
        return;
      }
      void refresh();
    }

    // El canal activo se marca leído aparte (GroupChannelPage llama a markChannelRead al
    // montar); acá solo sumamos para los canales que no son el que está abierto ahora mismo.
    function handleMessageNew(payload: GroupMessageNewPayload): void {
      const { message } = payload;
      if (message.group !== groupId || message.sender === user?.id || message.channel === activeChannelId) {
        return;
      }
      setGroup((prev) =>
        prev ? { ...prev, channels: prev.channels.map((c) => (c.id === message.channel ? { ...c, unreadCount: c.unreadCount + 1 } : c)) } : prev,
      );
    }

    socket.on(SOCKET_EVENTS.GROUP_UPDATED, handleGroupUpdated);
    socket.on(SOCKET_EVENTS.GROUP_CHANNEL_CREATED, handleRelevantChange);
    socket.on(SOCKET_EVENTS.GROUP_CHANNEL_UPDATED, handleRelevantChange);
    socket.on(SOCKET_EVENTS.GROUP_CHANNEL_DELETED, handleRelevantChange);
    socket.on(SOCKET_EVENTS.GROUP_MEMBER_ADDED, handleRelevantChange);
    socket.on(SOCKET_EVENTS.GROUP_MEMBER_REMOVED, handleRelevantChange);
    socket.on(SOCKET_EVENTS.GROUP_MEMBER_ROLE_UPDATED, handleRelevantChange);
    socket.on(SOCKET_EVENTS.GROUP_MESSAGE_NEW, handleMessageNew);
    return () => {
      socket.off(SOCKET_EVENTS.GROUP_UPDATED, handleGroupUpdated);
      socket.off(SOCKET_EVENTS.GROUP_CHANNEL_CREATED, handleRelevantChange);
      socket.off(SOCKET_EVENTS.GROUP_CHANNEL_UPDATED, handleRelevantChange);
      socket.off(SOCKET_EVENTS.GROUP_CHANNEL_DELETED, handleRelevantChange);
      socket.off(SOCKET_EVENTS.GROUP_MEMBER_ADDED, handleRelevantChange);
      socket.off(SOCKET_EVENTS.GROUP_MEMBER_REMOVED, handleRelevantChange);
      socket.off(SOCKET_EVENTS.GROUP_MEMBER_ROLE_UPDATED, handleRelevantChange);
      socket.off(SOCKET_EVENTS.GROUP_MESSAGE_NEW, handleMessageNew);
    };
  }, [groupId, refresh, user?.id, activeChannelId]);

  return { group, channels: group?.channels ?? [], members, loading, error, refresh };
}
