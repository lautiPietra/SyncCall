import { useEffect, useState } from 'react';
import { useCall } from '../../../app/CallProvider';
import { useFriends } from '../../../app/FriendsProvider';
import { useGroups } from '../../../app/GroupsProvider';
import { FramedAvatar } from '../../../components/ui/AvatarFrame';
import { CallParticipantsStack } from './CallParticipantsStack';

function formatElapsed(startedAt: number | null): string {
  if (!startedAt) {
    return '00:00';
  }
  const totalSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Widget flotante que reemplaza a `CallScreen` cuando se minimiza la llamada: deja navegar por
 * el resto de la app (chatear, entrar a grupos, etc.) mientras se sigue en la llamada, con
 * controles rápidos y un botón para volver a la pantalla completa. */
export function MinimizedCallWidget() {
  const { call, callViewMode, toggleMute, toggleDeafen, endCall, leaveGroupCall, toggleScreenShare, expandCall } = useCall();
  const { friends } = useFriends();
  const { groups } = useGroups();
  const [, forceTick] = useState(0);

  const status = call?.status;
  useEffect(() => {
    if (status !== 'active') {
      return;
    }
    const interval = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [status]);

  if (!call || callViewMode !== 'minimized' || (status !== 'connecting' && status !== 'active')) {
    return null;
  }

  let title: string;
  if (call.kind === 'dm') {
    const peerId = call.remoteUserIds[0];
    const peer = call.knownUsers.get(peerId) ?? friends.find((f) => f.user.id === peerId)?.user;
    title = peer?.displayName ?? 'Llamada';
  } else {
    const group = groups.find((g) => g.id === call.groupId);
    title = group ? group.name : 'Llamada de grupo';
  }
  const subtitle = status === 'connecting' ? 'Conectando...' : formatElapsed(call.startedAt);
  const dmPeer =
    call.kind === 'dm'
      ? (call.knownUsers.get(call.remoteUserIds[0]) ?? friends.find((f) => f.user.id === call.remoteUserIds[0])?.user)
      : undefined;

  return (
    <div className="fixed bottom-5 right-5 z-[65] flex items-center gap-1.5 rounded-2xl border border-surface-border/60 bg-card p-2 pr-2.5 shadow-2xl shadow-black/40">
      <button
        type="button"
        onClick={expandCall}
        aria-label="Volver a la pantalla de llamada"
        title="Volver a la pantalla de llamada"
        className="flex min-w-0 items-center gap-2.5 rounded-xl px-1.5 py-1 transition-colors hover:bg-surface-hover"
      >
        {call.kind === 'dm' ? (
          dmPeer ? (
            <FramedAvatar frame={dmPeer.avatarFrame} src={dmPeer.avatarUrl} alt={dmPeer.displayName} size={34} />
          ) : (
            <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-surface-hover text-text-description">?</div>
          )
        ) : (
          <CallParticipantsStack userIds={call.remoteUserIds} usersById={call.knownUsers} size={26} max={3} />
        )}
        <div className="min-w-0 text-left">
          <p className="max-w-[130px] truncate text-sm font-medium text-white">{title}</p>
          <p className="truncate text-xs text-text-description">{subtitle}</p>
        </div>
      </button>

      <button
        type="button"
        onClick={toggleMute}
        aria-label={call.localMuted ? 'Activar micrófono' : 'Silenciar micrófono'}
        title={call.localMuted ? 'Activar micrófono' : 'Silenciar micrófono'}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
          call.localMuted ? 'bg-status-dnd text-white' : 'bg-surface-hover text-white hover:bg-surface-border'
        }`}
      >
        {call.localMuted ? <MicOffIcon /> : <MicIcon />}
      </button>
      <button
        type="button"
        onClick={toggleDeafen}
        aria-label={call.localDeafened ? 'Dejar de ensordecerse' : 'Ensordecerse'}
        title={call.localDeafened ? 'Dejar de ensordecerse (volver a escuchar)' : 'Ensordecerse (dejar de escuchar a todos)'}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
          call.localDeafened ? 'bg-status-dnd text-white' : 'bg-surface-hover text-white hover:bg-surface-border'
        }`}
      >
        {call.localDeafened ? <HeadphonesOffIcon /> : <HeadphonesIcon />}
      </button>
      <button
        type="button"
        onClick={toggleScreenShare}
        aria-label={call.localSharingScreen ? 'Dejar de compartir pantalla' : 'Compartir pantalla'}
        title={call.localSharingScreen ? 'Dejar de compartir pantalla' : 'Compartir pantalla'}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
          call.localSharingScreen ? 'bg-primary text-white' : 'bg-surface-hover text-white hover:bg-surface-border'
        }`}
      >
        <ScreenShareIcon />
      </button>
      <button
        type="button"
        onClick={call.kind === 'dm' ? endCall : leaveGroupCall}
        aria-label="Colgar"
        title="Colgar"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-status-dnd text-white transition-colors hover:brightness-110"
      >
        <PhoneOffIcon />
      </button>
      <button
        type="button"
        onClick={expandCall}
        aria-label="Expandir llamada"
        title="Expandir"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-description transition-colors hover:bg-surface-hover hover:text-white"
      >
        <ExpandIcon />
      </button>
    </div>
  );
}

function ScreenShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4M8 12l4-4 4 4M12 8v5" />
    </svg>
  );
}

function HeadphonesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
      <path d="M21 15.5a2.5 2.5 0 0 1-2.5 2.5H17v-6h1.5A2.5 2.5 0 0 1 21 14.5Z" />
      <path d="M3 15.5A2.5 2.5 0 0 0 5.5 18H7v-6H5.5A2.5 2.5 0 0 0 3 14.5Z" />
    </svg>
  );
}

function HeadphonesOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 14v-2a9 9 0 0 1 15.6-6.1M21 12.8V14" />
      <path d="M21 15.5a2.5 2.5 0 0 1-2.5 2.5H17v-6h1.5c.34 0 .67.06.97.16" />
      <path d="M3 15.5A2.5 2.5 0 0 0 5.5 18H7v-6H5.5A2.5 2.5 0 0 0 3 14.5Z" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 9v3a3 3 0 0 0 4.6 2.53M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2M12 19v4M8 23h8" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function PhoneOffIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91" />
      <line x1="23" y1="1" x2="1" y2="23" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8V3h5M21 16v5h-5M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}
