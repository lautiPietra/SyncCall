import type { UserStatus } from '@synccall/shared';
import { StatusDot } from './StatusDot';

interface AvatarProps {
  src: string;
  alt: string;
  size?: number;
  status?: UserStatus;
  className?: string;
}

export function Avatar({ src, alt, size = 64, status, className = '' }: AvatarProps) {
  return (
    <div
      className={`relative inline-block shrink-0 rounded-full ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        className="h-full w-full rounded-full object-cover"
      />
      {status && (
        <span className="absolute bottom-0 right-0 translate-x-[8%] translate-y-[8%]">
          <StatusDot status={status} size={Math.max(10, size * 0.18)} />
        </span>
      )}
    </div>
  );
}
