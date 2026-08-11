import { useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { getEffectiveStatus } from '@synccall/shared';
import { useAuth } from './AuthProvider';
import { useFriends } from './FriendsProvider';
import { useConversations } from './ConversationsProvider';
import { useMessageRequests } from './MessageRequestsProvider';
import { useSocketConnected } from './SocketProvider';
import { SyncCallMark } from '../components/ui/SyncCallMark';
import { FramedAvatar } from '../components/ui/AvatarFrame';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { CountBadge } from '../components/ui/CountBadge';
import { Spinner } from '../components/ui/Spinner';
import { STATUS_LABELS } from '../components/ui/StatusDot';

export function AppLayout() {
  const { user, logout } = useAuth();
  const { friends } = useFriends();
  const { conversations, loading: conversationsLoading, hide } = useConversations();
  const { requests: messageRequests } = useMessageRequests();
  const socketConnected = useSocketConnected();
  const navigate = useNavigate();
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [dmSearchQuery, setDmSearchQuery] = useState('');
  const [dmPickerOpen, setDmPickerOpen] = useState(false);
  const dmSearchInputRef = useRef<HTMLInputElement>(null);

  const friendsWithoutConversation = useMemo(() => {
    const conversationFriendIds = new Set(conversations.map((c) => c.otherUser.id));
    return friends.filter((f) => !conversationFriendIds.has(f.user.id));
  }, [friends, conversations]);

  const dmSearchResults = useMemo(() => {
    const query = dmSearchQuery.trim().toLowerCase();
    if (!query) {
      return friendsWithoutConversation;
    }
    return friendsWithoutConversation.filter(
      (f) => f.user.displayName.toLowerCase().includes(query) || f.user.username.toLowerCase().includes(query),
    );
  }, [friendsWithoutConversation, dmSearchQuery]);

  function openChat(friendId: string): void {
    navigate(`/chat/${friendId}`);
    setDmPickerOpen(false);
    setDmSearchQuery('');
    setMobileNavOpen(false);
  }

  if (!user) {
    return null;
  }

  const selfStatus = getEffectiveStatus(user.status, socketConnected);

  return (
    <div className="flex h-screen overflow-hidden">
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[280px] shrink-0 flex-col border-r border-surface-border/60 bg-sidebar transition-transform duration-200 ease-out lg:static lg:w-[350px] lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Link
          to="/"
          onClick={() => setMobileNavOpen(false)}
          className="flex items-center gap-2.5 px-4 py-4 transition-opacity hover:opacity-80"
        >
          <SyncCallMark size={40} />
          <span className="text-lg font-bold text-white">SyncCall</span>
        </Link>

        <div className="relative px-3 pb-3">
          <input
            ref={dmSearchInputRef}
            value={dmSearchQuery}
            onChange={(e) => {
              setDmSearchQuery(e.target.value);
              setDmPickerOpen(true);
            }}
            onFocus={() => setDmPickerOpen(true)}
            placeholder="Busca o inicia una conversación"
            className="w-full rounded-md border border-surface-border/60 bg-bg/60 px-3 py-1.5 text-sm text-white outline-none placeholder:text-text-disabled focus:border-primary"
          />
          {dmPickerOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setDmPickerOpen(false)} />
              <div className="absolute left-3 right-3 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-lg border border-surface-border/60 bg-card py-1.5 shadow-2xl shadow-black/40">
                {dmSearchResults.length === 0 ? (
                  <p className="px-3 py-2.5 text-xs text-text-disabled">
                    {dmSearchQuery.trim()
                      ? 'No se encontraron amigos'
                      : friends.length === 0
                        ? 'Todavía no tenés amigos agregados'
                        : 'Ya iniciaste una conversación con todos tus amigos'}
                  </p>
                ) : (
                  dmSearchResults.map(({ friendshipId, user: friend }) => (
                    <button
                      key={friendshipId}
                      type="button"
                      onClick={() => openChat(friend.id)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-text-description transition-colors hover:bg-surface-hover hover:text-white"
                    >
                      <FramedAvatar frame={friend.avatarFrame} src={friend.avatarUrl} alt={friend.displayName} size={24} />
                      <span className="truncate">{friend.displayName}</span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        <nav className="flex flex-col gap-0.5 px-3">
          <NavLink
            to="/"
            end
            onClick={() => setMobileNavOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
                isActive ? 'bg-surface-hover text-white' : 'text-text-description hover:bg-surface-hover/60 hover:text-white'
              }`
            }
          >
            <FriendsIcon />
            Amigos
          </NavLink>
          <NavLink
            to="/message-requests"
            onClick={() => setMobileNavOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
                isActive ? 'bg-surface-hover text-white' : 'text-text-description hover:bg-surface-hover/60 hover:text-white'
              }`
            }
          >
            <InboxIcon />
            <span className="flex-1">Solicitudes de mensajes</span>
            <CountBadge count={messageRequests.length} className="h-5 min-w-5 px-1.5 text-[11px]" />
          </NavLink>
        </nav>

        <div className="mt-4 flex items-center justify-between px-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-description">Mensajes directos</span>
          <button
            type="button"
            onClick={() => dmSearchInputRef.current?.focus()}
            aria-label="Agregar amigo a mensajes directos"
            className="flex h-5 w-5 items-center justify-center rounded text-text-description transition-colors hover:bg-surface-hover hover:text-white"
          >
            <PlusIcon />
          </button>
        </div>

        <div className="mt-1 flex-1 overflow-y-auto px-2 pb-2">
          {conversationsLoading ? (
            <div className="flex justify-center py-6">
              <Spinner size={18} />
            </div>
          ) : conversations.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-text-disabled">
              Todavía no iniciaste ninguna conversación. Buscá arriba o tocá + para empezar.
            </p>
          ) : (
            conversations.map((conv) => {
              const friend = conv.otherUser;
              return (
                <div key={conv.id} className="group relative">
                  <NavLink
                    to={`/chat/${friend.id}`}
                    onClick={() => setMobileNavOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-md py-1.5 pl-2.5 pr-8 text-sm transition-colors ${
                        isActive
                          ? 'bg-surface-hover text-white'
                          : 'text-text-description hover:bg-surface-hover/60 hover:text-white'
                      }`
                    }
                  >
                    <FramedAvatar
                      frame={friend.avatarFrame}
                      src={friend.avatarUrl}
                      alt={friend.displayName}
                      size={28}
                      status={getEffectiveStatus(friend.status, friend.isOnline)}
                    />
                    <span className={`truncate flex-1 ${conv.unreadCount > 0 ? 'font-semibold text-white' : ''}`}>
                      {friend.displayName}
                    </span>
                    <CountBadge count={conv.unreadCount} className="h-5 min-w-5 px-1.5 text-[11px]" />
                  </NavLink>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void hide(conv.id);
                    }}
                    aria-label={`Eliminar conversación con ${friend.displayName}`}
                    className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-text-disabled opacity-0 transition-opacity hover:bg-status-dnd/15 hover:text-status-dnd group-hover:opacity-100"
                  >
                    <XIcon />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-1.5 border-t border-surface-border/60 p-2">
          <Link
            to="/profile"
            onClick={() => setMobileNavOpen(false)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-hover"
          >
            <FramedAvatar frame={user.avatarFrame} src={user.avatarUrl} alt={user.displayName} size={32} status={selfStatus} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{user.displayName}</p>
              <p className="truncate text-xs text-text-description">{STATUS_LABELS[selfStatus]}</p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setConfirmingLogout(true)}
            aria-label="Cerrar sesión"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-description transition-colors hover:bg-status-dnd/15 hover:text-status-dnd"
          >
            <LogoutIcon />
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-surface-border/60 bg-sidebar px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Abrir menú"
            className="flex h-8 w-8 items-center justify-center rounded-md text-text-description transition-colors hover:bg-surface-hover hover:text-white"
          >
            <MenuIcon />
          </button>
          <SyncCallMark size={26} />
          <span className="font-semibold text-white">SyncCall</span>
        </div>

        <main className="min-w-0 flex-1 overflow-y-auto bg-sidebar">
          <Outlet />
        </main>
      </div>

      {confirmingLogout && (
        <ConfirmDialog
          title="¿Cerrar sesión?"
          description="Vas a tener que volver a iniciar sesión para acceder a tu cuenta."
          confirmLabel="Cerrar sesión"
          variant="danger"
          onConfirm={() => void logout()}
          onCancel={() => setConfirmingLogout(false)}
        />
      )}
    </div>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function FriendsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 5.5a3.5 3.5 0 0 1 0 7" />
      <path d="M15 13.2c2.9.4 5 2.1 5 6.8" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}
