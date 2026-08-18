import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import type {
  AvatarFrameId,
  ConversationRequestStatus,
  DmTypingPayload,
  Message,
  MessageReactionEmoji,
  MessageRequestResolvedPayload,
} from '@synccall/shared';
import { MESSAGE_REACTION_EMOJIS, SOCKET_EVENTS, getEffectiveStatus } from '@synccall/shared';
import { useAuth } from '../../../app/AuthProvider';
import { useFriends } from '../../../app/FriendsProvider';
import { useConversations } from '../../../app/ConversationsProvider';
import { useMessageRequests } from '../../../app/MessageRequestsProvider';
import { useSocketConnected } from '../../../app/SocketProvider';
import { useEscapeToClose } from '../../../hooks/useEscapeToClose';
import { socket } from '../../../lib/socketClient';
import { ApiClientError } from '../../../lib/apiClient';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { FramedAvatar } from '../../../components/ui/AvatarFrame';
import { Spinner } from '../../../components/ui/Spinner';
import { STATUS_LABELS } from '../../../components/ui/StatusDot';
import { useConversationMessages } from '../hooks/useConversationMessages';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import * as conversationsApi from '../api/conversations.api';

const TIME_FORMATTER = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' });
const DAY_FORMATTER = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
const TYPING_STOP_MS = 2000;

export function ChatPage() {
  const { friendId } = useParams<{ friendId: string }>();
  const { user } = useAuth();
  const { friends, loading: friendsLoading } = useFriends();
  const { refresh: refreshConversations, setActiveConversationId } = useConversations();
  const { accept: acceptRequest, decline: declineRequest, respondingIds } = useMessageRequests();
  const socketConnected = useSocketConnected();

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
    // Mientras este chat esté montado, los mensajes que lleguen de esta conversación no
    // disparan el sonido de notificación (el usuario ya la está viendo). Al salir del chat
    // (cambiar de conversación o navegar a otra pantalla) se vuelve a habilitar.
    setActiveConversationId(conversationId);
    return () => setActiveConversationId(null);
  }, [conversationId, setActiveConversationId]);

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

  const {
    messages,
    loading,
    loadingOlder,
    hasMore,
    error,
    loadOlder,
    sendMessage,
    editMessage,
    deleteMessage,
    reactToMessage,
    unreactToMessage,
  } = useConversationMessages(conversationId);

  const [draft, setDraft] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [reactingToId, setReactingToId] = useState<string | null>(null);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recorder = useAudioRecorder();
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

  function startEditingMessage(message: Message): void {
    setEditingMessageId(message.id);
    setEditDraft(message.content);
    setReactingToId(null);
  }

  function cancelEditingMessage(): void {
    setEditingMessageId(null);
    setEditDraft('');
  }

  function saveEditingMessage(): void {
    if (!editingMessageId || !editDraft.trim()) {
      return;
    }
    editMessage(editingMessageId, editDraft);
    cancelEditingMessage();
  }

  function handleEditKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEditingMessage();
    } else if (e.key === 'Escape') {
      cancelEditingMessage();
    }
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

  async function handleSendVoiceMessage(): Promise<void> {
    const blob = await recorder.stopAndGetBlob();
    if (!blob || !conversationId) {
      return;
    }
    setVoiceError(null);
    setUploadingVoice(true);
    try {
      await conversationsApi.uploadVoiceMessage(conversationId, blob);
    } catch (err) {
      setVoiceError(err instanceof ApiClientError ? err.message : 'No se pudo enviar el audio');
    } finally {
      setUploadingVoice(false);
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
                        currentUserId={user?.id ?? ''}
                        friendAvatar={friend.user.avatarUrl}
                        friendFrame={friend.user.avatarFrame}
                        onOpenImage={setViewingImageUrl}
                        isEditing={editingMessageId === msg.id}
                        editDraft={editDraft}
                        onEditDraftChange={setEditDraft}
                        onEditKeyDown={handleEditKeyDown}
                        onStartEdit={() => startEditingMessage(msg)}
                        onSaveEdit={saveEditingMessage}
                        onCancelEdit={cancelEditingMessage}
                        onDelete={() => setDeletingMessageId(msg.id)}
                        isReacting={reactingToId === msg.id}
                        onToggleReactionPicker={() => setReactingToId((current) => (current === msg.id ? null : msg.id))}
                        onCloseReactionPicker={() => setReactingToId(null)}
                        onReact={(emoji) => {
                          reactToMessage(msg.id, emoji);
                          setReactingToId(null);
                        }}
                        onUnreact={() => {
                          unreactToMessage(msg.id);
                          setReactingToId(null);
                        }}
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
          {voiceError && <p className="px-5 pt-2 text-xs text-status-dnd">{voiceError}</p>}
          {recorder.error && <p className="px-5 pt-2 text-xs text-status-dnd">{recorder.error}</p>}
          {!socketConnected && (
            <p className="px-5 pt-2 text-xs text-status-dnd">
              Sin conexión en tiempo real: tus mensajes se van a enviar apenas se restablezca.
            </p>
          )}
          {recorder.isRecording ? (
            <div className="flex items-center gap-3 border-t border-surface-border/60 px-5 py-3">
              <button
                type="button"
                onClick={recorder.cancelRecording}
                aria-label="Cancelar grabación"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-description transition-colors hover:bg-status-dnd/15 hover:text-status-dnd"
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
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary-hover"
              >
                <SendIcon />
              </button>
            </div>
          ) : (
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
              {draft.trim() ? (
                <button
                  type="submit"
                  aria-label="Enviar mensaje"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary-hover"
                >
                  <SendIcon />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void recorder.startRecording()}
                  disabled={uploadingVoice}
                  aria-label="Grabar mensaje de voz"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-description transition-colors hover:bg-surface-hover hover:text-white disabled:opacity-40"
                >
                  {uploadingVoice ? <Spinner size={18} /> : <MicIcon />}
                </button>
              )}
            </form>
          )}
        </>
      )}

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

