import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AvatarFrameId, ConversationRequestStatus, DmTypingPayload, Message, MessageRequestResolvedPayload } from '@synccall/shared';
import { SOCKET_EVENTS, getEffectiveStatus } from '@synccall/shared';
import { useAuth } from '../../../app/AuthProvider';
import { useFriends } from '../../../app/FriendsProvider';
import { useConversations } from '../../../app/ConversationsProvider';
import { useMessageRequests } from '../../../app/MessageRequestsProvider';
import { socket } from '../../../lib/socketClient';
import { ApiClientError } from '../../../lib/apiClient';
import { FramedAvatar } from '../../../components/ui/AvatarFrame';
import { Spinner } from '../../../components/ui/Spinner';
import { STATUS_LABELS } from '../../../components/ui/StatusDot';
import { useConversationMessages } from '../hooks/useConversationMessages';
import * as conversationsApi from '../api/conversations.api';

const TIME_FORMATTER = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' });
const DAY_FORMATTER = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
const TYPING_STOP_MS = 2000;

export function ChatPage() {
  const { friendId } = useParams<{ friendId: string }>();
  const { user } = useAuth();
  const { friends, loading: friendsLoading } = useFriends();
  const { refresh: refreshConversations } = useConversations();
  const { accept: acceptRequest, decline: declineRequest, respondingIds } = useMessageRequests();

  const friend = friends.find((f) => f.user.id === friendId);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [requestMeta, setRequestMeta] = useState<{ status: ConversationRequestStatus; requestedBy: string } | null>(null);

  useEffect(() => {
    setConversationId(null);
    setConversationError(null);
    setRequestMeta(null);
    if (!friendId) {
      return;
    }
    conversationsApi
      .getOrCreateConversation(friendId)
      .then(({ conversation }) => {
        setConversationId(conversation.id);
        setRequestMeta({ status: conversation.requestStatus, requestedBy: conversation.requestedBy ?? '' });
        // Recién creada o reabierta (por ej. la habías sacado de mensajes directos): que
        // aparezca ya en el sidebar sin esperar a que llegue o mandes un mensaje.
        void refreshConversations();
      })
      .catch((err) => {
        const message =
          err instanceof ApiClientError && err.status === 403
            ? 'Ya no sos amigo de este usuario'
            : 'No se pudo abrir la conversación';
        setConversationError(message);
      });
  }, [friendId]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }
    function handleResolved(payload: MessageRequestResolvedPayload): void {
      if (payload.conversationId !== conversationId) {
        return;
      }
      setRequestMeta((prev) => (prev ? { ...prev, status: payload.status } : prev));
    }
    socket.on(SOCKET_EVENTS.MESSAGE_REQUEST_RESOLVED, handleResolved);
    return () => {
      socket.off(SOCKET_EVENTS.MESSAGE_REQUEST_RESOLVED, handleResolved);
    };
  }, [conversationId]);

  const isPendingForMe = requestMeta?.status === 'pending' && requestMeta.requestedBy !== user?.id;
  const isPendingMine = requestMeta?.status === 'pending' && requestMeta.requestedBy === user?.id;
  const isBlockedByThem = requestMeta?.status === 'declined' && requestMeta.requestedBy === user?.id;
  const isBlockedByMe = requestMeta?.status === 'declined' && requestMeta.requestedBy !== user?.id;
  const canSendMessages = !isPendingForMe && !isBlockedByThem && !isBlockedByMe;

  const { messages, loading, loadingOlder, hasMore, error, loadOlder, sendMessage } =
    useConversationMessages(conversationId);

  const [draft, setDraft] = useState('');
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastReadMarkedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!conversationId) {
      return;
    }
    const last = messages[messages.length - 1];
    // Nada que marcar, o el último mensaje ya es mío (no me sumo no-leídos a mí mismo), o
    // ya marcamos leído hasta este mensaje: no repetir la llamada al server en cada render
    // (por ejemplo al cargar mensajes anteriores, que también cambia el array).
    if (!last || last.sender === user?.id || lastReadMarkedForRef.current === last.id) {
      return;
    }
    lastReadMarkedForRef.current = last.id;
    void conversationsApi.markConversationRead(conversationId).then(() => void refreshConversations());
  }, [conversationId, messages, user?.id, refreshConversations]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }
    let clearTimer: ReturnType<typeof setTimeout>;
    function handleTyping(payload: DmTypingPayload): void {
      if (payload.conversationId !== conversationId) {
        return;
      }
      setIsOtherTyping(payload.isTyping);
      clearTimeout(clearTimer);
      if (payload.isTyping) {
        clearTimer = setTimeout(() => setIsOtherTyping(false), 4000);
      }
    }
    socket.on(SOCKET_EVENTS.DM_TYPING, handleTyping);
    return () => {
      socket.off(SOCKET_EVENTS.DM_TYPING, handleTyping);
      clearTimeout(clearTimer);
    };
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, conversationId]);

  function emitTyping(isTyping: boolean): void {
    if (!conversationId) {
      return;
    }
    socket.emit(SOCKET_EVENTS.DM_TYPING, { conversationId, isTyping });
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

  function submitDraft(): void {
    if (!draft.trim()) {
      return;
    }
    sendMessage(draft);
    setDraft('');
    clearTimeout(typingTimeoutRef.current);
    isTypingRef.current = false;
    emitTyping(false);
  }

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    submitDraft();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitDraft();
    }
  }

  async function handleImageSelected(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !conversationId) {
      return;
    }
    setImageError(null);
    setUploadingImage(true);
    try {
      await conversationsApi.uploadMessageImage(conversationId, file);
    } catch (err) {
      setImageError(err instanceof ApiClientError ? err.message : 'No se pudo enviar la imagen');
    } finally {
      setUploadingImage(false);
    }
  }

  const groups = useMemo(() => groupMessages(messages), [messages]);

  if (!friendsLoading && !friend) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3 px-6 py-14 text-center">
        <p className="text-base font-medium text-white">No podés chatear con este usuario.</p>
        <p className="text-sm text-text-description">Tenés que ser amigos para poder mandarle mensajes.</p>
        <Link to="/" className="text-sm font-medium text-primary hover:underline">
          Volver a amigos
        </Link>
      </div>
    );
  }

  if (friendsLoading || !friend) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <Spinner size={28} />
      </div>
    );
  }

  const effectiveStatus = getEffectiveStatus(friend.user.status, friend.user.isOnline);

  return (
    <div className="flex h-full min-h-full flex-col">
      <div className="flex items-center gap-3 border-b border-surface-border/60 px-5 py-3">
        <FramedAvatar frame={friend.user.avatarFrame} src={friend.user.avatarUrl} alt={friend.user.displayName} size={36} status={effectiveStatus} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{friend.user.displayName}</p>
          <p className="truncate text-xs text-text-description">{STATUS_LABELS[effectiveStatus]}</p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
        {conversationError && <p className="py-4 text-center text-sm text-status-dnd">{conversationError}</p>}
        {error && <p className="py-4 text-center text-sm text-status-dnd">{error}</p>}

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner size={26} />
          </div>
        ) : messages.length === 0 && !conversationError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <FramedAvatar frame={friend.user.avatarFrame} src={friend.user.avatarUrl} alt={friend.user.displayName} size={64} />
            <p className="mt-2 text-base font-semibold text-white">{friend.user.displayName}</p>
            <p className="text-sm text-text-description">Todavía no hay mensajes. ¡Mandale el primero!</p>
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="mb-3 flex justify-center">
                <button
                  type="button"
                  onClick={() => void loadOlder()}
                  disabled={loadingOlder}
                  className="rounded-full border border-surface-border px-4 py-1.5 text-xs font-medium text-text-description transition-colors hover:border-primary/50 hover:text-white disabled:opacity-50"
                >
                  {loadingOlder ? 'Cargando...' : 'Ver mensajes anteriores'}
                </button>
              </div>
            )}

            <div className="flex flex-col gap-4">
              {groups.map((group) => (
                <div key={group.dayLabel + group.messages[0].id}>
                  <div className="mb-3 flex items-center gap-3">
                    <div className="h-px flex-1 bg-surface-border/60" />
                    <span className="text-xs font-medium text-text-disabled">{group.dayLabel}</span>
                    <div className="h-px flex-1 bg-surface-border/60" />
                  </div>
                  <div className="flex flex-col gap-3">
                    {group.messages.map((msg) => (
                      <MessageBubble
                        key={msg.id}
                        message={msg}
                        isOwn={msg.sender === user?.id}
                        friendAvatar={friend.user.avatarUrl}
                        friendFrame={friend.user.avatarFrame}
                        onOpenImage={setViewingImageUrl}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div ref={messagesEndRef} />
      </div>

      {canSendMessages && (
        <div className="min-h-[22px] px-5">
          {isOtherTyping && (
            <p className="text-xs italic text-text-disabled">{friend.user.displayName} está escribiendo...</p>
          )}
        </div>
      )}

      {isPendingForMe && conversationId && (
        <div className="flex flex-col gap-2 border-t border-surface-border/60 px-5 py-3">
          <p className="text-sm text-text-description">
            <span className="font-medium text-white">{friend.user.displayName}</span> te quiere mandar mensajes. Si
            aceptás, van a pasar a tus mensajes directos.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void acceptRequest(conversationId)}
              disabled={respondingIds.has(conversationId)}
              className="rounded-full bg-status-online/15 px-4 py-1.5 text-sm font-medium text-status-online transition-colors hover:bg-status-online/25 disabled:opacity-50"
            >
              Aceptar
            </button>
            <button
              type="button"
              onClick={() => void declineRequest(conversationId)}
              disabled={respondingIds.has(conversationId)}
              className="rounded-full bg-status-dnd/15 px-4 py-1.5 text-sm font-medium text-status-dnd transition-colors hover:bg-status-dnd/25 disabled:opacity-50"
            >
              Rechazar
            </button>
          </div>
        </div>
      )}

      {isBlockedByThem && (
        <p className="border-t border-surface-border/60 px-5 py-4 text-center text-sm text-text-description">
          Este usuario no acepta mensajes tuyos por ahora.
        </p>
      )}

      {isBlockedByMe && (
        <p className="border-t border-surface-border/60 px-5 py-4 text-center text-sm text-text-description">
          Desactivaste los mensajes de {friend.user.displayName}. Podés reactivarlos desde su perfil.
        </p>
      )}

      {canSendMessages && (
        <>
          {isPendingMine && (
            <p className="px-5 pb-1 text-xs text-text-disabled">Esperando que {friend.user.displayName} acepte tu solicitud de mensajes.</p>
          )}
          {imageError && <p className="px-5 pt-2 text-xs text-status-dnd">{imageError}</p>}
          <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-surface-border/60 px-5 py-3">
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
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-description transition-colors hover:bg-surface-hover hover:text-white disabled:opacity-40"
            >
              {uploadingImage ? <Spinner size={18} /> : <ImageIcon />}
            </button>
            <textarea
              value={draft}
              onChange={(e) => handleDraftChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Mandale un mensaje a ${friend.user.displayName}`}
              rows={1}
              maxLength={2000}
              className="max-h-32 flex-1 resize-none rounded-lg border border-surface-border bg-card px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-text-disabled focus:border-primary"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label="Enviar mensaje"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              <SendIcon />
            </button>
          </form>
        </>
      )}

      {viewingImageUrl && <ImageLightbox url={viewingImageUrl} onClose={() => setViewingImageUrl(null)} />}
    </div>
  );
}

function MessageBubble({
  message,
  isOwn,
  friendAvatar,
  friendFrame,
  onOpenImage,
}: {
  message: Message;
  isOwn: boolean;
  friendAvatar: string;
  friendFrame: AvatarFrameId;
  onOpenImage: (url: string) => void;
}) {
  return (
    <div className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
      {!isOwn && <FramedAvatar frame={friendFrame} src={friendAvatar} alt="" size={28} />}
      <div className={`flex max-w-[70%] flex-col gap-1 ${isOwn ? 'items-end' : 'items-start'}`}>
        {message.type === 'image' && message.mediaUrl ? (
          <div className={`overflow-hidden rounded-2xl ${isOwn ? 'rounded-br-sm' : 'rounded-bl-sm'}`}>
            <button type="button" onClick={() => onOpenImage(message.mediaUrl!)} className="block">
              <img src={message.mediaUrl} alt="Imagen enviada" className="max-h-72 max-w-full object-cover" />
            </button>
            {message.content && (
              <div className={`px-3.5 py-2 text-sm ${isOwn ? 'bg-primary text-white' : 'bg-surface-hover text-white'}`}>
                {message.content}
              </div>
            )}
          </div>
        ) : (
          <div
            className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm ${
              isOwn ? 'rounded-br-sm bg-primary text-white' : 'rounded-bl-sm bg-surface-hover text-white'
            }`}
          >
            {message.content}
          </div>
        )}
        <span className="px-1 text-[11px] text-text-disabled">{TIME_FORMATTER.format(new Date(message.createdAt))}</span>
      </div>
    </div>
  );
}

function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    function handleKeyDown(e: globalThis.KeyboardEvent): void {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60"
      >
        <XIcon />
      </button>
      <img
        src={url}
        alt="Imagen enviada"
        className="max-h-full max-w-full rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function groupMessages(messages: Message[]): { dayLabel: string; messages: Message[] }[] {
  const groups: { dayLabel: string; messages: Message[] }[] = [];

  for (const message of messages) {
    const dayLabel = capitalize(DAY_FORMATTER.format(new Date(message.createdAt)));
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.dayLabel === dayLabel) {
      lastGroup.messages.push(message);
    } else {
      groups.push({ dayLabel, messages: [message] });
    }
  }

  return groups;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.4 20.6 21 12 3.4 3.4 3 10l13 2-13 2z" />
    </svg>
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
