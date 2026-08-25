import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { GroupChannelDeletedPayload, GroupMessage, GroupTypingPayload } from '@synccall/shared';
import { SOCKET_EVENTS } from '@synccall/shared';
import { useAuth } from '../../../app/AuthProvider';
import { useGroups } from '../../../app/GroupsProvider';
import { useGroupDetail } from '../hooks/useGroupDetail';
import { useGroupChannelMessages } from '../hooks/useGroupChannelMessages';
import { useAudioRecorder } from '../../../hooks/useAudioRecorder';
import { useEscapeToClose } from '../../../hooks/useEscapeToClose';
import { socket } from '../../../lib/socketClient';
import { ApiClientError } from '../../../lib/apiClient';
import * as groupsApi from '../api/groups.api';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { FramedAvatar } from '../../../components/ui/AvatarFrame';
import { Spinner } from '../../../components/ui/Spinner';
import { GroupMembersPanel } from '../components/GroupMembersPanel';

const TIME_FORMATTER = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' });
const DAY_FORMATTER = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
const TYPING_STOP_MS = 2000;
const TYPING_CLEAR_MS = 4000;

export function GroupChannelPage() {
  const { groupId, channelId } = useParams<{ groupId: string; channelId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setActiveChannelId, refresh: refreshGroups } = useGroups();
  const { channels, members, loading: groupLoading, refresh: refreshGroupDetail } = useGroupDetail(groupId ?? null);
  const { messages, loading, error, editMessage, deleteMessage, sendMessage } = useGroupChannelMessages(groupId ?? null, channelId ?? null);
  const lastReadMarkedForRef = useRef<string | null>(null);

  const [draft, setDraft] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [typingUserIds, setTypingUserIds] = useState<Set<string>>(new Set());
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recorder = useAudioRecorder();

  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const typingClearTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const membersById = useMemo(() => new Map(members.map((m) => [m.user.id, m.user])), [members]);
  const channel = channels.find((c) => c.id === channelId);
  const currentMemberRole = members.find((m) => m.user.id === user?.id)?.role;
  const canInvite = currentMemberRole === 'owner' || currentMemberRole === 'admin';

  useEffect(() => {
    setActiveChannelId(channelId ?? null);
    return () => setActiveChannelId(null);
  }, [channelId, setActiveChannelId]);

  // Esta página es solo para canales de texto (un canal de voz no tiene mensajes, se une a la
  // llamada con un click desde el rail): si se llega acá con un canal de voz (URL vieja, atrás
  // del navegador), se redirige al primer canal de texto del grupo.
  useEffect(() => {
    if (!groupId || !channel || channel.type !== 'voice') {
      return;
    }
    const fallback = channels.find((c) => c.type === 'text');
    if (fallback) {
      navigate(`/groups/${groupId}/channels/${fallback.id}`, { replace: true });
    }
  }, [groupId, channel, channels, navigate]);

  useEffect(() => {
    if (!groupId || !channelId) {
      return;
    }
    const last = messages[messages.length - 1];
    // Nada que marcar, o el último mensaje ya es mío, o ya marcamos leído hasta este mensaje:
    // mismo patrón que ChatPage para no repetir la llamada al server en cada render.
    if (!last || last.sender === user?.id || lastReadMarkedForRef.current === last.id) {
      return;
    }
    lastReadMarkedForRef.current = last.id;
    void groupsApi.markChannelRead(groupId, channelId).then(() => {
      void refreshGroupDetail();
      void refreshGroups();
    });
  }, [groupId, channelId, messages, user?.id, refreshGroupDetail, refreshGroups]);

  useEffect(() => {
    if (!channelId) {
      return;
    }
    function handleTyping(payload: GroupTypingPayload): void {
      if (payload.channelId !== channelId || !payload.userId || payload.userId === user?.id) {
        return;
      }
      const uid = payload.userId;
      setTypingUserIds((prev) => {
        const next = new Set(prev);
        if (payload.isTyping) {
          next.add(uid);
        } else {
          next.delete(uid);
        }
        return next;
      });
      clearTimeout(typingClearTimersRef.current.get(uid));
      if (payload.isTyping) {
        const timer = setTimeout(() => {
          setTypingUserIds((prev) => {
            const next = new Set(prev);
            next.delete(uid);
            return next;
          });
        }, TYPING_CLEAR_MS);
        typingClearTimersRef.current.set(uid, timer);
      }
    }
    socket.on(SOCKET_EVENTS.GROUP_TYPING, handleTyping);
    return () => {
      socket.off(SOCKET_EVENTS.GROUP_TYPING, handleTyping);
      typingClearTimersRef.current.forEach((t) => clearTimeout(t));
      typingClearTimersRef.current.clear();
    };
  }, [channelId, user?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, channelId]);

  useEffect(() => {
    if (!groupId || !channelId) {
      return;
    }
    // Si borran el canal que tenemos abierto (nosotros u otro admin), no nos podemos quedar
    // parados en una página que apunta a un canal que ya no existe: mandamos a /groups/:groupId,
    // que redirige sola al canal por defecto que quede.
    function handleChannelDeleted(payload: GroupChannelDeletedPayload): void {
      if (payload.groupId === groupId && payload.channelId === channelId) {
        navigate(`/groups/${groupId}`, { replace: true });
      }
    }
    socket.on(SOCKET_EVENTS.GROUP_CHANNEL_DELETED, handleChannelDeleted);
    return () => {
      socket.off(SOCKET_EVENTS.GROUP_CHANNEL_DELETED, handleChannelDeleted);
    };
  }, [groupId, channelId, navigate]);

  function emitTyping(isTyping: boolean): void {
    if (!channelId) {
      return;
    }
    socket.emit(SOCKET_EVENTS.GROUP_TYPING, { channelId, isTyping });
  }

  function handleDraftChange(value: string): void {
    setDraft(value);
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      emitTyping(true);
    }
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      emitTyping(false);
    }, TYPING_STOP_MS);
  }

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    if (!draft.trim()) {
      return;
    }
    sendMessage(draft);
    setDraft('');
    clearTimeout(typingTimeoutRef.current);
    isTypingRef.current = false;
    emitTyping(false);
  }

  function handleComposerKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  }

  async function handleImageSelected(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !groupId || !channelId) {
      return;
    }
    setImageError(null);
    setUploadingImage(true);
    try {
      await groupsApi.uploadChannelImage(groupId, channelId, file);
    } catch (err) {
      setImageError(err instanceof ApiClientError ? err.message : 'No se pudo enviar la imagen');
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSendVoiceMessage(): Promise<void> {
    const blob = await recorder.stopAndGetBlob();
    if (!blob || !groupId || !channelId) {
      return;
    }
    setVoiceError(null);
    setUploadingVoice(true);
    try {
      await groupsApi.uploadChannelVoiceMessage(groupId, channelId, blob);
    } catch (err) {
      setVoiceError(err instanceof ApiClientError ? err.message : 'No se pudo enviar el audio');
    } finally {
      setUploadingVoice(false);
    }
  }

  const typingNames = Array.from(typingUserIds)
    .map((uid) => membersById.get(uid)?.displayName)
    .filter((name): name is string => Boolean(name));

  if (!groupId || !channelId) {
    return null;
  }

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-surface-border/60 px-4 py-3">
          <span className="text-text-disabled">#</span>
          <span className="font-semibold text-white">{channel?.name ?? '...'}</span>
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto px-4 py-4">
          {loading || groupLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : error ? (
            <p className="text-sm text-status-dnd">{error}</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-text-disabled">Todavía no hay mensajes en este canal. ¡Escribí el primero!</p>
          ) : (
            groupByDay(messages).map((group) => (
              <div key={group.dayLabel}>
                <div className="my-4 flex items-center gap-3 text-xs text-text-disabled">
                  <div className="h-px flex-1 bg-surface-border/60" />
                  {group.dayLabel}
                  <div className="h-px flex-1 bg-surface-border/60" />
                </div>
                {group.messages.map((message) =>
                  message.type === 'system' ? (
                    <GroupSystemMessage key={message.id} message={message} />
                  ) : (
                    <GroupMessageBubble
                      key={message.id}
                      message={message}
                      isOwn={message.sender === user?.id}
                      isEditing={editingMessageId === message.id}
                      editDraft={editDraft}
                      onOpenImage={setViewingImageUrl}
                      onStartEdit={() => {
                        setEditingMessageId(message.id);
                        setEditDraft(message.content);
                      }}
                      onCancelEdit={() => setEditingMessageId(null)}
                      onEditDraftChange={setEditDraft}
                      onSubmitEdit={() => {
                        editMessage(message.id, editDraft);
                        setEditingMessageId(null);
                      }}
                      onDelete={() => setDeletingMessageId(message.id)}
                    />
                  ),
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {typingNames.length > 0 && (
          <div className="shrink-0 px-4 pb-1 text-xs italic text-text-disabled">
            {typingNames.join(', ')} {typingNames.length === 1 ? 'está escribiendo...' : 'están escribiendo...'}
          </div>
        )}

        {imageError && <p className="shrink-0 px-4 pt-2 text-xs text-status-dnd">{imageError}</p>}
        {voiceError && <p className="shrink-0 px-4 pt-2 text-xs text-status-dnd">{voiceError}</p>}
        {recorder.error && <p className="shrink-0 px-4 pt-2 text-xs text-status-dnd">{recorder.error}</p>}

        {recorder.isRecording ? (
          <div className="flex shrink-0 items-center gap-3 border-t border-surface-border/60 px-4 py-3">
            <button
              type="button"
              onClick={recorder.cancelRecording}
              aria-label="Cancelar grabación"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-description transition-colors hover:bg-status-dnd/15 hover:text-status-dnd"
            >
              <TrashIcon />
            </button>
            <div className="flex flex-1 items-center gap-2 text-sm text-white">
              <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-status-dnd" />
              Grabando...
              <span className="tabular-nums text-text-description">{formatDuration(recorder.elapsedSeconds)}</span>
            </div>
            <button
              type="button"
              onClick={() => void handleSendVoiceMessage()}
              aria-label="Enviar audio"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary-hover"
            >
              <SendIcon />
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex shrink-0 items-end gap-2 border-t border-surface-border/60 p-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => void handleImageSelected(e)}
              disabled={uploadingImage}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage}
              aria-label="Adjuntar imagen"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-description transition-colors hover:bg-surface-hover hover:text-white disabled:opacity-40"
            >
              {uploadingImage ? <Spinner size={18} /> : <ImageIcon />}
            </button>
            <textarea
              value={draft}
              onChange={(e) => handleDraftChange(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={`Mandar mensaje a #${channel?.name ?? ''}`}
              rows={1}
              className="max-h-32 flex-1 resize-none rounded-lg border border-surface-border/60 bg-bg/60 px-3 py-2 text-sm text-white outline-none placeholder:text-text-disabled focus:border-primary"
            />
            {draft.trim() ? (
              <button
                type="submit"
                aria-label="Enviar mensaje"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary-hover"
              >
                <SendIcon />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void recorder.startRecording()}
                disabled={uploadingVoice}
                aria-label="Grabar mensaje de voz"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-description transition-colors hover:bg-surface-hover hover:text-white disabled:opacity-40"
              >
                {uploadingVoice ? <Spinner size={18} /> : <MicIcon />}
              </button>
            )}
          </form>
        )}
      </div>

      <GroupMembersPanel groupId={groupId} members={members} loading={groupLoading} canInvite={canInvite} />

      {viewingImageUrl && <ImageLightbox url={viewingImageUrl} onClose={() => setViewingImageUrl(null)} />}

      {deletingMessageId && (
        <ConfirmDialog
          title="¿Eliminar mensaje?"
          description="Esta acción no se puede deshacer."
          confirmLabel="Eliminar"
          variant="danger"
          onConfirm={() => {
            deleteMessage(deletingMessageId);
            setDeletingMessageId(null);
          }}
          onCancel={() => setDeletingMessageId(null)}
        />
      )}
    </div>
  );
}

function GroupSystemMessage({ message }: { message: GroupMessage }) {
  const name = message.senderInfo.displayName;
  const text =
    message.systemEvent === 'call_ended'
      ? `Se realizó una llamada de voz · ${formatDuration(message.durationSec ?? 0)}`
      : message.systemEvent === 'member_removed'
        ? `${name} fue expulsado del grupo`
        : `${name} salió del grupo`;

  return (
    <div className="flex items-center gap-3 px-2 py-1.5 text-xs text-text-disabled">
      <span>{text}</span>
      <span className="text-[11px]">{TIME_FORMATTER.format(new Date(message.createdAt))}</span>
    </div>
  );
}

function GroupMessageBubble({
  message,
  isOwn,
  isEditing,
  editDraft,
  onOpenImage,
  onStartEdit,
  onCancelEdit,
  onEditDraftChange,
  onSubmitEdit,
  onDelete,
}: {
  message: GroupMessage;
  isOwn: boolean;
  isEditing: boolean;
  editDraft: string;
  onOpenImage: (url: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onEditDraftChange: (value: string) => void;
  onSubmitEdit: () => void;
  onDelete: () => void;
}) {
  const { displayName, avatarUrl, avatarFrame } = message.senderInfo;

  return (
    <div className="group flex items-start gap-3 rounded-md px-2 py-1.5 hover:bg-surface-hover/40">
      <FramedAvatar frame={avatarFrame} src={avatarUrl} alt={displayName} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-white">{displayName}</span>
          <span className="text-[11px] text-text-disabled">{TIME_FORMATTER.format(new Date(message.createdAt))}</span>
          {message.editedAt && !message.deleted && <span className="text-[10px] text-text-disabled">(editado)</span>}
        </div>

        {message.deleted ? (
          <p className="text-sm italic text-text-disabled">Mensaje eliminado</p>
        ) : isEditing ? (
          <div className="mt-1 flex flex-col gap-1.5">
            <textarea
              value={editDraft}
              onChange={(e) => onEditDraftChange(e.target.value)}
              rows={1}
              autoFocus
              className="w-full resize-none rounded-md border border-primary/50 bg-bg/60 px-2 py-1 text-sm text-white outline-none"
            />
            <div className="flex gap-2 text-xs">
              <button type="button" onClick={onSubmitEdit} className="text-primary hover:underline">
                Guardar
              </button>
              <button type="button" onClick={onCancelEdit} className="text-text-description hover:underline">
                Cancelar
              </button>
            </div>
          </div>
        ) : message.type === 'audio' && message.mediaUrl ? (
          <div className="mt-1">
            <VoiceMessagePlayer url={message.mediaUrl} durationSec={message.durationSec} />
          </div>
        ) : message.type === 'image' && message.mediaUrl ? (
          <div className="mt-1 max-w-sm overflow-hidden rounded-lg">
            <button type="button" onClick={() => onOpenImage(message.mediaUrl!)} className="block">
              <img src={message.mediaUrl} alt="Imagen enviada" className="max-h-72 max-w-full object-cover" />
            </button>
            {message.content && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-text-description">{message.content}</p>}
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm text-text-description">{message.content}</p>
        )}
      </div>

      {isOwn && !message.deleted && !isEditing && (
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          {message.type !== 'audio' && (
            <button type="button" onClick={onStartEdit} aria-label="Editar mensaje" className="rounded p-1 text-text-disabled hover:bg-surface-hover hover:text-white">
              <EditIcon />
            </button>
          )}
          <button type="button" onClick={onDelete} aria-label="Eliminar mensaje" className="rounded p-1 text-text-disabled hover:bg-status-dnd/15 hover:text-status-dnd">
            <TrashIcon />
          </button>
        </div>
      )}
    </div>
  );
}

function groupByDay(messages: GroupMessage[]): { dayLabel: string; messages: GroupMessage[] }[] {
  const groups: { dayLabel: string; messages: GroupMessage[] }[] = [];
  for (const message of messages) {
    const dayLabel = DAY_FORMATTER.format(new Date(message.createdAt));
    const last = groups[groups.length - 1];
    if (last && last.dayLabel === dayLabel) {
      last.messages.push(message);
    } else {
      groups.push({ dayLabel, messages: [message] });
    }
  }
  return groups;
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />
    </svg>
  );
}

function formatDuration(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.round(totalSeconds)) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function VoiceMessagePlayer({ url, durationSec }: { url: string; durationSec?: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSec ?? 0);

  function togglePlay(): void {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (isPlaying) {
      audio.pause();
    } else {
      void audio.play();
    }
  }

  function handleSeek(e: ChangeEvent<HTMLInputElement>): void {
    const audio = audioRef.current;
    const value = Number(e.target.value);
    if (audio) {
      audio.currentTime = value;
    }
    setCurrentTime(value);
  }

  return (
    <div className="flex w-60 max-w-full items-center gap-2.5 rounded-lg bg-bg/60 px-3 py-2">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const loaded = e.currentTarget.duration;
          if (Number.isFinite(loaded)) {
            setDuration(loaded);
          }
        }}
        className="hidden"
      />
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-hover text-white transition-colors hover:bg-surface-hover/70"
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={Math.min(currentTime, duration || 0)}
        onChange={handleSeek}
        aria-label="Progreso del audio"
        className="h-1 flex-1 accent-primary"
      />
      <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-text-disabled">
        {formatDuration(isPlaying || currentTime > 0 ? currentTime : duration)}
      </span>
    </div>
  );
}

function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEscapeToClose(onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm" onClick={onClose}>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60"
      >
        <XIcon />
      </button>
      <img src={url} alt="Imagen enviada" className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

function ImageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4.5v15l13-7.5Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <rect x="5" y="4" width="5" height="16" rx="1" />
      <rect x="14" y="4" width="5" height="16" rx="1" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.4 20.6 21 12 3.4 3.4 3 10l13 2-13 2z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

