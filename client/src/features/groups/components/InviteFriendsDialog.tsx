import { useEffect, useState } from 'react';
import type { GroupMemberDetail } from '@synccall/shared';
import * as groupsApi from '../api/groups.api';
import { useToast } from '../../../app/ToastProvider';
import { ApiClientError } from '../../../lib/apiClient';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Spinner } from '../../../components/ui/Spinner';
import { FriendCheckboxList } from './FriendCheckboxList';

export function InviteFriendsDialog({
  groupId,
  members,
  onClose,
}: {
  groupId: string;
  members: GroupMemberDetail[];
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [loadingPending, setLoadingPending] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void groupsApi
      .listGroupPendingInvites(groupId)
      .then(({ invites }) => {
        if (!cancelled) {
          setPendingIds(new Set(invites.map((i) => i.invitedUser.id)));
        }
      })
      .catch(() => {
        // No es crítico: si falla, simplemente no excluimos a nadie por invitación pendiente.
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingPending(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  function toggle(friendId: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(friendId)) {
        next.delete(friendId);
      } else {
        next.add(friendId);
      }
      return next;
    });
  }

  async function handleInvite(): Promise<void> {
    if (selected.size === 0 || inviting) {
      return;
    }
    setInviting(true);
    setError(null);
    try {
      for (const friendId of selected) {
        await groupsApi.inviteMember(groupId, friendId);
      }
      showToast(selected.size === 1 ? 'Invitación enviada' : `${selected.size} invitaciones enviadas`);
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudieron enviar las invitaciones');
      setInviting(false);
    }
  }

  const excludedIds = new Set([...members.map((m) => m.user.id), ...pendingIds]);

  return (
    <Modal
      title="Invitar amigos"
      onClose={onClose}
      footer={
        <Button onClick={() => void handleInvite()} loading={inviting} disabled={selected.size === 0}>
          Invitar{selected.size > 0 ? ` (${selected.size})` : ''}
        </Button>
      }
    >
      {loadingPending ? (
        <div className="flex justify-center py-6">
          <Spinner size={18} />
        </div>
      ) : (
        <FriendCheckboxList excludeIds={excludedIds} selected={selected} onToggle={toggle} />
      )}
      {error && <p className="mt-2 text-sm text-status-dnd">{error}</p>}
    </Modal>
  );
}
