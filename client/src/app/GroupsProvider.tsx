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
import { showDesktopNotification } from '../lib/desktopNotifications';
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
  /** Seteado cuando un admin te expulsó de un grupo, para que un componente dentro del Router
   * (que sí tiene navigate/location) muestre el toast y te saque de esa página si estabas ahí. */
  kickedNotice: { groupId: string; groupName: string } | null;
  clearKickedNotice: () => void;
}

const GroupsContext = createContext<GroupsContextValue | undefined>(undefined);

export function GroupsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const { mutedAll, desktopNotificationsEnabled } = useNotificationPreferences();

  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invites, setInvites] = useState<GroupInvitePreview[]>([]);
  const [activeChannelId, setActiveChannelIdState] = useState<string | null>(null);
  const [kickedNotice, setKickedNotice] = useState<{ groupId: string; groupName: string } | null>(null);
  const activeChannelIdRef = useRef<string | null>(null);
  const groupsRef = useRef<GroupSummary[]>([]);

  const setActiveChannelId = useCallback((channelId: string | null) => {
    activeChannelIdRef.current = channelId;
    setActiveChannelIdState(channelId);
  }, []);

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

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

    // El unreadCount del payload es 0 por default del lado del server (GROUP_UPDATED se manda a
    // toda la sala y ese contador es por-usuario, no se puede calcular uno solo para todos): se
    // preserva el que ya teníamos localmente en vez de pisarlo.
    function handleGroupUpdated(payload: GroupUpdatedPayload): void {
      setGroups((prev) => prev.map((g) => (g.id === payload.group.id ? { ...payload.group, unreadCount: g.unreadCount } : g)));
    }

    // Se reusa tanto para "el grupo se borró" como para "te fuiste"/"te expulsaron": en los
    // 3 casos, desde la perspectiva de este cliente, el grupo deja de estar disponible. Solo el
    // caso "te expulsaron" necesita aviso: si te fuiste vos, tu propia UI ya te sacó de la
    // página; si se borró el grupo entero, tampoco lo pidieron acá.
    function handleGroupRemovedFromMyList(payload: GroupDeletedPayload): void {
      if (payload.reason === 'kicked') {
        const removedGroup = groupsRef.current.find((g) => g.id === payload.groupId);
        setKickedNotice({ groupId: payload.groupId, groupName: removedGroup?.name ?? 'el grupo' });
      }
      setGroups((prev) => prev.filter((g) => g.id !== payload.groupId));
    }

    function handleGroupMessageNew(payload: GroupMessageNewPayload): void {
      const { message } = payload;
      const isMine = message.sender === userId;
      const isActiveChannel = message.channel === activeChannelIdRef.current;
      const shouldNotify = !isMine && !mutedAll && !isActiveChannel;
      if (shouldNotify) {
        playMessageNotificationSound();
        if (desktopNotificationsEnabled && message.type !== 'system') {
          const groupName = groupsRef.current.find((g) => g.id === message.group)?.name;
          showDesktopNotification(`${message.senderInfo.displayName} en ${groupName ?? 'un grupo'}`, {
            body: message.type === 'text' ? message.content : message.type === 'image' ? 'Mandó una imagen' : 'Mandó un audio',
            icon: message.senderInfo.avatarUrl,
            tag: message.channel,
          });
        }
      }

      // El canal activo se marca leído aparte (ver GroupChannelPage), así que acá no sumamos
      // para no mostrar un contador que después el propio mount ya va a resetear.
      if (!isMine && !isActiveChannel) {
        setGroups((prev) => prev.map((g) => (g.id === message.group ? { ...g, unreadCount: g.unreadCount + 1 } : g)));
      }
    }

    // Te invitaron a un grupo: aparece en la lista de invitaciones pendientes hasta que la
    // respondas, y suena la misma notificación que un mensaje nuevo para que no pase inadvertida.
    function handleInviteNew(payload: GroupInviteNewPayload): void {
      setInvites((prev) => (prev.some((i) => i.id === payload.invite.id) ? prev : [payload.invite, ...prev]));
      if (!mutedAll) {
        playMessageNotificationSound();
        if (desktopNotificationsEnabled) {
          showDesktopNotification(`${payload.invite.invitedBy.displayName} te invitó a un grupo`, {
            body: payload.invite.groupName,
            icon: payload.invite.invitedBy.avatarUrl,
          });
        }
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
  }, [userId, mutedAll, desktopNotificationsEnabled]);

  async function createGroup(name: string, memberIds: string[]): Promise<GroupSummary> {
    const { group } = await groupsApi.createGroup(name, memberIds);
    // El servidor también emite GROUP_CREATED por socket al dueño; si ese evento llega antes
    // de que resuelva esta promesa, el grupo ya está en el estado y no hay que duplicarlo.
    setGroups((prev) => (prev.some((g) => g.id === group.id) ? prev : [group, ...prev]));
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
    kickedNotice,
    clearKickedNotice: () => setKickedNotice(null),
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
