import type { NameplateId } from '@synccall/shared';

export const NAMEPLATE_LABELS: Record<NameplateId, string> = {
  none: 'Sin placa',
  dragon: 'Fuego',
  serpent: 'Esmeralda',
  phoenix: 'Oro',
  wolf: 'Hielo',
  tiger: 'Ámbar',
  warrior: 'Bronce',
  galaxy: 'Galaxia',
  kraken: 'Diamante',
};

interface NameplateSurfaceProps {
  nameplate: NameplateId | undefined;
  className?: string;
}

/**
 * Fondo animado que va detrás de una fila de amigo/perfil (avatar + nombre) en Mensajes
 * Directos. Se renderiza absolute/inset-0 dentro de un contenedor `relative overflow-hidden`;
 * el contenido de la fila tiene que ir en un wrapper `relative z-10` aparte para quedar
 * arriba (un hijo posicionado siempre pinta por encima de los hermanos no posicionados).
 */
export function NameplateSurface({ nameplate, className = '' }: NameplateSurfaceProps) {
  // Sin placa elegida, o un usuario/documento viejo que todavía no tiene el campo: no
  // mostramos nada en vez de arriesgarnos a pintar solo el scrim oscuro sin capas debajo.
  if (!nameplate || nameplate === 'none') {
    return null;
  }

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden rounded-md ${className}`} aria-hidden="true">
      <NameplateLayers nameplate={nameplate} />
      {/* Oscurece levemente todo el fondo para que el nombre siga siendo legible encima. */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/15 via-black/10 to-black/35" />
    </div>
  );
}

export function NameplatePreview({ nameplate }: { nameplate: NameplateId }) {
  return (
    <div className="relative h-10 w-24 overflow-hidden rounded-md bg-bg/60">
      <NameplateSurface nameplate={nameplate} />
    </div>
  );
}

function NameplateLayers({ nameplate }: { nameplate: Exclude<NameplateId, 'none'> }) {
  switch (nameplate) {
    case 'dragon':
      return (
        <>
          <div className="absolute inset-0 bg-gradient-to-b from-[#3D0B0B] via-[#7A0C0C] to-[#1A0404]" />
          <div className="animate-glow-pulse absolute -right-4 -top-4 h-16 w-16 rounded-full bg-orange-400/40 blur-xl" />
          <FlameLayer />
          <Embers color="#FFD37A" />
        </>
      );
    case 'serpent':
      return (
        <>
          <div className="absolute inset-0 bg-gradient-to-r from-[#052E1F] via-[#0B6B4A] to-[#031A12]" />
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                'repeating-linear-gradient(60deg, rgba(255,255,255,0.09) 0px, rgba(255,255,255,0.09) 2px, transparent 2px, transparent 7px)',
            }}
          />
          <div className="animate-shimmer-sweep absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-emerald-200/30 to-transparent" />
          <div className="animate-glow-pulse absolute -left-3 top-1/2 h-12 w-12 -translate-y-1/2 rounded-full bg-emerald-300/30 blur-lg" />
          <Embers color="#7CF0BE" count={3} />
        </>
      );
    case 'phoenix':
      return (
        <>
          <div className="absolute inset-0 bg-gradient-to-r from-[#7A5C0A] via-[#F5C518] to-[#3D2E05]" />
          <div
            className="animate-spin-slower absolute -inset-8 opacity-40"
            style={{ background: 'conic-gradient(from 0deg, transparent, #FFF3C4, transparent 40%)' }}
          />
          <div className="animate-shimmer-sweep absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-yellow-100/45 to-transparent" />
          <div className="animate-glow-pulse absolute -right-4 -top-4 h-16 w-16 rounded-full bg-yellow-200/40 blur-xl" />
          <Stars count={5} />
        </>
      );
    case 'wolf':
      return (
        <>
          <div className="absolute inset-0 bg-gradient-to-r from-[#DFF6FF] via-[#6FCBEA] to-[#0E4C63]" />
          <div
            className="absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                'repeating-linear-gradient(48deg, rgba(255,255,255,0.16) 0px, rgba(255,255,255,0.16) 1px, transparent 1px, transparent 11px), repeating-linear-gradient(-48deg, rgba(255,255,255,0.14) 0px, rgba(255,255,255,0.14) 1px, transparent 1px, transparent 13px)',
            }}
          />
          <div className="animate-glow-pulse absolute -right-3 -top-3 h-10 w-10 rounded-full bg-white/60 blur-lg" />
          <div className="animate-shimmer-sweep absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
          <Stars count={5} />
        </>
      );
    case 'tiger':
      return (
        <>
          <div className="absolute inset-0 bg-gradient-to-r from-[#D97706] via-[#78350F] to-[#1C1006]" />
          <div
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                'repeating-linear-gradient(115deg, rgba(0,0,0,0.5) 0px, rgba(0,0,0,0.5) 5px, transparent 5px, transparent 13px)',
            }}
          />
          <div className="animate-shimmer-sweep absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-amber-100/25 to-transparent" />
          <div className="animate-glow-pulse absolute -right-2 -bottom-2 h-12 w-12 rounded-full bg-amber-400/30 blur-lg" />
        </>
      );
    case 'warrior':
      return (
        <>
          <div className="absolute inset-0 bg-gradient-to-r from-[#5C3A1E] via-[#B8834A] to-[#2E1B0C]" />
          <div
            className="absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                'repeating-linear-gradient(100deg, rgba(255,255,255,0.3) 0px, transparent 1.5px, transparent 10px)',
            }}
          />
          <div className="animate-shimmer-sweep absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/35 to-transparent" />
          <div className="animate-glow-pulse absolute -right-3 top-1/2 h-12 w-12 -translate-y-1/2 rounded-full bg-yellow-200/25 blur-lg" />
        </>
      );
    case 'galaxy':
      return (
        <>
          <div
            className="animate-aurora-flow absolute inset-0"
            style={{
              background: 'linear-gradient(120deg, #1B0B3D, #4C1D95, #7A5AF8, #1B0B3D)',
              backgroundSize: '300% 300%',
            }}
          />
          <div className="animate-glow-pulse absolute -right-4 -top-4 h-16 w-16 rounded-full bg-fuchsia-300/30 blur-xl" />
          <Stars count={7} />
        </>
      );
    case 'kraken':
      return (
        <>
          <div className="absolute inset-0 bg-gradient-to-r from-[#E8F4FF] via-[#A9D8F0] to-[#1B3A4B]" />
          <div className="animate-shimmer-sweep absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/60 to-transparent" />
          <div
            className="animate-shimmer-sweep absolute inset-y-0 left-0 w-1/4 opacity-70"
            style={{
              background: 'linear-gradient(100deg, transparent, rgba(240,190,255,0.4), transparent 60%)',
              animationDelay: '1.3s',
            }}
          />
          <div className="animate-glow-pulse absolute -right-4 -top-4 h-16 w-16 rounded-full bg-white/50 blur-xl" />
          <Stars count={6} />
        </>
      );
  }
}

function Embers({ color, count = 4 }: { color: string; count?: number }) {
  const embers = Array.from({ length: count }, (_, i) => ({
    left: `${10 + i * (76 / Math.max(count - 1, 1))}%`,
    delay: `${i * 480}ms`,
    size: 3 + (i % 2),
  }));
  return (
    <>
      {embers.map((e, i) => (
        <span
          key={i}
          className="animate-ember-rise absolute bottom-1 rounded-full"
          style={{
            left: e.left,
            width: e.size,
            height: e.size,
            backgroundColor: color,
            animationDelay: e.delay,
            boxShadow: `0 0 4px 1px ${color}`,
          }}
        />
      ))}
    </>
  );
}

function flamePath(cx: number, baseY: number, h: number, w: number): string {
  return `M${cx - w / 2},${baseY} C${cx - w * 0.55},${baseY - h * 0.42} ${cx - w * 0.18},${baseY - h * 0.78} ${cx},${baseY - h} C${cx + w * 0.18},${baseY - h * 0.78} ${cx + w * 0.55},${baseY - h * 0.42} ${cx + w / 2},${baseY} C${cx + w * 0.22},${baseY - h * 0.14} ${cx - w * 0.22},${baseY - h * 0.14} ${cx - w / 2},${baseY} Z`;
}

/** Llamas de verdad (no solo un tinte de color): varias lenguas de fuego apiladas y titilando a distinto ritmo. */
function FlameLayer() {
  const flames = [
    { cx: 14, h: 46, w: 26 },
    { cx: 42, h: 62, w: 30 },
    { cx: 72, h: 52, w: 27 },
    { cx: 100, h: 68, w: 32 },
    { cx: 130, h: 50, w: 26 },
    { cx: 160, h: 60, w: 29 },
    { cx: 186, h: 44, w: 24 },
  ];
  return (
    <svg viewBox="0 0 200 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
      {flames.map((f, i) => (
        <g key={i}>
          <path
            d={flamePath(f.cx, 100, f.h, f.w)}
            fill="#D93A0F"
            opacity="0.9"
            style={{ transformOrigin: `${f.cx}px 100px`, animationDelay: `${i * 140}ms` }}
            className="animate-flicker"
          />
          <path
            d={flamePath(f.cx, 100, f.h * 0.68, f.w * 0.62)}
            fill="#FF9A1F"
            opacity="0.92"
            style={{ transformOrigin: `${f.cx}px 100px`, animationDelay: `${i * 140 + 90}ms` }}
            className="animate-flicker"
          />
          <path
            d={flamePath(f.cx, 100, f.h * 0.36, f.w * 0.32)}
            fill="#FFE9A8"
            opacity="0.95"
            style={{ transformOrigin: `${f.cx}px 100px`, animationDelay: `${i * 140 + 180}ms` }}
            className="animate-flicker"
          />
        </g>
      ))}
    </svg>
  );
}

function Stars({ count = 5 }: { count?: number }) {
  const stars = Array.from({ length: count }, (_, i) => ({
    top: `${10 + ((i * 37) % 70)}%`,
    left: `${8 + ((i * 53) % 84)}%`,
    delay: `${i * 260}ms`,
    size: 2 + (i % 2),
  }));
  return (
    <>
      {stars.map((s, i) => (
        <span
          key={i}
          className="animate-twinkle absolute rounded-full bg-white"
          style={{
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            animationDelay: s.delay,
            boxShadow: '0 0 3px 1px rgba(255,255,255,0.85)',
          }}
        />
      ))}
    </>
  );
}
