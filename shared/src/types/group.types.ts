import type { PublicUser } from './user.types';

export type GroupRole = 'owner' | 'member';

export interface Group {
  id: string;
  name: string;
  description?: string;
  photoUrl?: string;
  owner: string;
  members: string[];
  createdAt: string;
}

export interface Channel {
  id: string;
  group: string;
  name: string;
  createdAt: string;
}

/** Vista liviana para el listado "mis grupos" del sidebar: sin populate de miembros. */
export interface GroupSummary {
  id: string;
  name: string;
  photoUrl?: string;
  ownerId: string;
  memberCount: number;
  /** El canal más viejo del grupo (siempre #general): permite redirigir /groups/:id sin otra llamada. */
  defaultChannelId: string;
}

export interface GroupMemberDetail {
  user: PublicUser;
  role: GroupRole;
  joinedAt: string;
}

export interface ListGroupsResponse {
  groups: GroupSummary[];
}

export interface GroupDetailResponse {
  group: Group & { channels: Channel[] };
  members: GroupMemberDetail[];
}

/** Invitación pendiente vista desde quien la recibió: todavía no es miembro del grupo. */
export interface GroupInvitePreview {
  id: string;
  groupId: string;
  groupName: string;
  groupPhotoUrl?: string;
  invitedBy: PublicUser;
  createdAt: string;
}

/** La misma invitación vista desde el dueño del grupo (para la lista de "pendientes" en configuración). */
export interface PendingGroupInvite {
  id: string;
  invitedUser: PublicUser;
  createdAt: string;
}

export interface ListGroupInvitesResponse {
  invites: GroupInvitePreview[];
}

export interface ListPendingGroupInvitesResponse {
  invites: PendingGroupInvite[];
}
