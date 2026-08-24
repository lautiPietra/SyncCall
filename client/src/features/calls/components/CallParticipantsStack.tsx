import type { PublicUser } from '@synccall/shared';
import { FramedAvatar } from '../../../components/ui/AvatarFrame';

interface CallParticipantsStackProps {
  userIds: string[];
  usersById: Map<string, PublicUser>;
  max?: number;
  size?: number;
}

export function CallParticipantsStack({ userIds, usersById, max = 4, size = 22 }: CallParticipantsStackProps) {
  if (userIds.length === 0) {
    return null;
  }

  const visible = userIds.slice(0, max);
  const overflow = userIds.length - visible.length;

  return (
    <div className="flex items-center">
      {visible.map((userId, index) => {
        const user = usersById.get(userId);
        return (
          <div
            key={userId}
            className="rounded-full ring-2 ring-sidebar"
            style={{ marginLeft: index === 0 ? 0 : -Math.round(size * 0.35), zIndex: visible.length - index }}
          >
            {user ? (
              <FramedAvatar frame={user.avatarFrame} src={user.avatarUrl} alt={user.displayName} size={size} />
            ) : (
              <div className="rounded-full bg-surface-hover" style={{ width: size, height: size }} />
            )}
          </div>
        );
      })}
      {overflow > 0 && (
        <div
          className="flex shrink-0 items-center justify-center rounded-full bg-surface-hover text-[10px] font-semibold text-text-description ring-2 ring-sidebar"
          style={{ width: size, height: size, marginLeft: -Math.round(size * 0.35) }}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
