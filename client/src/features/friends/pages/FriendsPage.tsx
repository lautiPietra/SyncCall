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
import { useFriends } from '../../../app/FriendsProvider';
import { useUserSearch } from '../hooks/useUserSearch';
import { listMutualFriends } from '../api/friends.api';
import { getConversationStatus, respondMessageRequest } from '../../chat/api/conversations.api';

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
  const search = useUserSearch();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('all');
  const [removingFriendId, setRemovingFriendId] = useState<string | null>(null);
  const [cancelingRequestId, setCancelingRequestId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [viewingFriendId, setViewingFriendId] = useState<string | null>(null);

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

  const visibleFriends = tab === 'online' ? onlineFriends : friends;

  return (
    <div className="flex min-h-full">
      <div className="min-w-0 flex-1 bg-card px-6 py-8">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-surface-border/60 pb-4">
          <FriendsGroupIcon className="mr-1.5 text-text-description" />
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
            className={`ml-1.5 rounded-md px-4 py-2 text-base font-medium transition-colors ${
              tab === 'add' ? 'bg-primary-active text-white' : 'bg-status-online text-white hover:brightness-110'
            }`}
          >
            Añadir amigo
          </button>
        </div>

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
                  tab === 'online'
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
                          onRemove={() => setRemovingFriendId(friendshipId)}
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

      <aside className="hidden w-80 shrink-0 px-6 py-8 lg:block">
        <p className="mb-3 text-base font-semibold text-white">Activo ahora</p>
        <div className="rounded-xl border border-surface-border/60 bg-card p-5">
          {onlineFriends.length === 0 ? (
            <div className="text-center">
              <p className="text-base font-medium text-white">Por ahora está todo tranquilo...</p>
              <p className="mt-2 text-sm leading-relaxed text-text-description">
                Cuando un amigo esté conectado, lo vas a ver acá.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {onlineFriends.map(({ friendshipId, user }) => (
                <div key={friendshipId} className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <button type="button" onClick={() => openFriendMenu(friendshipId)} className="rounded-full transition-transform hover:scale-105">
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
                        onClose={() => setOpenMenuId(null)}
                        onViewProfile={() => setViewingFriendId(friendshipId)}
                        onSendMessage={() => navigate(`/chat/${user.id}`)}
                        onRemove={() => setRemovingFriendId(friendshipId)}
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
          )}
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
      className={`flex items-center rounded-md px-4 py-2 text-base font-medium transition-colors ${
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
      size={48}
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
      {children && <div className="flex shrink-0 items-center gap-2.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">{children}</div>}
    </div>
  );
}

function FriendActionsMenu({
  onClose,
  onViewProfile,
  onSendMessage,
  onRemove,
}: {
  onClose: () => void;
  onViewProfile: () => void;
  onSendMessage: () => void;
  onRemove: () => void;
}) {
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
          icon={<ProfileIcon />}
          label="Ver perfil"
          onClick={() => {
            onViewProfile();
            onClose();
          }}
        />
        <MenuItem icon={<MuteIcon />} label="Silenciar" disabled />
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
  onRemove,
}: {
  user: PublicUser;
  friendsSince: string;
  onClose: () => void;
  onSendMessage: () => void;
  onRemove: () => void;
}) {
  const effectiveStatus = getEffectiveStatus(user.status, user.isOnline);
  const [mutualFriends, setMutualFriends] = useState<PublicUser[] | null>(null);
  const [friendsCount, setFriendsCount] = useState<number | null>(null);
  const [mutualError, setMutualError] = useState(false);
  const [blockedConversationId, setBlockedConversationId] = useState<string | null>(null);
  const [reactivating, setReactivating] = useState(false);
  const [reactivated, setReactivated] = useState(false);

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
    try {
      await respondMessageRequest(blockedConversationId, 'accepted');
      setBlockedConversationId(null);
      setReactivated(true);
    } catch {
      // Sin feedback dedicado: es una acción secundaria, el usuario puede reintentar.
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
        className="w-full max-w-sm overflow-hidden rounded-xl border border-surface-border/60 bg-card shadow-2xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative h-24">
          {user.bannerUrl ? (
            <img src={user.bannerUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-gradient-to-r from-primary via-secondary to-primary-light" />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/55"
          >
            <XIcon />
          </button>
        </div>

        <div className="flex flex-col items-center gap-2 px-6 pb-6 pt-0">
          <div className="-mt-10 rounded-full border-4 border-card">
            <FramedAvatar frame={user.avatarFrame} src={user.avatarUrl} alt={user.displayName} size={80} status={effectiveStatus} />
          </div>

          <div className="text-center">
            <p className="text-lg font-semibold text-white">{user.displayName}</p>
            <p className="text-sm text-text-description">@{user.username}</p>
            <p className="mt-1 text-xs text-text-disabled">{STATUS_LABELS[effectiveStatus]}</p>
          </div>

          {user.bio ? (
            <p className="mt-2 w-full whitespace-pre-line rounded-lg bg-bg/60 p-3 text-center text-sm text-text-description">
              {user.bio}
            </p>
          ) : (
            <p className="mt-2 text-sm italic text-text-disabled">Sin biografía</p>
          )}

          <div className="mt-2 flex flex-col items-center gap-1">
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

          <div className="mt-3 w-full">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-description">
              Amigos en común
            </p>
            {mutualError ? (
              <p className="text-sm text-text-disabled">No se pudo cargar</p>
            ) : mutualFriends === null ? (
              <div className="flex justify-center py-2">
                <Spinner size={18} />
              </div>
            ) : mutualFriends.length === 0 ? (
              <p className="text-sm text-text-disabled">Todavía no tienen amigos en común</p>
            ) : (
              <div className="flex flex-col divide-y divide-surface-border/40">
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

          <div className="mt-5 flex w-full gap-2">
            <Button type="button" variant="primary" className="flex-1" onClick={onSendMessage}>
              Enviar mensaje
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
