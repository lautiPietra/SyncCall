import type { GroupMemberDetail } from '@synccall/shared';
import { getEffectiveStatus } from '@synccall/shared';
import { FramedAvatar } from '../../../components/ui/AvatarFrame';
import { Spinner } from '../../../components/ui/Spinner';

export function GroupMembersPanel({ members, loading }: { members: GroupMemberDetail[]; loading: boolean }) {
  return (
    <div className="hidden w-60 shrink-0 flex-col border-l border-surface-border/60 bg-sidebar p-3 md:flex">
      <span className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-text-description">Miembros — {members.length}</span>
      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner size={18} />
        </div>
      ) : (
        <div className="flex flex-col gap-0.5 overflow-y-auto">
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
              {m.role === 'owner' && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-text-disabled">Dueño</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
