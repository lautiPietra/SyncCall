import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PublicUser } from '@synccall/shared';
import { getEffectiveStatus } from '@synccall/shared';
import { Button } from '../../../components/ui/Button';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { CountBadge } from '../../../components/ui/CountBadge';
import { FramedAvatar } from '../../../components/ui/AvatarFrame';
import { Input } from '../../../components/ui/Input';
import { Spinner } from '../../../components/ui/Spinner';
import { STATUS_LABELS } from '../../../components/ui/StatusDot';
import { useCall } from '../../../app/CallProvider';
import { useFriends } from '../../../app/FriendsProvider';
import { useNotificationPreferences } from '../../../app/NotificationPreferencesProvider';
import { useToast } from '../../../app/ToastProvider';
import { useEscapeToClose } from '../../../hooks/useEscapeToClose';
import { lightenAccentColor } from '../../../lib/accentColor';
import { useUserSearch } from '../hooks/useUserSearch';
import { listMutualFriends } from '../api/friends.api';
import { getConversationStatus, getOrCreateConversation, respondMessageRequest } from '../../chat/api/conversations.api';

type Tab = 'all' | 'online' | 'pending' | 'add';

const MEMBER_SINCE_FORMATTER = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function FriendsPage() {
  const {
    friends,
    incoming,
    outgoing,
    loading,
    error,
    pendingIds,
    sendRequest,
    acceptRequest,
    declineRequest,
    cancelRequest,
    removeFriend,
  } = useFriends();
  const { isFriendMuted, setFriendMuted } = useNotificationPreferences();
  const { startDmCall } = useCall();
  const { showToast } = useToast();
  const search = useUserSearch();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('all');
  const [removingFriendId, setRemovingFriendId] = useState<string | null>(null);
  const [cancelingRequestId, setCancelingRequestId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [openSidebarMenuId, setOpenSidebarMenuId] = useState<string | null>(null);
  const [viewingFriendId, setViewingFriendId] = useState<string | null>(null);
  const [friendQuery, setFriendQuery] = useState('');
  const [showActiveMobile, setShowActiveMobile] = useState(false);

  const friendIds = new Set(friends.map((f) => f.user.id));
  const outgoingByUserId = new Map(outgoing.map((r) => [r.user.id, r.id]));
  const incomingByUserId = new Map(incoming.map((r) => [r.user.id, r.id]));
  const onlineFriends = friends.filter(
    (f) => getEffectiveStatus(f.user.status, f.user.isOnline) === 'online',
  );
  const pendingCount = incoming.length + outgoing.length;

  const removingFriend = friends.find((f) => f.friendshipId === removingFriendId);
  const cancelingRequest = outgoing.find((r) => r.id === cancelingRequestId);
  const viewingFriend = friends.find((f) => f.friendshipId === viewingFriendId);

  function openFriendMenu(friendshipId: string): void {
    setOpenMenuId((current) => (current === friendshipId ? null : friendshipId));
  }

  function openSidebarFriendMenu(friendshipId: string): void {
    setOpenSidebarMenuId((current) => (current === friendshipId ? null : friendshipId));
  }

  /** La llamada necesita un conversationId (mismo mecanismo que usa el chat): si todavía no
   * hablaron nunca, se crea la conversación DM recién en este momento. */
  async function handleStartCall(friendUserId: string): Promise<void> {
    try {
      const { conversation } = await getOrCreateConversation(friendUserId);
      startDmCall(conversation.id, friendUserId);
    } catch {
      showToast('No se pudo iniciar la llamada', 'error');
    }
  }

  const baseFriends = tab === 'online' ? onlineFriends : friends;
  const normalizedFriendQuery = friendQuery.trim().toLowerCase();
  const visibleFriends = normalizedFriendQuery
    ? baseFriends.filter(
        ({ user }) =>
          user.displayName.toLowerCase().includes(normalizedFriendQuery) ||
          user.username.toLowerCase().includes(normalizedFriendQuery),
      )
    : baseFriends;

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <div className="min-w-0 flex-1 bg-card px-6 py-8">
        <div className="border-b border-surface-border/60 pb-4">
          <div className="flex items-center gap-2">
            <FriendsGroupIcon className="hidden shrink-0 text-text-description sm:block" />
            <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
              <TabButton active={tab === 'all'} onClick={() => setTab('all')}>
                Todos
              </TabButton>
              <TabButton active={tab === 'online'} onClick={() => setTab('online')}>
                En línea
              </TabButton>
              <TabButton active={tab === 'pending'} onClick={() => setTab('pending')}>
                Pendientes
                <CountBadge count={pendingCount} className="ml-1.5 px-2 py-0.5 text-xs" />
              </TabButton>
              <button
                type="button"
                onClick={() => setTab('add')}
                className={`shrink-0 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors sm:ml-1 sm:text-base ${
                  tab === 'add' ? 'bg-primary-active text-white' : 'bg-status-online text-white hover:brightness-110'
                }`}
              >
                Añadir amigo
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowActiveMobile((v) => !v)}
            className={`mt-2 flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors lg:hidden ${
              showActiveMobile ? 'bg-surface-hover text-white' : 'text-text-description hover:bg-surface-hover/60 hover:text-white'
            }`}
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-status-online" />
            Activos ahora
            <ChevronDownIcon className={`transition-transform ${showActiveMobile ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {showActiveMobile && (
          <div className="mt-4 rounded-xl border border-surface-border/60 bg-card p-5 lg:hidden">
            <ActiveNowList
              onlineFriends={onlineFriends}
              openMenuId={openSidebarMenuId}
              onToggleMenu={openSidebarFriendMenu}
              onCloseMenu={() => setOpenSidebarMenuId(null)}
              onViewProfile={setViewingFriendId}
              onSendMessage={(userId) => navigate(`/chat/${userId}`)}
              onStartCall={(userId) => void handleStartCall(userId)}
              onRemove={setRemovingFriendId}
              isFriendMuted={isFriendMuted}
              onToggleMute={(userId) => setFriendMuted(userId, !isFriendMuted(userId))}
            />
          </div>
        )}

        {error && <p className="mt-4 text-sm text-status-dnd">{error}</p>}

        {tab === 'add' && (
          <div className="mt-6 flex flex-col gap-3">
            <p className="text-sm font-semibold uppercase tracking-wide text-text-description">
              Añadir amigo por nombre de usuario
            </p>
            <Input
              placeholder="Buscar por nombre de usuario..."
              value={search.query}
              onChange={(e) => search.setQuery(e.target.value)}
              className="px-4 py-3 text-base"
              autoFocus
            />

            <div className="mt-1 flex flex-col divide-y divide-surface-border/40">
              {search.loading && (
                <div className="flex justify-center py-8">
                  <Spinner size={24} />
                </div>
              )}
              {!search.loading && search.error && <p className="py-3 text-sm text-status-dnd">{search.error}</p>}
              {!search.loading && !search.error && search.query.trim() && search.results.length === 0 && (
                <p className="py-3 text-sm text-text-description">No se encontraron usuarios</p>
              )}
              {search.results.map((user) => {
                const isFriend = friendIds.has(user.id);
                const outgoingId = outgoingByUserId.get(user.id);
                const incomingId = incomingByUserId.get(user.id);

                return (
                  <PersonRow key={user.id} user={user}>
                    {isFriend ? (
                      <span className="text-xs text-text-disabled">Ya son amigos</span>
                    ) : incomingId ? (
                      <ActionButton onClick={() => void acceptRequest(incomingId)} disabled={pendingIds.has(incomingId)}>
                        Aceptar
                      </ActionButton>
                    ) : outgoingId ? (
                      <ActionButton
                        variant="ghost"
                        onClick={() => setCancelingRequestId(outgoingId)}
                        disabled={pendingIds.has(outgoingId)}
                      >
                        Cancelar
                      </ActionButton>
                    ) : (
                      <ActionButton onClick={() => void sendRequest(user.id)} disabled={pendingIds.has(user.id)}>
                        Enviar solicitud
                      </ActionButton>
                    )}
                  </PersonRow>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'pending' && (
          <div className="mt-3 flex flex-col divide-y divide-surface-border/40">
            {loading ? (
              <div className="flex justify-center py-14">
                <Spinner size={28} />
              </div>
            ) : pendingCount === 0 ? (
              <EmptyState text="No tenés solicitudes pendientes." />
            ) : (
              <>
                {incoming.map(({ id, user }) => (
                  <PersonRow key={id} user={user} subtitle={`@${user.username} · te envió una solicitud`}>
                    <IconButton
                      onClick={() => void acceptRequest(id)}
                      disabled={pendingIds.has(id)}
                      variant="accept"
                      label="Aceptar"
                    >
                      <CheckIcon />
                    </IconButton>
                    <IconButton
                      onClick={() => void declineRequest(id)}
                      disabled={pendingIds.has(id)}
                      variant="decline"
                      label="Rechazar"
                    >
                      <XIcon />
                    </IconButton>
                  </PersonRow>
                ))}
                {outgoing.map(({ id, user }) => (
                  <PersonRow key={id} user={user} subtitle="Solicitud pendiente de respuesta">
                    <ActionButton variant="ghost" onClick={() => setCancelingRequestId(id)} disabled={pendingIds.has(id)}>
                      Cancelar
                    </ActionButton>
                  </PersonRow>
                ))}
              </>
            )}
          </div>
        )}

        {(tab === 'all' || tab === 'online') && (
          <div className="mt-3 flex flex-col">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-disabled">
                <SearchIcon />
              </span>
              <Input
                placeholder={tab === 'online' ? 'Buscar entre tus amigos en línea' : 'Buscar amigos'}
                value={friendQuery}
                onChange={(e) => setFriendQuery(e.target.value)}
                className="w-full pl-9"
              />
            </div>
            <p className="px-1 py-3 text-sm font-semibold uppercase tracking-wide text-text-description">
              {tab === 'online' ? 'En línea' : 'Todos'} — {visibleFriends.length}
            </p>
            {loading ? (
              <div className="flex justify-center py-14">
                <Spinner size={28} />
              </div>
            ) : visibleFriends.length === 0 ? (
              <EmptyState
                text={
                  normalizedFriendQuery
                    ? 'No encontramos amigos con ese nombre.'
                    : tab === 'online'
                      ? 'No hay amigos en línea en este momento. ¡Volvé más tarde!'
                      : 'Todavía no tenés amigos agregados. Buscalos en "Añadir amigo".'
                }
              />
            ) : (
              <div className="flex flex-col divide-y divide-surface-border/40">
                {visibleFriends.map(({ friendshipId, user }) => (
                  <PersonRow
                    key={friendshipId}
                    user={user}
                    subtitle={`@${user.username} · ${STATUS_LABELS[getEffectiveStatus(user.status, user.isOnline)]}`}
                    onAvatarClick={() => openFriendMenu(friendshipId)}
                    menu={
                      openMenuId === friendshipId ? (
                        <FriendActionsMenu
                          onClose={() => setOpenMenuId(null)}
                          onViewProfile={() => setViewingFriendId(friendshipId)}
                          onSendMessage={() => navigate(`/chat/${user.id}`)}
                          onStartCall={() => void handleStartCall(user.id)}
                          onRemove={() => setRemovingFriendId(friendshipId)}
                          isMuted={isFriendMuted(user.id)}
                          onToggleMute={() => setFriendMuted(user.id, !isFriendMuted(user.id))}
                        />
                      ) : null
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <aside className="hidden shrink-0 px-6 py-8 lg:block lg:w-80">
        <p className="mb-3 text-base font-semibold text-white">Activo ahora</p>
        <div className="rounded-xl border border-surface-border/60 bg-card p-5">
          <ActiveNowList
            onlineFriends={onlineFriends}
            openMenuId={openSidebarMenuId}
            onToggleMenu={openSidebarFriendMenu}
            onCloseMenu={() => setOpenSidebarMenuId(null)}
            onViewProfile={setViewingFriendId}
            onSendMessage={(userId) => navigate(`/chat/${userId}`)}
            onStartCall={(userId) => void handleStartCall(userId)}
            onRemove={setRemovingFriendId}
            isFriendMuted={isFriendMuted}
            onToggleMute={(userId) => setFriendMuted(userId, !isFriendMuted(userId))}
          />
        </div>
      </aside>

      {removingFriend && (
        <ConfirmDialog
          title="¿Eliminar amigo?"
          description={`${removingFriend.user.displayName} ya no va a estar en tu lista de amigos.`}
          confirmLabel="Eliminar"
          variant="danger"
          onConfirm={() => {
            void removeFriend(removingFriend.friendshipId);
            setRemovingFriendId(null);
          }}
          onCancel={() => setRemovingFriendId(null)}
        />
      )}

      {viewingFriend && (
        <UserProfileModal
          user={viewingFriend.user}
          friendsSince={viewingFriend.friendsSince}
          onClose={() => setViewingFriendId(null)}
          onSendMessage={() => navigate(`/chat/${viewingFriend.user.id}`)}
          onStartCall={() => void handleStartCall(viewingFriend.user.id)}
          onRemove={() => {
            setViewingFriendId(null);
            setRemovingFriendId(viewingFriend.friendshipId);
          }}
        />
      )}

      {cancelingRequest && (
        <ConfirmDialog
          title="¿Cancelar solicitud?"
          description={`No le vas a enviar más la solicitud a ${cancelingRequest.user.displayName}.`}
          confirmLabel="Cancelar solicitud"
          variant="danger"
          onConfirm={() => {
            void cancelRequest(cancelingRequest.id);
            setCancelingRequestId(null);
          }}
          onCancel={() => setCancelingRequestId(null)}
        />
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center justify-center whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors sm:justify-start sm:px-4 sm:text-base ${
        active ? 'bg-surface-hover text-white' : 'text-text-description hover:bg-surface-hover/60 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function PersonRow({
  user,
  subtitle,
  children,
  onAvatarClick,
  menu,
}: {
  user: PublicUser;
  subtitle?: string;
  children?: ReactNode;
  onAvatarClick?: () => void;
  menu?: ReactNode;
}) {
  const avatar = (
    <FramedAvatar
      frame={user.avatarFrame}
      src={user.avatarUrl}
      alt={user.displayName}
      size={40}
      status={getEffectiveStatus(user.status, user.isOnline)}
    />
  );

  return (
    <div className="group flex items-center gap-4 rounded-lg px-3 py-3.5 transition-colors hover:bg-surface-hover">
      <div className="relative shrink-0">
        {onAvatarClick ? (
          <button type="button" onClick={onAvatarClick} className="rounded-full transition-transform hover:scale-105">
            {avatar}
          </button>
        ) : (
          avatar
        )}
        {menu}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium text-white">{user.displayName}</p>
        <p className="truncate text-sm text-text-description">{subtitle ?? `@${user.username}`}</p>
      </div>
      {children && (
        <div className="flex shrink-0 items-center gap-2.5 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          {children}
        </div>
      )}
    </div>
  );
}

function ActiveNowList({
  onlineFriends,
  openMenuId,
  onToggleMenu,
  onCloseMenu,
  onViewProfile,
  onSendMessage,
  onStartCall,
  onRemove,
  isFriendMuted,
  onToggleMute,
}: {
  onlineFriends: { friendshipId: string; user: PublicUser }[];
  openMenuId: string | null;
  onToggleMenu: (friendshipId: string) => void;
  onCloseMenu: () => void;
  onViewProfile: (friendshipId: string) => void;
  onSendMessage: (userId: string) => void;
  onStartCall: (userId: string) => void;
  onRemove: (friendshipId: string) => void;
  isFriendMuted: (userId: string) => boolean;
  onToggleMute: (userId: string) => void;
}) {
  if (onlineFriends.length === 0) {
    return (
      <div className="text-center">
        <p className="text-base font-medium text-white">Por ahora está todo tranquilo...</p>
        <p className="mt-2 text-sm leading-relaxed text-text-description">Cuando un amigo esté conectado, lo vas a ver acá.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {onlineFriends.map(({ friendshipId, user }) => (
        <div key={friendshipId} className="flex items-center gap-3">
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => onToggleMenu(friendshipId)}
              className="rounded-full transition-transform hover:scale-105"
            >
              <FramedAvatar
                frame={user.avatarFrame}
                src={user.avatarUrl}
                alt={user.displayName}
                size={40}
                status={getEffectiveStatus(user.status, user.isOnline)}
              />
            </button>
            {openMenuId === friendshipId && (
              <FriendActionsMenu
                onClose={onCloseMenu}
                onViewProfile={() => onViewProfile(friendshipId)}
                onSendMessage={() => onSendMessage(user.id)}
                onStartCall={() => onStartCall(user.id)}
                onRemove={() => onRemove(friendshipId)}
                isMuted={isFriendMuted(user.id)}
                onToggleMute={() => onToggleMute(user.id)}
              />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-base text-white">{user.displayName}</p>
            <p className="truncate text-sm text-text-description">
              {STATUS_LABELS[getEffectiveStatus(user.status, user.isOnline)]}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function FriendActionsMenu({
  onClose,
  onViewProfile,
  onSendMessage,
  onStartCall,
  onRemove,
  isMuted,
  onToggleMute,
}: {
  onClose: () => void;
  onViewProfile: () => void;
  onSendMessage: () => void;
  onStartCall: () => void;
  onRemove: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
}) {
  useEscapeToClose(onClose);

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute left-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-lg border border-surface-border/60 bg-card py-1.5 shadow-2xl shadow-black/40">
        <MenuItem
          icon={<MessageIcon />}
          label="Enviar mensaje"
          onClick={() => {
            onSendMessage();
            onClose();
          }}
        />
        <MenuItem
          icon={<PhoneIcon />}
          label="Realizar llamada"
          onClick={() => {
            onStartCall();
            onClose();
          }}
        />
        <MenuItem
          icon={<ProfileIcon />}
          label="Ver perfil"
          onClick={() => {
            onViewProfile();
            onClose();
          }}
        />
        <MenuItem
          icon={<MuteIcon />}
          label={isMuted ? 'Dejar de silenciar' : 'Silenciar'}
          onClick={() => {
            onToggleMute();
            onClose();
          }}
        />
        <div className="my-1.5 border-t border-surface-border/60" />
        <MenuItem
          icon={<TrashIcon />}
          label="Eliminar amigo"
          danger
          onClick={() => {
            onRemove();
            onClose();
          }}
        />
      </div>
    </>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? 'Todavía no disponible' : undefined}
      className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors ${
        disabled
          ? 'cursor-not-allowed text-text-disabled opacity-60'
          : danger
            ? 'text-status-dnd hover:bg-status-dnd/10'
            : 'text-text-description hover:bg-surface-hover hover:text-white'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function UserProfileModal({
  user,
  friendsSince,
  onClose,
  onSendMessage,
  onStartCall,
  onRemove,
}: {
  user: PublicUser;
  friendsSince: string;
  onClose: () => void;
  onSendMessage: () => void;
  onStartCall: () => void;
  onRemove: () => void;
}) {
  const effectiveStatus = getEffectiveStatus(user.status, user.isOnline);
  const [mutualFriends, setMutualFriends] = useState<PublicUser[] | null>(null);
  const [friendsCount, setFriendsCount] = useState<number | null>(null);
  const [mutualError, setMutualError] = useState(false);
  const [blockedConversationId, setBlockedConversationId] = useState<string | null>(null);
  const [reactivating, setReactivating] = useState(false);
  const [reactivated, setReactivated] = useState(false);
  const [reactivateError, setReactivateError] = useState(false);

  useEscapeToClose(onClose);

  useEffect(() => {
    let cancelled = false;
    setMutualFriends(null);
    setFriendsCount(null);
    setMutualError(false);
    listMutualFriends(user.id)
      .then(({ friends, friendsCount: count }) => {
        if (!cancelled) {
          setMutualFriends(friends);
          setFriendsCount(count);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMutualError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  useEffect(() => {
    let cancelled = false;
    setBlockedConversationId(null);
    setReactivated(false);
    // Si en algún momento desactivaste los mensajes de este amigo (requestStatus
    // 'declined' con requestedBy = este amigo), acá se puede reactivar sin pasar por chat.
    getConversationStatus(user.id)
      .then((status) => {
        if (!cancelled && status.exists && status.requestStatus === 'declined' && status.requestedBy === user.id) {
          setBlockedConversationId(status.conversationId);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  async function handleReactivateMessages(): Promise<void> {
    if (!blockedConversationId) {
      return;
    }
    setReactivating(true);
    setReactivateError(false);
    try {
      await respondMessageRequest(blockedConversationId, 'accepted');
      setBlockedConversationId(null);
      setReactivated(true);
    } catch {
      setReactivateError(true);
    } finally {
      setReactivating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-surface-border/60 bg-card shadow-2xl shadow-black/40"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative h-28 shrink-0">
          {user.bannerUrl ? (
            <img src={user.bannerUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            // El color de fondo cuando no hay banner tiene que ser el accentColor DE ESTE
            // AMIGO, no el propio (los tokens Tailwind `primary/*` reflejan el color del
            // usuario logueado vía variables CSS globales, no sirven para pintar a un tercero).
            <div
              className="h-full w-full"
              style={{ background: `linear-gradient(to right, ${user.accentColor}, #7A5AF8, ${lightenAccentColor(user.accentColor)})` }}
            />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/55"
          >
            <XIcon />
          </button>
          {/* El avatar se posiciona acá (dentro del banner, que no recorta overflow), NO adentro
              de la columna de contenido de abajo: esa columna tiene `overflow-y-auto`, así que
              cualquier cosa que un margen negativo empuje por encima de su propio borde superior
              queda directamente recortada (invisible) en vez de solo "tapada" — por eso la mitad
              de arriba del avatar no se veía. */}
          <div className="absolute left-1/2 top-full z-10 -translate-x-1/2 -translate-y-10 rounded-full border-4 border-card">
            <FramedAvatar frame={user.avatarFrame} src={user.avatarUrl} alt={user.displayName} size={80} status={effectiveStatus} />
          </div>
        </div>

        <div className="no-scrollbar flex flex-col items-center gap-2 overflow-y-auto px-8 pb-6 pt-14">

          <div className="text-center">
            <p className="text-lg font-semibold text-white">{user.displayName}</p>
            <p className="text-sm text-text-description">@{user.username}</p>
            <p className="mt-1 text-xs text-text-disabled">{STATUS_LABELS[effectiveStatus]}</p>
          </div>

          {blockedConversationId && (
            <div className="mt-3 flex w-full items-center justify-between gap-2 rounded-lg bg-bg/60 p-3">
              <p className="text-xs text-text-description">Desactivaste los mensajes de este amigo.</p>
              <button
                type="button"
                onClick={() => void handleReactivateMessages()}
                disabled={reactivating}
                className="shrink-0 rounded-full bg-status-online/15 px-3 py-1.5 text-xs font-medium text-status-online transition-colors hover:bg-status-online/25 disabled:opacity-50"
              >
                {reactivating ? 'Activando...' : 'Activar mensajes'}
              </button>
            </div>
          )}
          {reactivated && <p className="mt-2 text-xs text-status-online">Ya puede volver a mandarte mensajes.</p>}
          {reactivateError && (
            <p className="mt-2 text-xs text-status-dnd">No se pudo activar los mensajes. Probá de nuevo.</p>
          )}

          <div className="mt-4 grid w-full grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-4">
              {user.bio ? (
                <p className="w-full whitespace-pre-line rounded-lg bg-bg/60 p-3 text-sm text-text-description">{user.bio}</p>
              ) : (
                <p className="text-sm italic text-text-disabled">Sin biografía</p>
              )}

              <div className="flex flex-col gap-1">
                <p className="flex items-center gap-1.5 text-xs text-text-disabled">
                  <CalendarIcon />
                  Miembro desde {MEMBER_SINCE_FORMATTER.format(new Date(user.createdAt))}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-text-disabled">
                  <FriendsGroupIcon className="h-3 w-3" />
                  Amigos desde {MEMBER_SINCE_FORMATTER.format(new Date(friendsSince))}
                </p>
                {friendsCount !== null && (
                  <p className="text-xs text-text-disabled">
                    {friendsCount} {friendsCount === 1 ? 'amigo' : 'amigos'}
                  </p>
                )}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-description">Amigos en común</p>
              {mutualError ? (
                <p className="text-sm text-text-disabled">No se pudo cargar</p>
              ) : mutualFriends === null ? (
                <div className="flex justify-center py-2">
                  <Spinner size={18} />
                </div>
              ) : mutualFriends.length === 0 ? (
                <p className="text-sm text-text-disabled">Todavía no tienen amigos en común</p>
              ) : (
                <div className="no-scrollbar flex max-h-40 flex-col divide-y divide-surface-border/40 overflow-y-auto">
                  {mutualFriends.map((mutual) => (
                    <div key={mutual.id} className="flex items-center gap-3 py-2">
                      <FramedAvatar frame={mutual.avatarFrame} src={mutual.avatarUrl} alt={mutual.displayName} size={32} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{mutual.displayName}</p>
                        <p className="truncate text-xs text-text-description">@{mutual.username}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 flex w-full gap-2">
            <Button type="button" variant="primary" className="flex-1" onClick={onSendMessage}>
              Enviar mensaje
            </Button>
            <Button type="button" variant="secondary" className="flex-1" onClick={onStartCall}>
              Llamar
            </Button>
            <Button type="button" variant="danger" className="flex-1" onClick={onRemove}>
              Eliminar amigo
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  variant = 'primary',
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
  children: ReactNode;
}) {
  const classes =
    variant === 'primary'
      ? 'bg-primary/15 text-primary hover:bg-primary/25'
      : 'border border-surface-border text-text-description hover:border-status-dnd/50 hover:text-status-dnd';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${classes}`}
    >
      {children}
    </button>
  );
}

function IconButton({
  onClick,
  disabled,
  variant,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  variant: 'accept' | 'decline';
  label: string;
  children: ReactNode;
}) {
  const classes =
    variant === 'accept'
      ? 'bg-status-online/15 text-status-online hover:bg-status-online/25'
      : 'bg-status-dnd/15 text-status-dnd hover:bg-status-dnd/25';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors disabled:opacity-50 ${classes}`}
    >
      {children}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="px-1 py-14 text-center text-base text-text-description">{text}</p>;
}

function FriendsGroupIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 5.5a3.5 3.5 0 0 1 0 7" />
      <path d="M15 13.2c2.9.4 5 2.1 5 6.8" />
    </svg>
  );
}

function ChevronDownIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10.5" r="2.25" />
      <path d="M5.5 17c.5-2 2-3 3.5-3s3 1 3.5 3" />
      <path d="M14.5 9h4M14.5 12.5h4" />
    </svg>
  );
}

function MuteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="m17 9 5 6M22 9l-5 6" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-9 8.4A8.5 8.5 0 1 1 21 11.5Z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
