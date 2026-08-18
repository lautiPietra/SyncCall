import { useState } from 'react';
import type { GroupInvitePreview } from '@synccall/shared';
import { useGroups } from '../../../app/GroupsProvider';
import { ApiClientError } from '../../../lib/apiClient';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Avatar } from '../../../components/ui/Avatar';
import { FramedAvatar } from '../../../components/ui/AvatarFrame';

export function GroupInviteDialog({ invite, onClose }: { invite: GroupInvitePreview; onClose: () => void }) {
  const { respondInvite } = useGroups();
  const [responding, setResponding] = useState<'accepted' | 'declined' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRespond(status: 'accepted' | 'declined'): Promise<void> {
    setResponding(status);
    setError(null);
    try {
      await respondInvite(invite.id, status);
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudo responder la invitación');
      setResponding(null);
    }
  }

  return (
    <Modal
      title="Invitación a un grupo"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={() => void handleRespond('declined')} loading={responding === 'declined'} disabled={responding !== null}>
            Rechazar
          </Button>
          <Button onClick={() => void handleRespond('accepted')} loading={responding === 'accepted'} disabled={responding !== null}>
            Aceptar
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <Avatar src={invite.groupPhotoUrl ?? ''} alt={invite.groupName} size={64} />
        <div>
          <p className="text-lg font-semibold text-white">{invite.groupName}</p>
          <div className="mt-2 flex items-center justify-center gap-2 text-sm text-text-description">
            <FramedAvatar frame={invite.invitedBy.avatarFrame} src={invite.invitedBy.avatarUrl} alt={invite.invitedBy.displayName} size={22} />
            <span>
              <span className="text-white">{invite.invitedBy.displayName}</span> te invitó a este grupo
            </span>
          </div>
        </div>
        {error && <p className="text-sm text-status-dnd">{error}</p>}
      </div>
    </Modal>
  );
}
