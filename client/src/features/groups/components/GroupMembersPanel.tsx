import { useState } from 'react';
import type { GroupMemberDetail } from '@synccall/shared';
import { getEffectiveStatus } from '@synccall/shared';
import { FramedAvatar } from '../../../components/ui/AvatarFrame';
import { Spinner } from '../../../components/ui/Spinner';
import { InviteFriendsDialog } from './InviteFriendsDialog';

export function GroupMembersPanel({
  groupId,
  members,
  loading,
  canInvite,
}: {
  groupId: string;
  members: GroupMemberDetail[];
  loading: boolean;
  canInvite: boolean;
}) {
  const [inviting, setInviting] = useState(false);

  return (
    <div className="hidden w-60 shrink-0 flex-col border-l border-surface-border/60 bg-sidebar p-3 md:flex">
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-description">Miembros — {members.length}</span>
        {canInvite && (
          <button
            type="button"
            onClick={() => setInviting(true)}
            className="shrink-0 text-xs font-medium text-primary transition-colors hover:underline"
          >
            Invitar
          </button>
        )}
      </div>
      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner size={18} />
        </div>
      ) : (
        <div className="no-scrollbar flex flex-col gap-0.5 overflow-y-auto">
          {members.map((m) => (
            <div key={m.user.id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
              <FramedAvatar
                frame={m.user.avatarFrame}
                src={m.user.avatarUrl}
                alt={m.user.displayName}
                size={28}
                status={getEffectiveStatus(m.user.status, m.user.isOnline)}
              />
              <span className="min-w-0 flex-1 truncate text-sm text-text-description">{m.user.displayName}</span>
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-text-disabled">
                {m.role === 'owner' ? 'Dueño' : m.role === 'admin' ? 'Administrador' : 'Miembro'}
              </span>
            </div>
          ))}
        </div>
      )}

      {inviting && <InviteFriendsDialog groupId={groupId} members={members} onClose={() => setInviting(false)} />}
    </div>
  );
}
