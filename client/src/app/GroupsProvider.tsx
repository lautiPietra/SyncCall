import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  GroupCreatedPayload,
  GroupDeletedPayload,
  GroupInviteCancelledPayload,
  GroupInviteNewPayload,
  GroupInvitePreview,
  GroupMessageNewPayload,
  GroupSummary,
  GroupUpdatedPayload,
} from '@synccall/shared';
import { SOCKET_EVENTS } from '@synccall/shared';
import { useAuth } from './AuthProvider';
import { useNotificationPreferences } from './NotificationPreferencesProvider';
import { ApiClientError } from '../lib/apiClient';
import { socket } from '../lib/socketClient';
import { playMessageNotificationSound } from '../lib/notificationSound';
import * as groupsApi from '../features/groups/api/groups.api';

interface GroupsContextValue {
  groups: GroupSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createGroup: (name: string, memberIds: string[]) => Promise<GroupSummary>;
  /** Canal que el usuario tiene abierto ahora mismo (lo setea GroupChannelPage al montar/desmontar): mientras un mensaje nuevo sea de ese mismo canal, no suena la notificación. */
  activeChannelId: string | null;
  setActiveChannelId: (channelId: string | null) => void;
  /** Invitaciones a grupos que todavía no respondiste. */
  invites: GroupInvitePreview[];
  respondInvite: (inviteId: string, status: 'accepted' | 'declined') => Promise<void>;
}

const GroupsContext = createContext<GroupsContextValue | undefined>(undefined);

export function GroupsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const { mutedAll } = useNotificationPreferences();

  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invites, setInvites] = useState<GroupInvitePreview[]>([]);
  const [activeChannelId, setActiveChannelIdState] = useState<string | null>(null);
  const activeChannelIdRef = useRef<string | null>(null);

  const setActiveChannelId = useCallback((channelId: string | null) => {
    activeChannelIdRef.current = channelId;
    setActiveChannelIdState(channelId);
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [{ groups: list }, { invites: inviteList }] = await Promise.all([groupsApi.listGroups(), groupsApi.listInvites()]);
      setGroups(list);
      setInvites(inviteList);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudieron cargar los grupos');
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

    // Se dispara tanto al crear un grupo como al ser agregado a uno existente: en ambos casos
    // el grupo tiene que aparecer en la lista sin esperar a un refresh manual.
    function handleGroupCreated(payload: GroupCreatedPayload): void {
      setGroups((prev) => (prev.some((g) => g.id === payload.group.id) ? prev : [payload.group, ...prev]));
    }

    function handleGroupUpdated(payload: GroupUpdatedPayload): void {
      setGroups((prev) => prev.map((g) => (g.id === payload.group.id ? payload.group : g)));
    }

    // Se reusa tanto para "el grupo se borró" como para "te sacaron/te fuiste del grupo": en
    // los dos casos, desde la perspectiva de este cliente, el grupo deja de estar disponible.
    function handleGroupRemovedFromMyList(payload: GroupDeletedPayload): void {
      setGroups((prev) => prev.filter((g) => g.id !== payload.groupId));
    }

    function handleGroupMessageNew(payload: GroupMessageNewPayload): void {
      const { message } = payload;
      const isMine = message.sender === userId;
      const shouldNotify = !isMine && !mutedAll && message.channel !== activeChannelIdRef.current;
      if (shouldNotify) {
        playMessageNotificationSound();
      }
    }

    // Te invitaron a un grupo: aparece en la lista de invitaciones pendientes hasta que la
    // respondas, y suena la misma notificación que un mensaje nuevo para que no pase inadvertida.
    function handleInviteNew(payload: GroupInviteNewPayload): void {
      setInvites((prev) => (prev.some((i) => i.id === payload.invite.id) ? prev : [payload.invite, ...prev]));
      if (!mutedAll) {
        playMessageNotificationSound();
      }
    }

    // Si el dueño cancela la invitación antes de que la respondas, se saca de la lista sola.
    function handleInviteCancelled(payload: GroupInviteCancelledPayload): void {
      setInvites((prev) => prev.filter((i) => i.groupId !== payload.groupId));
    }

    socket.on(SOCKET_EVENTS.GROUP_CREATED, handleGroupCreated);
    socket.on(SOCKET_EVENTS.GROUP_UPDATED, handleGroupUpdated);
    socket.on(SOCKET_EVENTS.GROUP_DELETED, handleGroupRemovedFromMyList);
    socket.on(SOCKET_EVENTS.GROUP_MESSAGE_NEW, handleGroupMessageNew);
    socket.on(SOCKET_EVENTS.GROUP_INVITE_NEW, handleInviteNew);
    socket.on(SOCKET_EVENTS.GROUP_INVITE_CANCELLED, handleInviteCancelled);
    return () => {
      socket.off(SOCKET_EVENTS.GROUP_CREATED, handleGroupCreated);
      socket.off(SOCKET_EVENTS.GROUP_UPDATED, handleGroupUpdated);
      socket.off(SOCKET_EVENTS.GROUP_DELETED, handleGroupRemovedFromMyList);
      socket.off(SOCKET_EVENTS.GROUP_MESSAGE_NEW, handleGroupMessageNew);
      socket.off(SOCKET_EVENTS.GROUP_INVITE_NEW, handleInviteNew);
      socket.off(SOCKET_EVENTS.GROUP_INVITE_CANCELLED, handleInviteCancelled);
    };
  }, [userId, mutedAll]);

  async function createGroup(name: string, memberIds: string[]): Promise<GroupSummary> {
    const { group } = await groupsApi.createGroup(name, memberIds);
    setGroups((prev) => [group, ...prev]);
    return group;
  }

  async function respondInvite(inviteId: string, status: 'accepted' | 'declined'): Promise<void> {
    await groupsApi.respondInvite(inviteId, status);
    setInvites((prev) => prev.filter((i) => i.id !== inviteId));
    if (status === 'accepted') {
      await refresh();
    }
  }

  const value: GroupsContextValue = {
    groups,
    loading,
    error,
    refresh,
    createGroup,
    activeChannelId,
    setActiveChannelId,
    invites,
    respondInvite,
  };

  return <GroupsContext.Provider value={value}>{children}</GroupsContext.Provider>;
}

export function useGroups(): GroupsContextValue {
  const ctx = useContext(GroupsContext);
  if (!ctx) {
    throw new Error('useGroups debe usarse dentro de <GroupsProvider>');
  }
  return ctx;
}