function MessageBubble({
  message,
  isOwn,
  currentUserId,
  friendAvatar,
  friendFrame,
  onOpenImage,
  isEditing,
  editDraft,
  onEditDraftChange,
  onEditKeyDown,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  isReacting,
  onToggleReactionPicker,
  onCloseReactionPicker,
  onReact,
  onUnreact,
}: {
  message: Message;
  isOwn: boolean;
  currentUserId: string;
  friendAvatar: string;
  friendFrame: AvatarFrameId;
  onOpenImage: (url: string) => void;
  isEditing: boolean;
  editDraft: string;
  onEditDraftChange: (value: string) => void;
  onEditKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  isReacting: boolean;
  onToggleReactionPicker: () => void;
  onCloseReactionPicker: () => void;
  onReact: (emoji: MessageReactionEmoji) => void;
  onUnreact: () => void;
}) {
  const reactionGroups = groupReactions(message.reactions, currentUserId);
  const myReaction = message.reactions.find((r) => r.userId === currentUserId)?.emoji;

  return (
    <div className={`group flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
      {!isOwn && <FramedAvatar frame={friendFrame} src={friendAvatar} alt="" size={28} />}
      <div className={`relative flex max-w-[70%] flex-col gap-1 ${isOwn ? 'items-end' : 'items-start'}`}>
        {!message.deleted && !isEditing && (
          <div
            className={`absolute -top-4 z-10 flex items-center gap-0.5 rounded-full border border-surface-border/60 bg-card px-1 py-0.5 shadow-lg transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 ${
              isOwn ? 'right-0' : 'left-0'
            }`}
          >
            <BubbleIconButton label="Reaccionar" onClick={onToggleReactionPicker}>
              <ReactionIcon />
            </BubbleIconButton>
            {isOwn && message.type !== 'audio' && (
              <BubbleIconButton label="Editar mensaje" onClick={onStartEdit}>
                <EditIcon />
              </BubbleIconButton>
            )}
            {isOwn && (
              <BubbleIconButton label="Eliminar mensaje" onClick={onDelete}>
                <TrashIcon />
              </BubbleIconButton>
            )}
            {isReacting && (
              <ReactionPicker
                selected={myReaction}
                onPick={onReact}
                onClear={onUnreact}
                onClose={onCloseReactionPicker}
                align={isOwn ? 'right' : 'left'}
              />
            )}
          </div>
        )}

        {message.deleted ? (
          <div className="rounded-2xl bg-surface-hover/50 px-3.5 py-2 text-sm italic text-text-disabled">
            {isOwn ? 'Eliminaste este mensaje' : 'Este mensaje fue eliminado'}
          </div>
        ) : isEditing ? (
          <div className="flex w-64 max-w-full flex-col gap-1.5 rounded-2xl border border-primary/60 bg-card p-2">
            <textarea
              value={editDraft}
              onChange={(e) => onEditDraftChange(e.target.value)}
              onKeyDown={onEditKeyDown}
              rows={1}
              maxLength={2000}
              autoFocus
              className="max-h-32 resize-none rounded-md bg-transparent px-1 py-1 text-sm text-white outline-none"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onCancelEdit} className="text-xs text-text-description hover:text-white">
                Cancelar
              </button>
              <button type="button" onClick={onSaveEdit} className="text-xs font-medium text-primary hover:text-primary-hover">
                Guardar
              </button>
            </div>
          </div>
        ) : message.type === 'audio' && message.mediaUrl ? (
          <VoiceMessagePlayer url={message.mediaUrl} durationSec={message.durationSec} isOwn={isOwn} />
        ) : message.type === 'image' && message.mediaUrl ? (
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

        {reactionGroups.length > 0 && (
          <div className={`flex flex-wrap gap-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
            {reactionGroups.map(({ emoji, count, reactedByMe }) => (
              <button
                key={emoji}
                type="button"
                onClick={() => (reactedByMe ? onUnreact() : onReact(emoji))}
                title={reactedByMe ? 'Quitar tu reacción' : undefined}
                className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors ${
                  reactedByMe
                    ? 'border-primary/60 bg-primary/15 text-primary'
                    : 'border-surface-border/60 bg-card text-text-description hover:border-surface-border'
                }`}
              >
                <span>{emoji}</span>
                <span>{count}</span>
              </button>
            ))}
          </div>
        )}

        <span className="px-1 text-[11px] text-text-disabled">
          {TIME_FORMATTER.format(new Date(message.createdAt))}
          {message.editedAt && !message.deleted ? ' · editado' : ''}
        </span>
      </div>
    </div>
  );
}

function formatDuration(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.round(totalSeconds)) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function VoiceMessagePlayer({ url, durationSec, isOwn }: { url: string; durationSec?: number; isOwn: boolean }) {
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
    <div
      className={`flex w-60 max-w-full items-center gap-2.5 rounded-2xl px-3 py-2 ${
        isOwn ? 'rounded-br-sm bg-primary text-white' : 'rounded-bl-sm bg-surface-hover text-white'
      }`}
    >
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
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 transition-colors hover:bg-white/30"
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
        className="h-1 flex-1 accent-white"
      />
      <span className="w-9 shrink-0 text-right text-[11px] tabular-nums opacity-80">
        {formatDuration(isPlaying || currentTime > 0 ? currentTime : duration)}
      </span>
    </div>
  );
}

function groupReactions(
  reactions: Message['reactions'],
  currentUserId: string,
): { emoji: MessageReactionEmoji; count: number; reactedByMe: boolean }[] {
  const byEmoji = new Map<MessageReactionEmoji, { count: number; reactedByMe: boolean }>();
  for (const reaction of reactions) {
    const entry = byEmoji.get(reaction.emoji) ?? { count: 0, reactedByMe: false };
    entry.count += 1;
    if (reaction.userId === currentUserId) {
      entry.reactedByMe = true;
    }
    byEmoji.set(reaction.emoji, entry);
  }
  return MESSAGE_REACTION_EMOJIS.filter((emoji) => byEmoji.has(emoji)).map((emoji) => ({ emoji, ...byEmoji.get(emoji)! }));
}

function BubbleIconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-6 w-6 items-center justify-center rounded-full text-text-description transition-colors hover:bg-surface-hover hover:text-white"
    >
      {children}
    </button>
  );
}

function ReactionPicker({
  selected,
  onPick,
  onClear,
  onClose,
  align,
}: {
  selected: MessageReactionEmoji | undefined;
  onPick: (emoji: MessageReactionEmoji) => void;
  onClear: () => void;
  onClose: () => void;
  align: 'left' | 'right';
}) {
  useEscapeToClose(onClose);

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div
        className={`absolute top-full z-40 mt-1 flex items-center gap-1 rounded-full border border-surface-border/60 bg-card p-1.5 shadow-2xl shadow-black/40 ${
          align === 'right' ? 'right-0' : 'left-0'
        }`}
      >
        {MESSAGE_REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onPick(emoji)}
            title={emoji === selected ? 'Tu reacción actual' : undefined}
            className={`flex h-7 w-7 items-center justify-center rounded-full text-base transition-transform hover:scale-125 hover:bg-surface-hover ${
              emoji === selected ? 'bg-primary/20 ring-1 ring-primary/60' : ''
            }`}
          >
            {emoji}
          </button>
        ))}
        {selected && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Quitar reacción"
            title="Quitar reacción"
            className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-l border-surface-border/60 pl-1.5 text-text-description transition-colors hover:text-status-dnd"
          >
            <XIcon />
          </button>
        )}
      </div>
    </>
  );
}

function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEscapeToClose(onClose);

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

function ReactionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
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
