import type { Friend } from '@synccall/shared';
import { useFriends } from '../../../app/FriendsProvider';
import { FramedAvatar } from '../../../components/ui/AvatarFrame';

interface FriendCheckboxListProps {
  excludeIds?: Set<string>;
  selected: Set<string>;
  onToggle: (friendId: string) => void;
}

export function FriendCheckboxList({ excludeIds, selected, onToggle }: FriendCheckboxListProps) {
  const { friends } = useFriends();
  const options = excludeIds ? friends.filter((f) => !excludeIds.has(f.user.id)) : friends;

  if (options.length === 0) {
    return <p className="py-2 text-xs text-text-disabled">No tenés amigos disponibles para agregar.</p>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {options.map(({ user }: Friend) => (
        <FriendRow key={user.id} user={user} checked={selected.has(user.id)} onToggle={() => onToggle(user.id)} />
      ))}
    </div>
  );
}

function FriendRow({
  user,
  checked,
  onToggle,
}: {
  user: Friend['user'];
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
        checked ? 'bg-primary/10 text-white' : 'text-text-description hover:bg-surface-hover hover:text-white'
      }`}
    >
      <FramedAvatar frame={user.avatarFrame} src={user.avatarUrl} alt={user.displayName} size={28} />
      <span className="min-w-0 flex-1 truncate">{user.displayName}</span>
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
          checked ? 'border-primary bg-primary' : 'border-surface-border'
        }`}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
      </span>
    </button>
  );
}
