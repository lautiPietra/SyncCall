import { useEffect, useRef, useState } from 'react';

export function CountBadge({ count, className = '' }: { count: number; className?: string }) {
  const prevCount = useRef(0);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    if (count > prevCount.current) {
      setAnimKey((k) => k + 1);
    }
    prevCount.current = count;
  }, [count]);

  if (count <= 0) {
    return null;
  }

  return (
    <span
      key={animKey}
      className={`animate-badge-pop inline-flex shrink-0 items-center justify-center rounded-full bg-status-dnd font-semibold text-white ${className}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
