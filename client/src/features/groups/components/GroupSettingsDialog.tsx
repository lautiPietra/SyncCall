import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GroupInviteResolvedPayload, PendingGroupInvite } from '@synccall/shared';
import { SOCKET_EVENTS } from '@synccall/shared';
import * as groupsApi from '../api/groups.api';
import { useGroupDetail } from '../hooks/useGroupDetail';
import { ApiClientError } from '../../../lib/apiClient';
import { socket } from '../../../lib/socketClient';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input, Textarea } from '../../../components/ui/Input';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { Avatar } from '../../../components/ui/Avatar';
import { FramedAvatar } from '../../../components/ui/AvatarFrame';
import { Spinner } from '../../../components/ui/Spinner';
import { FriendCheckboxList } from './FriendCheckboxList';

type Tab = 'general' | 'members';

export function GroupSettingsDialog({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const { group, members, loading, refresh } = useGroupDetail(groupId);
  const [tab, setTab] = useState<Tab>('general');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const [selectedToInvite, setSelectedToInvite] = useState<Set<string>>(new Set());
  const [invitingMembers, setInvitingMembers] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [pendingInvites, setPendingInvites] = useState<PendingGroupInvite[]>([]);
  const [cancelingUserId, setCancelingUserId] = useState<string | null>(null);

  if (group && !initialized) {
    setName(group.name);
    setDescription(group.description ?? '');
    setInitialized(true);
  }

  const refreshPendingInvites = useCallback(async () => {
    try {
      const { invites } = await groupsApi.listGroupPendingInvites(groupId);
      setPendingInvites(invites);
    } catch {
      // No es crítico: si falla, simplemente la lista de pendientes queda vacía hasta reabrir.
    }
  }, [groupId]);

  useEffect(() => {
    if (tab === 'members') {
      void refreshPendingInvites();
    }
  }, [tab, refreshPendingInvites]);

  useEffect(() => {
    function handleInviteResolved(payload: GroupInviteResolvedPayload): void {
      if (payload.groupId !== groupId) {
        return;
      }
      setPendingInvites((prev) => prev.filter((i) => i.invitedUser.id !== payload.userId));
      if (payload.status === 'accepted') {
        void refresh();
      }
    }
    socket.on(SOCKET_EVENTS.GROUP_INVITE_RESOLVED, handleInviteResolved);
    return () => {
      socket.off(SOCKET_EVENTS.GROUP_INVITE_RESOLVED, handleInviteResolved);
    };
  }, [groupId, refresh]);

  function toggleFriendToInvite(friendId: string): void {
    setSelectedToInvite((prev) => {
      const next = new Set(prev);
      if (next.has(friendId)) {
        next.delete(friendId);
      } else {
        next.add(friendId);
      }
      return next;
    });
  }

  async function handleSaveGeneral(): Promise<void> {
    if (!name.trim() || savingGeneral) {
      return;
    }
    setSavingGeneral(true);
    setGeneralError(null);
    try {
      await groupsApi.updateGroup(groupId, { name: name.trim(), description: description.trim() || undefined });
      await refresh();
    } catch (err) {
      setGeneralError(err instanceof ApiClientError ? err.message : 'No se pudo guardar');
    } finally {
      setSavingGeneral(false);
    }
  }

  async function handlePhotoChange(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) {
      return;
    }
    setUploadingPhoto(true);
    setGeneralError(null);
    try {
      await groupsApi.uploadGroupPhoto(groupId, file);
      await refresh();
    } catch (err) {
      setGeneralError(err instanceof ApiClientError ? err.message : 'No se pudo subir la foto');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleInviteSelected(): Promise<void> {
    if (selectedToInvite.size === 0 || invitingMembers) {
      return;
    }
    setInvitingMembers(true);
    setMembersError(null);
    try {
      for (const friendId of selectedToInvite) {
        await groupsApi.inviteMember(groupId, friendId);
      }
      setSelectedToInvite(new Set());
      await refreshPendingInvites();
    } catch (err) {
      setMembersError(err instanceof ApiClientError ? err.message : 'No se pudieron invitar');
    } finally {
      setInvitingMembers(false);
    }
  }

  async function handleRemoveMember(userId: string): Promise<void> {
    setRemovingUserId(userId);
    setMembersError(null);
    try {
      await groupsApi.removeMember(groupId, userId);
      await refresh();
    } catch (err) {
      setMembersError(err instanceof ApiClientError ? err.message : 'No se pudo sacar al miembro');
    } finally {
      setRemovingUserId(null);
    }
  }

  async function handleCancelInvite(userId: string): Promise<void> {
    setCancelingUserId(userId);
    setMembersError(null);
    try {
      await groupsApi.cancelInvite(groupId, userId);
      setPendingInvites((prev) => prev.filter((i) => i.invitedUser.id !== userId));
    } catch (err) {
      setMembersError(err instanceof ApiClientError ? err.message : 'No se pudo cancelar la invitación');
    } finally {
      setCancelingUserId(null);
    }
  }

  async function handleDeleteGroup(): Promise<void> {
    setDeleting(true);
    try {
      await groupsApi.deleteGroup(groupId);
      onClose();
      navigate('/');
    } catch (err) {
      setGeneralError(err instanceof ApiClientError ? err.message : 'No se pudo eliminar el grupo');
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  const excludedFromInvite = new Set([...members.map((m) => m.user.id), ...pendingInvites.map((i) => i.invitedUser.id)]);

  return (
    <>
      <Modal title="Configuración del grupo" onClose={onClose}>
        <div className="mb-4 flex gap-1 border-b border-surface-border/60">
          <TabButton active={tab === 'general'} onClick={() => setTab('general')}>
            General
          </TabButton>
          <TabButton active={tab === 'members'} onClick={() => setTab('members')}>
            Miembros
          </TabButton>
        </div>

        {loading || !group ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : tab === 'general' ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Avatar src={group.photoUrl ?? ''} alt={group.name} size={56} />
              <label
                className={`cursor-pointer text-xs font-medium text-primary hover:underline ${uploadingPhoto ? 'pointer-events-none opacity-60' : ''}`}
              >
                {uploadingPhoto ? 'Subiendo...' : 'Cambiar foto'}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void handlePhotoChange(e)} />
              </label>
            </div>

            <Input label="Nombre del grupo" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
            <Textarea
              label="Descripción"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
              rows={3}
            />

            {generalError && <p className="text-sm text-status-dnd">{generalError}</p>}

            <Button onClick={() => void handleSaveGeneral()} loading={savingGeneral} disabled={!name.trim()} className="self-start">
              Guardar cambios
            </Button>

            <div className="mt-2 border-t border-surface-border/60 pt-4">
              <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
                Eliminar grupo
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-text-description">Miembros ({members.length})</span>
              <div className="mt-2 flex flex-col gap-0.5">
                {members.map((m) => (
                  <div key={m.user.id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
                    <FramedAvatar frame={m.user.avatarFrame} src={m.user.avatarUrl} alt={m.user.displayName} size={28} />
                    <span className="min-w-0 flex-1 truncate text-sm text-white">{m.user.displayName}</span>
                    {m.role === 'owner' ? (
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-text-disabled">Dueño</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleRemoveMember(m.user.id)}
                        disabled={removingUserId === m.user.id}
                        aria-label={`Sacar a ${m.user.displayName} del grupo`}
                        className="shrink-0 text-xs text-status-dnd transition-colors hover:underline disabled:opacity-60"
                      >
                        Sacar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {pendingInvites.length > 0 && (
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-text-description">
                  Invitaciones pendientes ({pendingInvites.length})
                </span>
                <div className="mt-2 flex flex-col gap-0.5">
                  {pendingInvites.map((invite) => (
                    <div key={invite.invitedUser.id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
                      <FramedAvatar
                        frame={invite.invitedUser.avatarFrame}
                        src={invite.invitedUser.avatarUrl}
                        alt={invite.invitedUser.displayName}
                        size={28}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-text-description">{invite.invitedUser.displayName}</span>
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-text-disabled">Esperando</span>
                      <button
                        type="button"
                        onClick={() => void handleCancelInvite(invite.invitedUser.id)}
                        disabled={cancelingUserId === invite.invitedUser.id}
                        aria-label={`Cancelar invitación a ${invite.invitedUser.displayName}`}
                        className="shrink-0 text-xs text-status-dnd transition-colors hover:underline disabled:opacity-60"
                      >
                        Cancelar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-text-description">Invitar amigos</span>
              <div className="mt-2">
                <FriendCheckboxList excludeIds={excludedFromInvite} selected={selectedToInvite} onToggle={toggleFriendToInvite} />
              </div>
              {selectedToInvite.size > 0 && (
                <Button onClick={() => void handleInviteSelected()} loading={invitingMembers} className="mt-2">
                  Invitar {selectedToInvite.size} {selectedToInvite.size === 1 ? 'amigo' : 'amigos'}
                </Button>
              )}
            </div>

            {membersError && <p className="text-sm text-status-dnd">{membersError}</p>}
          </div>
        )}
      </Modal>

      {confirmingDelete && (
        <ConfirmDialog
          title="¿Eliminar este grupo?"
          description="Se van a borrar todos los canales y mensajes. Esta acción no se puede deshacer."
          confirmLabel="Eliminar"
          variant="danger"
          onConfirm={() => void handleDeleteGroup()}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
      {deleting && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <Spinner />
        </div>
      )}
    </>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
        active ? 'border-primary text-white' : 'border-transparent text-text-description hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}
