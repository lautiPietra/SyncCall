import { useState } from 'react';
import * as groupsApi from '../api/groups.api';
import { ApiClientError } from '../../../lib/apiClient';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';

const CHANNEL_NAME_REGEX = /^[a-z0-9-]*$/;

export function CreateChannelDialog({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleNameChange(value: string): void {
    const normalized = value.toLowerCase().replace(/\s+/g, '-');
    if (CHANNEL_NAME_REGEX.test(normalized)) {
      setName(normalized);
    }
  }

  async function handleSubmit(): Promise<void> {
    if (!name.trim() || saving) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await groupsApi.createChannel(groupId, name.trim());
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudo crear el canal');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Crear canal de texto"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSubmit()} loading={saving} disabled={!name.trim()}>
            Crear canal
          </Button>
        </>
      }
    >
      <Input
        label="Nombre del canal"
        value={name}
        onChange={(e) => handleNameChange(e.target.value)}
        placeholder="nuevo-canal"
        maxLength={50}
        autoFocus
      />
      <p className="mt-1.5 text-xs text-text-disabled">Solo minúsculas, números y guiones.</p>
      {error && <p className="mt-2 text-sm text-status-dnd">{error}</p>}
    </Modal>
  );
}
