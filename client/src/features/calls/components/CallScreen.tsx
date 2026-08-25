import { useEffect, useState } from 'react';
import type { PublicUser } from '@synccall/shared';
import { useCall } from '../../../app/CallProvider';
import { useAuth } from '../../../app/AuthProvider';
import { useFriends } from '../../../app/FriendsProvider';
import { useGroups } from '../../../app/GroupsProvider';
import { FramedAvatar } from '../../../components/ui/AvatarFrame';
import { useSpeakingParticipants } from '../hooks/useSpeakingParticipants';

function hexToRgba(hex: string, alpha: number): string {
  const clean = /^#[0-9a-f]{6}$/i.test(hex) ? hex.replace('#', '') : '5B6DFF';
  const value = parseInt(clean, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatElapsed(startedAt: number | null): string {
  if (!startedAt) {
    return '00:00';
  }
  const totalSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function CallScreen() {
  const { user } = useAuth();
  const { call, micError, callViewMode, toggleMute, endCall, leaveGroupCall, retryMic, minimizeCall } = useCall();
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

  const isVisible = Boolean(call) && callViewMode === 'full' && (status === 'connecting' || status === 'active');

  const remoteEntries = call
    ? call.remoteUserIds.map((id) => {
        const profile: PublicUser | undefined = call.knownUsers.get(id) ?? friends.find((f) => f.user.id === id)?.user;
        return { id, profile, stream: call.participants.get(id)?.stream ?? null };
      })
    : [];

  // El hook de detección de voz tiene que llamarse siempre en el mismo orden (regla de hooks de
  // React), así que se ejecuta incondicionalmente y recién después se decide si hay algo que mostrar.
  const speakingIds = useSpeakingParticipants([
    { id: user?.id ?? 'me', stream: call?.localMuted ? null : (call?.localStream ?? null) },
    ...remoteEntries.map((e) => ({ id: e.id, stream: e.stream })),
  ]);

  if (!call || !isVisible) {
    return null;
  }

  let title: string;
  if (call.kind === 'dm') {
    title = remoteEntries[0]?.profile?.displayName ?? 'Llamada';
  } else {
    const group = groups.find((g) => g.id === call.groupId);
    title = group ? group.name : 'Llamada de grupo';
  }
  const subtitle = call.status === 'connecting' ? 'Conectando...' : formatElapsed(call.startedAt);
  const totalTiles = 1 + remoteEntries.length;
  const isPair = totalTiles === 2;
  const participantsLabel = call.kind === 'group' ? `${totalTiles} ${totalTiles === 1 ? 'persona' : 'personas'} en la llamada` : null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-gradient-to-b from-bg to-bg-secondary">
      <div className="relative flex shrink-0 flex-col items-center gap-1 px-6 pt-8 text-center">
        <button
          type="button"
          onClick={minimizeCall}
          aria-label="Minimizar llamada"
          title="Minimizar y seguir navegando"
          className="absolute right-4 top-6 flex h-9 w-9 items-center justify-center rounded-full text-text-description transition-colors hover:bg-surface-hover hover:text-white"
        >
          <MinimizeIcon />
        </button>
        <p className="text-lg font-semibold text-white">{title}</p>
        <p className="text-sm text-text-description">{micError ?? subtitle}</p>
        {participantsLabel && !micError && <p className="text-xs text-text-disabled">{participantsLabel}</p>}
      </div>

      <div className="flex flex-1 items-center justify-center overflow-y-auto p-6 md:p-10">
        <div
          className={`flex w-full items-center justify-center ${
            isPair ? 'max-w-4xl gap-6' : 'max-w-5xl flex-wrap gap-5'
          }`}
        >
          <ParticipantCard
            profile={user ? { ...user, isOnline: true } : undefined}
            fallbackLabel="Vos"
            isSelf
            large={isPair}
            muted={call.localMuted || !call.localStream}
            speaking={speakingIds.has(user?.id ?? 'me')}
            connected={call.status === 'active'}
          />
          {remoteEntries.map(({ id, profile }) => (
            <ParticipantCard
              key={id}
              profile={profile}
              fallbackLabel="Usuario"
              large={isPair}
              speaking={speakingIds.has(id)}
              connected={call.status === 'active'}
            />
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-center gap-5 pb-10">
        {call.localStream ? (
          <button
            type="button"
            onClick={toggleMute}
            aria-label={call.localMuted ? 'Activar micrófono' : 'Silenciar micrófono'}
            title={call.localMuted ? 'Activar micrófono' : 'Silenciar micrófono'}
            className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors ${
              call.localMuted ? 'bg-status-dnd text-white' : 'bg-surface-hover text-white hover:bg-surface-border'
            }`}
          >
            {call.localMuted ? <MicOffIcon /> : <MicIcon />}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void retryMic()}
            aria-label="Reintentar micrófono"
            title="Estás escuchando sin poder hablar — reintentar micrófono"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-status-dnd text-white transition-colors hover:brightness-110"
          >
            <MicOffIcon />
          </button>
        )}
        <button
          type="button"
          onClick={call.kind === 'dm' ? endCall : leaveGroupCall}
          aria-label="Colgar"
          title="Colgar"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-status-dnd text-white transition-colors hover:brightness-110"
        >
          <PhoneOffIcon />
        </button>
      </div>

      {remoteEntries.map(
        ({ id, stream }) =>
          stream && (
            <audio
              key={id}
              autoPlay
              className="hidden"
              ref={(el) => {
                if (el && el.srcObject !== stream) {
                  el.srcObject = stream;
                }
              }}
            />
          ),
      )}
    </div>
  );
}

function ParticipantCard({
  profile,
  fallbackLabel,
  speaking,
  muted = false,
  isSelf = false,
  large = false,
  connected = false,
}: {
  profile?: PublicUser;
  fallbackLabel: string;
  speaking: boolean;
  muted?: boolean;
  isSelf?: boolean;
  large?: boolean;
  connected?: boolean;
}) {
  const accent = profile?.accentColor ?? '#5B6DFF';
  const avatarSize = large ? 136 : 92;

  return (
    <div
      className={`relative flex flex-col justify-end overflow-hidden rounded-2xl transition-transform duration-150 ${
        large
          ? 'aspect-[5/4] w-full max-w-[420px] flex-1 basis-[320px]'
          : 'aspect-[4/3] w-full max-w-[280px] flex-1 basis-[220px]'
      }`}
      style={{
        backgroundColor: hexToRgba(accent, 0.22),
        boxShadow: speaking ? `0 0 0 3px ${accent}, 0 0 32px 6px ${hexToRgba(accent, 0.55)}` : '0 0 0 1px rgba(255,255,255,0.08)',
        transform: speaking ? 'scale(1.02)' : 'scale(1)',
      }}
    >
      {profile?.avatarUrl && (
        <img
          src={profile.avatarUrl}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-125 object-cover opacity-25 blur-2xl"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10" />

      {connected && (
        <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/45 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-online opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-status-online" />
          </span>
          En vivo
        </span>
      )}

      <div className="absolute inset-0 flex items-center justify-center">
        {profile ? (
          <FramedAvatar frame={profile.avatarFrame} src={profile.avatarUrl} alt={profile.displayName} size={avatarSize} />
        ) : (
          <div
            className="flex items-center justify-center rounded-full bg-surface-hover text-3xl text-text-description"
            style={{ width: avatarSize, height: avatarSize }}
          >
            ?
          </div>
        )}
      </div>
      <div className="relative z-10 flex items-center gap-2 p-3">
        <span className="max-w-full truncate rounded-md bg-black/45 px-2.5 py-1 text-sm font-medium text-white backdrop-blur-sm">
          {profile?.displayName ?? fallbackLabel}
          {isSelf ? ' (vos)' : ''}
        </span>
        {muted ? (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-status-dnd text-white">
            <MicOffIcon size={13} />
          </span>
        ) : (
          speaking && (
            <span className="flex h-6 shrink-0 items-end gap-[2px] rounded-md bg-black/45 px-1.5 py-1">
              <span className="h-2 w-[3px] animate-eq-bounce rounded-full bg-status-online [animation-delay:0ms]" />
              <span className="h-2 w-[3px] animate-eq-bounce rounded-full bg-status-online [animation-delay:120ms]" />
              <span className="h-2 w-[3px] animate-eq-bounce rounded-full bg-status-online [animation-delay:240ms]" />
            </span>
          )
        )}
      </div>
    </div>
  );
}

function MinimizeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

function MicIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
    </svg>
  );
}

function MicOffIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 9v3a3 3 0 0 0 4.6 2.53M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2M12 19v4M8 23h8" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function PhoneOffIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91" />
      <line x1="23" y1="1" x2="1" y2="23" />
    </svg>
  );
}
