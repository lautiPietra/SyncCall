import { useCall } from '../../../app/CallProvider';
import { useFriends } from '../../../app/FriendsProvider';
import { FramedAvatar } from '../../../components/ui/AvatarFrame';

/** Barra fina que solo se ve mientras estás llamando y todavía no te contestaron: una vez que
 * se acepta, `CallScreen` toma la pantalla completa (acá no hay audio ni mic todavía). */
export function CallBar() {
  const { call, cancelOutgoingCall } = useCall();
  const { friends } = useFriends();

  if (!call || call.status !== 'outgoing-ringing') {
    return null;
  }

  const peer = friends.find((f) => f.user.id === call.remoteUserIds[0])?.user;

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center gap-3 border-b border-surface-border/60 bg-card px-4 py-2 shadow-lg shadow-black/30">
      {peer ? (
        <FramedAvatar frame={peer.avatarFrame} src={peer.avatarUrl} alt={peer.displayName} size={28} />
      ) : (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-status-online/20 text-status-online">
          <PhoneIcon />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{peer?.displayName ?? 'Llamada'}</p>
        <p className="truncate text-xs text-text-description">Llamando...</p>
      </div>

      <button
        type="button"
        onClick={cancelOutgoingCall}
        aria-label="Cancelar llamada"
        title="Cancelar llamada"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-status-dnd text-white transition-colors hover:brightness-110"
      >
        <PhoneOffIcon />
      </button>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

function PhoneOffIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91" />
      <line x1="23" y1="1" x2="1" y2="23" />
    </svg>
  );
}
