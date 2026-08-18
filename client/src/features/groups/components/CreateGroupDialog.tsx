import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGroups } from '../../../app/GroupsProvider';
import { ApiClientError } from '../../../lib/apiClient';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { FriendCheckboxList } from './FriendCheckboxList';

export function CreateGroupDialog({ onClose }: { onClose: () => void }) {
  const { createGroup } = useGroups();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function toggleFriend(friendId: string): void {
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

  async function handleSubmit(): Promise<void> {
    if (!name.trim() || selected.size === 0 || saving) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const group = await createGroup(name.trim(), Array.from(selected));
      onClose();
      navigate(`/groups/${group.id}/channels/${group.defaultChannelId}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudo crear el grupo');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Crear grupo"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSubmit()} loading={saving} disabled={!name.trim() || selected.size === 0}>
            Crear grupo
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Nombre del grupo" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} autoFocus />

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-description">Invitar amigos</span>
          <p className="text-xs text-text-disabled">Les va a llegar una invitación: entran al grupo recién si la aceptan.</p>
          <FriendCheckboxList selected={selected} onToggle={toggleFriend} />
        </div>

        {error && <p className="text-sm text-status-dnd">{error}</p>}
      </div>
    </Modal>
  );
}
