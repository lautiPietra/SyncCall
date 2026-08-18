import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useParams } from 'react-router-dom';
import type { GroupMessage, GroupTypingPayload } from '@synccall/shared';
import { SOCKET_EVENTS } from '@synccall/shared';
import { useAuth } from '../../../app/AuthProvider';
import { useGroups } from '../../../app/GroupsProvider';
import { useGroupDetail } from '../hooks/useGroupDetail';
import { useGroupChannelMessages } from '../hooks/useGroupChannelMessages';
import { socket } from '../../../lib/socketClient';
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
  const { user } = useAuth();
  const { setActiveChannelId } = useGroups();
  const { channels, members, loading: groupLoading } = useGroupDetail(groupId ?? null);
  const { messages, loading, error, editMessage, deleteMessage, sendMessage } = useGroupChannelMessages(groupId ?? null, channelId ?? null);

  const [draft, setDraft] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [typingUserIds, setTypingUserIds] = useState<Set<string>>(new Set());

  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const typingClearTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const membersById = useMemo(() => new Map(members.map((m) => [m.user.id, m.user])), [members]);
  const channel = channels.find((c) => c.id === channelId);

  useEffect(() => {
    setActiveChannelId(channelId ?? null);
    return () => setActiveChannelId(null);
  }, [channelId, setActiveChannelId]);

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

        <div className="flex-1 overflow-y-auto px-4 py-4">
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
                {group.messages.map((message) => (
                  <GroupMessageBubble
                    key={message.id}
                    message={message}
                    sender={membersById.get(message.sender)}
                    isOwn={message.sender === user?.id}
                    isEditing={editingMessageId === message.id}
                    editDraft={editDraft}
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
                ))}
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

        <form onSubmit={handleSubmit} className="shrink-0 border-t border-surface-border/60 p-3">
          <textarea
            value={draft}
            onChange={(e) => handleDraftChange(e.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder={`Mandar mensaje a #${channel?.name ?? ''}`}
            rows={1}
            className="w-full resize-none rounded-lg border border-surface-border/60 bg-bg/60 px-3 py-2 text-sm text-white outline-none placeholder:text-text-disabled focus:border-primary"
          />
        </form>
      </div>

      <GroupMembersPanel members={members} loading={groupLoading} />

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

function GroupMessageBubble({
  message,
  sender,
  isOwn,
  isEditing,
  editDraft,
  onStartEdit,
  onCancelEdit,
  onEditDraftChange,
  onSubmitEdit,
  onDelete,
}: {
  message: GroupMessage;
  sender: { displayName: string; avatarUrl: string; avatarFrame: import('@synccall/shared').AvatarFrameId } | undefined;
  isOwn: boolean;
  isEditing: boolean;
  editDraft: string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onEditDraftChange: (value: string) => void;
  onSubmitEdit: () => void;
  onDelete: () => void;
}) {
  const displayName = sender?.displayName ?? 'Usuario';

  return (
    <div className="group flex items-start gap-3 rounded-md px-2 py-1.5 hover:bg-surface-hover/40">
      <FramedAvatar frame={sender?.avatarFrame ?? 'none'} src={sender?.avatarUrl ?? ''} alt={displayName} size={36} />
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
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm text-text-description">{message.content}</p>
        )}
      </div>

      {isOwn && !message.deleted && !isEditing && (
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <button type="button" onClick={onStartEdit} aria-label="Editar mensaje" className="rounded p-1 text-text-disabled hover:bg-surface-hover hover:text-white">
            <EditIcon />
          </button>
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
