import type { UserStatus } from '@synccall/shared';

const STATUS_CLASSES: Record<UserStatus, string> = {
  online: 'bg-status-online',
  idle: 'bg-status-idle',
  dnd: 'bg-status-dnd',
  invisible: 'bg-status-invisible',
};

const STATUS_LABELS: Record<UserStatus, string> = {
  online: 'En línea',
  idle: 'Ausente',
  dnd: 'No molestar',
  invisible: 'Invisible',
};

interface StatusDotProps {
  status: UserStatus;
  size?: number;
}

export function StatusDot({ status, size = 12 }: StatusDotProps) {
  return (
    <span
      className={`inline-block rounded-full ring-2 ring-card ${STATUS_CLASSES[status]}`}
      style={{ width: size, height: size }}
      title={STATUS_LABELS[status]}
    />
  );
}

export { STATUS_LABELS };
