import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import type { Channel } from '@synccall/shared';
import { useAuth } from '../../../app/AuthProvider';
import { useGroupDetail } from '../hooks/useGroupDetail';
import { useEscapeToClose } from '../../../hooks/useEscapeToClose';
import { ApiClientError } from '../../../lib/apiClient';
import { Avatar } from '../../../components/ui/Avatar';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { CountBadge } from '../../../components/ui/CountBadge';
import { Spinner } from '../../../components/ui/Spinner';
import * as groupsApi from '../api/groups.api';
import { GroupSettingsDialog } from './GroupSettingsDialog';
import { CreateChannelDialog } from './CreateChannelDialog';
import { EditChannelDialog } from './EditChannelDialog';

export function GroupRail({ groupId }: { groupId: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { group, channels, members, loading } = useGroupDetail(groupId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [deletingChannel, setDeletingChannel] = useState<Channel | null>(null);
  const [deletingChannelBusy, setDeletingChannelBusy] = useState(false);
  const [deleteChannelError, setDeleteChannelError] = useState<string | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  useEscapeToClose(() => {
    if (menuOpen) {
      setMenuOpen(false);
    }
  });

  const isOwner = group?.owner === user?.id;
  const myRole = members.find((m) => m.user.id === user?.id)?.role;
  const canManage = isOwner || myRole === 'admin';

  async function handleLeave(): Promise<void> {
    try {
      await groupsApi.leaveGroup(groupId);
      setConfirmingLeave(false);
      navigate('/');
    } catch (err) {
      setLeaveError(err instanceof ApiClientError ? err.message : 'No se pudo salir del grupo');
    }
  }

  async function handleDeleteChannel(): Promise<void> {
    if (!deletingChannel) {
      return;
    }
    setDeletingChannelBusy(true);
    try {
      await groupsApi.deleteChannel(groupId, deletingChannel.id);
      setDeletingChannel(null);
      setDeleteChannelError(null);
    } catch (err) {
      setDeleteChannelError(err instanceof ApiClientError ? err.message : 'No se pudo eliminar el canal');
    } finally {
      setDeletingChannelBusy(false);
    }
  }

  if (loading || !group) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size={18} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="relative shrink-0 border-b border-surface-border/60 px-3 py-3">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-surface-hover"
        >
          <Avatar src={group.photoUrl ?? ''} alt={group.name} size={28} />
          <span className="min-w-0 flex-1 truncate font-semibold text-white">{group.name}</span>
          <ChevronIcon />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
            <div className="absolute left-3 right-3 top-full z-40 mt-1 rounded-lg border border-surface-border/60 bg-card py-1.5 shadow-2xl shadow-black/40">
              {canManage && (
                <MenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    setSettingsOpen(true);
                  }}
                >
                  Configuración del grupo
                </MenuItem>
              )}
              {!isOwner && (
                <MenuItem
                  danger
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmingLeave(true);
                  }}
                >
                  Salir del grupo
                </MenuItem>
              )}
            </div>
          </>
        )}
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto px-2 pb-2 pt-2">
        <div className="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-disabled" title="Todavía no disponible">
          Eventos
        </div>

        <div className="mt-3 flex items-center justify-between px-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-description">Canales de texto</span>
          {canManage && (
            <button
              type="button"
              onClick={() => setCreatingChannel(true)}
              aria-label="Crear canal de texto"
              className="flex h-5 w-5 items-center justify-center rounded text-text-description transition-colors hover:bg-surface-hover hover:text-white"
            >
              <PlusIcon />
            </button>
          )}
        </div>
        <div className="mt-1 flex flex-col gap-0.5">
          {channels.map((channel) => (
            <div key={channel.id} className="group flex items-center gap-0.5">
              <NavLink
                to={`/groups/${groupId}/channels/${channel.id}`}
                className={({ isActive }) =>
                  `flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                    isActive ? 'bg-surface-hover text-white' : 'text-text-description hover:bg-surface-hover/60 hover:text-white'
                  }`
                }
              >
                <span className="text-text-disabled">#</span>
                <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                <CountBadge count={channel.unreadCount} className="h-5 min-w-5 px-1.5 text-[11px]" />
              </NavLink>
              {canManage && (
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={() => setEditingChannel(channel)}
                    aria-label={`Editar canal ${channel.name}`}
                    className="flex h-6 w-6 items-center justify-center rounded text-text-disabled transition-colors hover:bg-surface-hover hover:text-white"
                  >
                    <EditIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingChannel(channel)}
                    aria-label={`Eliminar canal ${channel.name}`}
                    className="flex h-6 w-6 items-center justify-center rounded text-text-disabled transition-colors hover:bg-status-dnd/15 hover:text-status-dnd"
                  >
                    <TrashIcon />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 px-2.5 text-xs font-semibold uppercase tracking-wide text-text-disabled" title="Próximamente">
          Canales de voz
        </div>
      </div>

      {settingsOpen && <GroupSettingsDialog groupId={groupId} isOwner={isOwner} onClose={() => setSettingsOpen(false)} />}
      {creatingChannel && <CreateChannelDialog groupId={groupId} onClose={() => setCreatingChannel(false)} />}
      {editingChannel && (
        <EditChannelDialog
          groupId={groupId}
          channelId={editingChannel.id}
          initialName={editingChannel.name}
          onClose={() => setEditingChannel(null)}
        />
      )}
      {deletingChannel && (
        <ConfirmDialog
          title="¿Eliminar este canal?"
          description={deleteChannelError ?? `Se van a borrar todos los mensajes de #${deletingChannel.name}. Esta acción no se puede deshacer.`}
          confirmLabel={deletingChannelBusy ? 'Eliminando...' : 'Eliminar'}
          variant="danger"
          onConfirm={() => void handleDeleteChannel()}
          onCancel={() => {
            setDeletingChannel(null);
            setDeleteChannelError(null);
          }}
        />
      )}
      {confirmingLeave && (
        <ConfirmDialog
          title="¿Salir del grupo?"
          description={leaveError ?? `Vas a dejar de ver "${group.name}" y sus canales.`}
          confirmLabel="Salir"
          variant="danger"
          onConfirm={() => void handleLeave()}
          onCancel={() => {
            setConfirmingLeave(false);
            setLeaveError(null);
          }}
        />
      )}
    </div>
  );
}

function MenuItem({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover ${
        danger ? 'text-status-dnd' : 'text-text-description hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-text-description">
      <path d="M6 9l6 6 6-6" />
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
    </svg>
  );
}
