import { useState, type ReactNode } from 'react';
import type { PublicUser } from '@synccall/shared';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { FramedAvatar } from '../../../components/ui/AvatarFrame';
import { Input } from '../../../components/ui/Input';
import { Spinner } from '../../../components/ui/Spinner';
import { STATUS_LABELS } from '../../../components/ui/StatusDot';
import { useFriends } from '../hooks/useFriends';
import { useUserSearch } from '../hooks/useUserSearch';

type Tab = 'all' | 'online' | 'pending' | 'add';

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

  const [tab, setTab] = useState<Tab>('all');
  const [removingFriendId, setRemovingFriendId] = useState<string | null>(null);
  const [cancelingRequestId, setCancelingRequestId] = useState<string | null>(null);

  const friendIds = new Set(friends.map((f) => f.user.id));
  const outgoingByUserId = new Map(outgoing.map((r) => [r.user.id, r.id]));
  const incomingByUserId = new Map(incoming.map((r) => [r.user.id, r.id]));
  const onlineFriends = friends.filter((f) => f.user.isOnline);
  const pendingCount = incoming.length + outgoing.length;

  const removingFriend = friends.find((f) => f.friendshipId === removingFriendId);
  const cancelingRequest = outgoing.find((r) => r.id === cancelingRequestId);

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
            {pendingCount > 0 && (
              <span className="ml-1.5 rounded-full bg-status-dnd px-2 py-0.5 text-xs font-semibold text-white">
                {pendingCount}
              </span>
            )}
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
                  <PersonRow key={friendshipId} user={user} subtitle={`@${user.username} · ${STATUS_LABELS[user.status]}`}>
                    <IconButton onClick={() => setRemovingFriendId(friendshipId)} variant="decline" label="Eliminar amigo">
                      <TrashIcon />
                    </IconButton>
                  </PersonRow>
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
                  <FramedAvatar frame={user.avatarFrame} src={user.avatarUrl} alt={user.displayName} size={40} status={user.status} />
                  <div className="min-w-0">
                    <p className="truncate text-base text-white">{user.displayName}</p>
                    <p className="truncate text-sm text-text-description">{STATUS_LABELS[user.status]}</p>
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

function PersonRow({ user, subtitle, children }: { user: PublicUser; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="group flex items-center gap-4 rounded-lg px-3 py-3.5 transition-colors hover:bg-surface-hover">
      <FramedAvatar frame={user.avatarFrame} src={user.avatarUrl} alt={user.displayName} size={48} status={user.status} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium text-white">{user.displayName}</p>
        <p className="truncate text-sm text-text-description">{subtitle ?? `@${user.username}`}</p>
      </div>
      {children && <div className="flex shrink-0 items-center gap-2.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">{children}</div>}
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
