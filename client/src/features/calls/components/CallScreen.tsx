import { useEffect, useState } from 'react';
import type { PublicUser } from '@synccall/shared';
import { useCall } from '../../../app/CallProvider';
import { useAudioDevicePreferences } from '../../../app/AudioDevicePreferencesProvider';
import { useAuth } from '../../../app/AuthProvider';
import { useFriends } from '../../../app/FriendsProvider';
import { useGroups } from '../../../app/GroupsProvider';
import { applyAudioOutputPreference } from '../../../lib/audioOutput';
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
  const { call, micError, callViewMode, toggleMute, toggleDeafen, endCall, leaveGroupCall, retryMic, toggleScreenShare, minimizeCall } =
    useCall();
  const { friends } = useFriends();
  const { groups } = useGroups();
  const { outputDeviceId } = useAudioDevicePreferences();
  const [, forceTick] = useState(0);
  // Preferencia puramente local: "dejé de ver la transmisión de esta persona" — no se avisa al
  // resto ni afecta el track/la conexión, solo oculta el video de este lado hasta que se reactive.
  const [hiddenShareIds, setHiddenShareIds] = useState<Set<string>>(new Set());

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
        return {
          id,
          profile,
          stream: call.participants.get(id)?.stream ?? null,
          screenStream: call.participants.get(id)?.screenStream ?? null,
        };
      })
    : [];

  // El hook de detección de voz tiene que llamarse siempre en el mismo orden (regla de hooks de
  // React), así que se ejecuta incondicionalmente y recién después se decide si hay algo que mostrar.
  const speakingIds = useSpeakingParticipants([
    { id: user?.id ?? 'me', stream: call?.localMuted ? null : (call?.localStream ?? null) },
    ...remoteEntries.map((e) => ({ id: e.id, stream: e.stream })),
  ]);

  if (!call) {
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

  const screenShares: { id: string; label: string; stream: MediaStream; isLocal: boolean }[] = [
    ...(call.localSharingScreen && call.localScreenStream
      ? [{ id: user?.id ?? 'me', label: 'Vos', stream: call.localScreenStream, isLocal: true }]
      : []),
    ...remoteEntries
      .filter((e): e is typeof e & { screenStream: MediaStream } => Boolean(e.screenStream))
      .map((e) => ({ id: e.id, label: e.profile?.displayName ?? 'Usuario', stream: e.screenStream, isLocal: false })),
  ];
  const isSharingHappening = screenShares.length > 0;

  function hideShare(id: string): void {
    setHiddenShareIds((prev) => new Set(prev).add(id));
  }
  function showShare(id: string): void {
    setHiddenShareIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  return (
    <>
      {isVisible && (
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

          {isSharingHappening ? (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:flex-row md:p-8">
              <div className="flex min-h-0 flex-1 flex-wrap items-stretch justify-center gap-4">
                {screenShares.map((share) =>
                  !share.isLocal && hiddenShareIds.has(share.id) ? (
                    <HiddenScreenShareTile key={share.id} label={share.label} onShow={() => showShare(share.id)} />
                  ) : (
                    <ScreenShareTile
                      key={share.id}
                      label={share.label}
                      stream={share.stream}
                      onHide={share.isLocal ? undefined : () => hideShare(share.id)}
                    />
                  ),
                )}
              </div>
              {/* Panel aparte, con su propio fondo, para que los tiles de participantes nunca se
                  superpongan ni "sangren" (glow de quien habla) sobre la transmisión. */}
              <div className="flex shrink-0 flex-wrap items-center justify-center gap-3 rounded-2xl bg-black/20 p-3 md:w-36 md:flex-col md:overflow-y-auto">
                <ParticipantCard
                  profile={user ? { ...user, isOnline: true } : undefined}
                  fallbackLabel="Vos"
                  isSelf
                  compact
                  muted={call.localMuted || !call.localStream}
                  sharingScreen={call.localSharingScreen}
                  speaking={speakingIds.has(user?.id ?? 'me')}
                  connected={call.status === 'active'}
                />
                {remoteEntries.map(({ id, profile, screenStream }) => (
                  <ParticipantCard
                    key={id}
                    profile={profile}
                    fallbackLabel="Usuario"
                    compact
                    sharingScreen={Boolean(screenStream)}
                    speaking={speakingIds.has(id)}
                    connected={call.status === 'active'}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center overflow-y-auto p-6 md:p-10">
              <div className={`flex w-full items-center justify-center ${isPair ? 'max-w-4xl gap-6' : 'max-w-5xl flex-wrap gap-5'}`}>
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
          )}

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
              onClick={toggleDeafen}
              aria-label={call.localDeafened ? 'Dejar de ensordecerse' : 'Ensordecerse'}
              title={call.localDeafened ? 'Dejar de ensordecerse (volver a escuchar)' : 'Ensordecerse (dejar de escuchar a todos)'}
              className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors ${
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
              className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors ${
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
              className="flex h-14 w-14 items-center justify-center rounded-full bg-status-dnd text-white transition-colors hover:brightness-110"
            >
              <PhoneOffIcon />
            </button>
          </div>
        </div>
      )}

      {/* Fuera del `isVisible`: si no, minimizar la llamada desmontaría estos <audio> y se
          cortaría el sonido de la llamada mientras se navega por el resto de la app. */}
      {remoteEntries.map(
        ({ id, stream }) =>
          stream && (
            <audio
              key={id}
              autoPlay
              className="hidden"
              ref={(el) => {
                if (!el) {
                  return;
                }
                if (el.srcObject !== stream) {
                  el.srcObject = stream;
                }
                // Ensordecerse silencia la reproducción de este lado nomás: no toca el track ni
                // la conexión, así que el indicador de "hablando" (que lee el stream, no el
                // <audio>) sigue funcionando igual para el resto.
                el.muted = call.localDeafened;
                applyAudioOutputPreference(el, outputDeviceId);
              }}
            />
          ),
      )}
    </>
  );
}

function ScreenShareTile({ label, stream, onHide }: { label: string; stream: MediaStream; onHide?: () => void }) {
  return (
    <div className="relative flex min-h-[220px] min-w-[280px] flex-1 items-center justify-center overflow-hidden rounded-2xl bg-black shadow-lg shadow-black/40 ring-1 ring-white/10">
      <video
        autoPlay
        playsInline
        muted
        className="max-h-full max-w-full object-contain"
        ref={(el) => {
          if (el && el.srcObject !== stream) {
            el.srcObject = stream;
          }
        }}
      />
      <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
        <ScreenShareIcon size={13} />
        {label}
      </span>
      {onHide && (
        <button
          type="button"
          onClick={onHide}
          title="Dejar de ver esta transmisión"
          className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/75"
        >
          <EyeOffIcon size={13} />
          Dejar de ver
        </button>
      )}
    </div>
  );
}

/** Placeholder que reemplaza el tile grande cuando alguien elige "dejar de ver" la transmisión
 * de otro participante: no toca el track ni la conexión, solo deja de renderizar el <video> de
 * este lado hasta que se elija "ver de nuevo". */
function HiddenScreenShareTile({ label, onShow }: { label: string; onShow: () => void }) {
  return (
    <div className="relative flex min-h-[220px] min-w-[280px] flex-1 flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl bg-card/60 p-6 text-center ring-1 ring-white/10">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-hover text-text-description">
        <EyeOffIcon size={20} />
      </span>
      <p className="text-sm text-text-description">Dejaste de ver la pantalla de {label}</p>
      <button
        type="button"
        onClick={onShow}
        className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
      >
        Ver de nuevo
      </button>
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
  compact = false,
  sharingScreen = false,
  connected = false,
}: {
  profile?: PublicUser;
  fallbackLabel: string;
  speaking: boolean;
  muted?: boolean;
  isSelf?: boolean;
  large?: boolean;
  compact?: boolean;
  sharingScreen?: boolean;
  connected?: boolean;
}) {
  const accent = profile?.accentColor ?? '#5B6DFF';
  const avatarSize = large ? 136 : compact ? 52 : 92;

  return (
    <div
      className={`relative flex flex-col justify-end overflow-hidden rounded-2xl transition-transform duration-150 ${
        compact
          ? 'aspect-[4/3] w-[110px] flex-none'
          : large
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

      {connected && !compact && (
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
        {!compact && (
          <span className="max-w-full truncate rounded-md bg-black/45 px-2.5 py-1 text-sm font-medium text-white backdrop-blur-sm">
            {profile?.displayName ?? fallbackLabel}
            {isSelf ? ' (vos)' : ''}
          </span>
        )}
        {sharingScreen && (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-white" title="Compartiendo pantalla">
            <ScreenShareIcon size={13} />
          </span>
        )}
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

function EyeOffIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

function ScreenShareIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4M8 12l4-4 4 4M12 8v5" />
    </svg>
  );
}

function HeadphonesIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
      <path d="M21 15.5a2.5 2.5 0 0 1-2.5 2.5H17v-6h1.5A2.5 2.5 0 0 1 21 14.5Z" />
      <path d="M3 15.5A2.5 2.5 0 0 0 5.5 18H7v-6H5.5A2.5 2.5 0 0 0 3 14.5Z" />
    </svg>
  );
}

function HeadphonesOffIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 14v-2a9 9 0 0 1 15.6-6.1M21 12.8V14" />
      <path d="M21 15.5a2.5 2.5 0 0 1-2.5 2.5H17v-6h1.5c.34 0 .67.06.97.16" />
      <path d="M3 15.5A2.5 2.5 0 0 0 5.5 18H7v-6H5.5A2.5 2.5 0 0 0 3 14.5Z" />
      <line x1="2" y1="2" x2="22" y2="22" />
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
