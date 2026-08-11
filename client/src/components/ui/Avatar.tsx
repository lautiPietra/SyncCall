import { useEffect, useState } from 'react';
import type { UserStatus } from '@synccall/shared';
import { StatusDot } from './StatusDot';

interface AvatarProps {
  src: string;
  alt: string;
  size?: number;
  status?: UserStatus;
  className?: string;
}

/** Mismo patrón que el fallback del server para cuentas sin foto: iniciales sobre un color generado. */
function fallbackAvatarUrl(name: string): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
}

export function Avatar({ src, alt, size = 64, status, className = '' }: AvatarProps) {
  const [failed, setFailed] = useState(false);

  // Si cambia el src (otro usuario, o se actualizó la foto), darle una oportunidad nueva
  // antes de volver a caer en el fallback.
  useEffect(() => setFailed(false), [src]);

  return (
    <div
      className={`relative inline-block shrink-0 rounded-full ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={failed ? fallbackAvatarUrl(alt) : src}
        alt={alt}
        width={size}
        height={size}
        className="h-full w-full rounded-full object-cover"
        onError={() => setFailed(true)}
      />
      {status && (
        <span className="absolute bottom-0 right-0 translate-x-[8%] translate-y-[8%]">
          <StatusDot status={status} size={Math.max(10, size * 0.18)} />
        </span>
      )}
    </div>
  );
}
