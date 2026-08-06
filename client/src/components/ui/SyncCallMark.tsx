interface SyncCallMarkProps {
  size?: number;
  wink?: boolean;
}

export function SyncCallMark({ size = 120, wink = false }: SyncCallMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 240 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="animate-logo-pop"
    >
      <defs>
        <linearGradient id="synccall-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5B6DFF" />
          <stop offset="100%" stopColor="#7A5AF8" />
        </linearGradient>
      </defs>

      <path d="M150 46 L182 8 L196 54 Z" fill="url(#synccall-gradient)" />
      <rect x="30" y="26" width="180" height="180" rx="72" fill="url(#synccall-gradient)" />
      <rect x="52" y="48" width="136" height="124" rx="56" fill="#0B0F1D" />

      <rect x="86" y="76" width="16" height="36" rx="8" fill="white" />
      <g style={{ transformBox: 'fill-box', transformOrigin: 'center' }} className={wink ? 'animate-wink' : ''}>
        <rect x="138" y="76" width="16" height="36" rx="8" fill="white" />
      </g>

      <path
        d="M100 124 Q120 138 140 124"
        stroke="white"
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
      />

      <path
        d="M126 150 L102 190 L116 190 L98 230 L140 180 L120 180 Z"
        fill="#8B9CFF"
        stroke="#0B0F1D"
        strokeWidth="4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
