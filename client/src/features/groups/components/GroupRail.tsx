import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../app/AuthProvider';
import { useGroupDetail } from '../hooks/useGroupDetail';
import { useEscapeToClose } from '../../../hooks/useEscapeToClose';
import { ApiClientError } from '../../../lib/apiClient';
import { Avatar } from '../../../components/ui/Avatar';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { Spinner } from '../../../components/ui/Spinner';
import * as groupsApi from '../api/groups.api';
import { GroupSettingsDialog } from './GroupSettingsDialog';
import { CreateChannelDialog } from './CreateChannelDialog';

export function GroupRail({ groupId }: { groupId: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { group, channels, loading } = useGroupDetail(groupId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  useEscapeToClose(() => {
    if (menuOpen) {
      setMenuOpen(false);
    }
  });

  const isOwner = group?.owner === user?.id;

  async function handleLeave(): Promise<void> {
    try {
      await groupsApi.leaveGroup(groupId);
      setConfirmingLeave(false);
      navigate('/');
    } catch (err) {
      setLeaveError(err instanceof ApiClientError ? err.message : 'No se pudo salir del grupo');
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
              {isOwner ? (
                <MenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    setSettingsOpen(true);
                  }}
                >
                  Configuración del grupo
                </MenuItem>
              ) : (
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

      <div className="flex-1 overflow-y-auto px-2 pb-2 pt-2">
        <div className="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-disabled" title="Todavía no disponible">
          Eventos
        </div>

        <div className="mt-3 flex items-center justify-between px-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-description">Canales de texto</span>
          {isOwner && (
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
            <NavLink
              key={channel.id}
              to={`/groups/${groupId}/channels/${channel.id}`}
              className={({ isActive }) =>
                `flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                  isActive ? 'bg-surface-hover text-white' : 'text-text-description hover:bg-surface-hover/60 hover:text-white'
                }`
              }
            >
              <span className="text-text-disabled">#</span>
              <span className="truncate">{channel.name}</span>
            </NavLink>
          ))}
        </div>

        <div className="mt-4 px-2.5 text-xs font-semibold uppercase tracking-wide text-text-disabled" title="Próximamente">
          Canales de voz
        </div>
      </div>

      {settingsOpen && <GroupSettingsDialog groupId={groupId} onClose={() => setSettingsOpen(false)} />}
      {creatingChannel && <CreateChannelDialog groupId={groupId} onClose={() => setCreatingChannel(false)} />}
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
