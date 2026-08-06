import type { UpdateProfileInput, User } from '@synccall/shared';
import { apiFetch } from '../../../lib/apiClient';

export function updateProfile(updates: UpdateProfileInput): Promise<{ user: User }> {
  return apiFetch('/users/me', { method: 'PATCH', body: updates });
}

export function uploadAvatar(file: File): Promise<{ user: User }> {
  const formData = new FormData();
  formData.append('avatar', file);
  return apiFetch('/users/me/avatar', { method: 'POST', body: formData });
}

export function uploadBanner(file: File): Promise<{ user: User }> {
  const formData = new FormData();
  formData.append('banner', file);
  return apiFetch('/users/me/banner', { method: 'POST', body: formData });
}
