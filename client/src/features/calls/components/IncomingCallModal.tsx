import { useCall } from '../../../app/CallProvider';
import { useFriends } from '../../../app/FriendsProvider';
import { useEscapeToClose } from '../../../hooks/useEscapeToClose';
import { FramedAvatar } from '../../../components/ui/AvatarFrame';

export function IncomingCallModal() {
  const { incomingCall, acceptIncomingCall, declineIncomingCall } = useCall();
  const { friends } = useFriends();

  useEscapeToClose(() => {
    if (incomingCall) {
      declineIncomingCall();
    }
  });

  if (!incomingCall) {
    return null;
  }

  const caller = friends.find((f) => f.user.id === incomingCall.fromUserId)?.user;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="flex w-full max-w-xs flex-col items-center gap-5 rounded-xl border border-surface-border/60 bg-card px-8 py-8 shadow-2xl shadow-black/40">
        <div className="relative">
          <span className="absolute inset-[-6px] animate-ping rounded-full bg-status-online/25" />
          {caller ? (
            <FramedAvatar frame={caller.avatarFrame} src={caller.avatarUrl} alt={caller.displayName} size={84} />
          ) : (
            <div className="flex h-[84px] w-[84px] items-center justify-center rounded-full bg-surface-hover text-2xl font-semibold text-text-description">
              ?
            </div>
          )}
        </div>

        <div className="text-center">
          <p className="text-lg font-semibold text-white">{caller?.displayName ?? 'Alguien'}</p>
          <p className="mt-1 text-sm text-text-description">Llamada entrante...</p>
        </div>

        <div className="mt-2 flex items-center gap-6">
          <button
            type="button"
            onClick={declineIncomingCall}
            aria-label="Rechazar llamada"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-status-dnd text-white transition-colors hover:brightness-110"
          >
            <PhoneOffIcon />
          </button>
          <button
            type="button"
            onClick={acceptIncomingCall}
            aria-label="Aceptar llamada"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-status-online text-white transition-colors hover:brightness-110"
          >
            <PhoneIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

function PhoneOffIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91" />
      <line x1="23" y1="1" x2="1" y2="23" />
    </svg>
  );
}
