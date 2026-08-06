import type { User } from '@synccall/shared';
import { apiFetch } from '../../../lib/apiClient';

export function fetchMe(): Promise<{ user: User }> {
  return apiFetch('/auth/me');
}

export function logout(): Promise<void> {
  return apiFetch('/auth/logout', { method: 'POST' });
}
