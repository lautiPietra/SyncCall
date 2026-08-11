import type { AvatarFrameId, UserStatus } from '@synccall/shared';
import { Avatar } from './Avatar';

export const AVATAR_FRAME_LABELS: Record<AvatarFrameId, string> = {
  none: 'Sin marco',
  aurora: 'Aurora',
  neon: 'Neón',
  gold: 'Oro',
  orbit: 'Órbita',
  ice: 'Hielo',
  flame: 'Fuego',
  cosmic: 'Cósmico',
  emerald: 'Esmeralda',
  rainbow: 'Arcoíris',
};

interface FramedAvatarProps {
  frame: AvatarFrameId;
  src: string;
  alt: string;
  size?: number;
  status?: UserStatus;
}

export function FramedAvatar({ frame, src, alt, size = 96, status }: FramedAvatarProps) {
  if (frame === 'none') {
    return <Avatar src={src} alt={alt} size={size} status={status} />;
  }

  if (frame === 'orbit') {
    const outer = size + 22;
    return (
      <div className="relative flex items-center justify-center" style={{ width: outer, height: outer }}>
        <svg
          className="absolute inset-0 animate-spin-slow"
          width={outer}
          height={outer}
          viewBox={`0 0 ${outer} ${outer}`}
        >
          <defs>
            <linearGradient id="orbit-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#5B6DFF" />
              <stop offset="100%" stopColor="#7A5AF8" />
            </linearGradient>
          </defs>
          <circle
            cx={outer / 2}
            cy={outer / 2}
            r={outer / 2 - 2.5}
            fill="none"
            stroke="url(#orbit-gradient)"
            strokeWidth="2.5"
            strokeDasharray="7 9"
            strokeLinecap="round"
          />
        </svg>
        <Avatar src={src} alt={alt} size={size} status={status} />
      </div>
    );
  }

  if (frame === 'ice') {
    const outer = size + 14;
    const sparkles = [
      { top: '2%', left: '18%', delay: '0ms' },
      { top: '14%', right: '0%', delay: '450ms' },
      { bottom: '6%', left: '2%', delay: '900ms' },
    ];
    return (
      <div className="relative" style={{ width: outer, height: outer }}>
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#E0FBFF] via-[#8FE0F5] to-[#3FA9D6]" />
        <div className="absolute inset-[3px] rounded-full bg-card" />
        <div className="absolute inset-[6px]">
          <Avatar src={src} alt={alt} size={size} status={status} />
        </div>
        {sparkles.map((pos, i) => (
          <span
            key={i}
            className="animate-twinkle absolute h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_6px_2px_rgba(255,255,255,0.8)]"
            style={{ ...pos, animationDelay: pos.delay }}
          />
        ))}
      </div>
    );
  }

  if (frame === 'gold') {
    const outer = size + 14;
    return (
      <div className="relative" style={{ width: outer, height: outer }}>
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#FDE68A] via-[#F5B942] to-[#9A6B0C]" />
        <div className="absolute inset-[2.5px] rounded-full bg-gradient-to-tl from-[#B8860B] via-transparent to-[#FFF3C4] opacity-70" />
        <div className="absolute inset-[4.5px] rounded-full bg-card" />
        <div className="absolute inset-[7.5px]">
          <Avatar src={src} alt={alt} size={size} status={status} />
        </div>
        <span
          className="absolute left-1/2 top-[-3px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-gradient-to-br from-[#FDE68A] to-[#B8860B] shadow-[0_0_4px_rgba(253,230,138,0.8)]"
          aria-hidden
        />
      </div>
    );
  }

  if (frame === 'neon') {
    const outer = size + 14;
    return (
      <div className="relative" style={{ width: outer, height: outer }}>
        <div className="animate-glow-pulse absolute inset-[-6px] rounded-full bg-primary/60 blur-md" />
        <div className="absolute inset-0 animate-pulse rounded-full bg-primary shadow-[0_0_14px_3px_rgba(91,109,255,0.65)]" />
        <div className="absolute inset-[3px] rounded-full bg-card" />
        <div className="absolute inset-[6px]">
          <Avatar src={src} alt={alt} size={size} status={status} />
        </div>
      </div>
    );
  }

  if (frame === 'flame') {
    const outer = size + 14;
    return (
      <div className="relative" style={{ width: outer, height: outer }}>
        <div className="animate-glow-pulse absolute inset-[-6px] rounded-full bg-orange-500/50 blur-md" />
        <div className="animate-flicker absolute inset-0 rounded-full bg-gradient-to-br from-[#FFD37A] via-[#FF7A45] to-[#C2261B]" />
        <div className="absolute inset-[3px] rounded-full bg-card" />
        <div className="absolute inset-[6px]">
          <Avatar src={src} alt={alt} size={size} status={status} />
        </div>
        <span
          className="absolute bottom-[-4px] left-1/2 h-3 w-2.5 -translate-x-1/2 rounded-b-full rounded-t-sm bg-gradient-to-b from-[#FFD37A] to-[#C2261B]"
          aria-hidden
        />
      </div>
    );
  }

  if (frame === 'cosmic') {
    const outer = size + 14;
    const stars = [
      { top: '4%', left: '10%', delay: '0ms', size: 5 },
      { top: '18%', right: '2%', delay: '350ms', size: 4 },
      { bottom: '10%', left: '0%', delay: '700ms', size: 4 },
      { bottom: '2%', right: '16%', delay: '1050ms', size: 5 },
    ];
    return (
      <div className="relative" style={{ width: outer, height: outer }}>
        <div className="animate-spin-slower absolute inset-0 rounded-full bg-gradient-to-br from-[#2A1B5E] via-[#5B2FCC] to-[#0B0F1D]" />
        <div className="absolute inset-[3px] rounded-full bg-card" />
        <div className="absolute inset-[6px]">
          <Avatar src={src} alt={alt} size={size} status={status} />
        </div>
        {stars.map((pos, i) => (
          <span
            key={i}
            className="animate-twinkle absolute rounded-full bg-white shadow-[0_0_5px_1.5px_rgba(196,181,253,0.9)]"
            style={{ ...pos, width: pos.size, height: pos.size, animationDelay: pos.delay }}
          />
        ))}
      </div>
    );
  }

  if (frame === 'emerald') {
    const outer = size + 14;
    return (
      <div className="relative" style={{ width: outer, height: outer }}>
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#6EE7B7] via-[#10B981] to-[#065F46]" />
        <div className="absolute inset-[2.5px] rounded-full bg-gradient-to-tl from-[#065F46] via-transparent to-[#D1FAE5] opacity-70" />
        <div className="absolute inset-[4.5px] rounded-full bg-card" />
        <div className="absolute inset-[7.5px]">
          <Avatar src={src} alt={alt} size={size} status={status} />
        </div>
        <span
          className="absolute left-1/2 top-[-3px] h-3 w-2.5 -translate-x-1/2 rounded-b-full rounded-t-sm bg-gradient-to-br from-[#6EE7B7] to-[#065F46] shadow-[0_0_4px_rgba(16,185,129,0.8)]"
          aria-hidden
        />
      </div>
    );
  }

  if (frame === 'rainbow') {
    const outer = size + 14;
    return (
      <div className="relative" style={{ width: outer, height: outer }}>
        <div
          className="animate-spin-slow absolute inset-0 rounded-full"
          style={{
            background:
              'conic-gradient(from 0deg, #FF3B3B, #FF9A3B, #FFE23B, #3BFF6E, #3BB6FF, #7A5AF8, #FF3B3B)',
          }}
        />
        <div className="absolute inset-[3px] rounded-full bg-card" />
        <div className="absolute inset-[6px]">
          <Avatar src={src} alt={alt} size={size} status={status} />
        </div>
      </div>
    );
  }

  if (frame === 'aurora') {
    const outer = size + 14;
    const auroraGradient =
      'linear-gradient(120deg, #2DD4BF, #38BDF8, #7A5AF8, #4ADE80, #2DD4BF)';
    return (
      <div className="relative" style={{ width: outer, height: outer }}>
        <div
          className="animate-aurora-flow absolute inset-[-5px] rounded-full opacity-60 blur-md"
          style={{ background: auroraGradient, backgroundSize: '300% 300%' }}
        />
        <div
          className="animate-aurora-flow absolute inset-0 rounded-full"
          style={{ background: auroraGradient, backgroundSize: '300% 300%' }}
        />
        <div className="absolute inset-[3px] rounded-full bg-card" />
        <div className="absolute inset-[6px]">
          <Avatar src={src} alt={alt} size={size} status={status} />
        </div>
      </div>
    );
  }

  // Frame no reconocido o ausente (ej. un endpoint que no seleccionó avatarFrame): mejor
  // mostrar el avatar sin marco que caer silenciosamente en el de aurora por defecto.
  return <Avatar src={src} alt={alt} size={size} status={status} />;
}
