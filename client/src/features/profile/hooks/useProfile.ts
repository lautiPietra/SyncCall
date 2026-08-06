import { useState } from 'react';
import type { UpdateProfileInput } from '@synccall/shared';
import { useAuth } from '../../../app/AuthProvider';
import { ApiClientError } from '../../../lib/apiClient';
import { updateProfile, uploadAvatar, uploadBanner } from '../api/profile.api';

export function useProfile() {
  const { user, setUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(updates: UpdateProfileInput): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const { user: updated } = await updateProfile(updates);
      setUser(updated);
      return true;
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Error al guardar');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function changeAvatar(file: File): Promise<boolean> {
    setUploadingAvatar(true);
    setError(null);
    try {
      const { user: updated } = await uploadAvatar(file);
      setUser(updated);
      return true;
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Error al subir el avatar');
      return false;
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function changeBanner(file: File): Promise<boolean> {
    setUploadingBanner(true);
    setError(null);
    try {
      const { user: updated } = await uploadBanner(file);
      setUser(updated);
      return true;
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Error al subir el banner');
      return false;
    } finally {
      setUploadingBanner(false);
    }
  }

  return { user, saving, uploadingAvatar, uploadingBanner, error, save, changeAvatar, changeBanner };
}
