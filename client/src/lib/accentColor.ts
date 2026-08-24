type Rgb = [number, number, number];
type Hsl = [number, number, number];

const CSS_VARS = ['--color-primary', '--color-primary-hover', '--color-primary-light', '--color-primary-active'] as const;

function hexToRgb(hex: string): Rgb {
  const clean = hex.replace('#', '');
  const value = parseInt(clean, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHsl([r, g, b]: Rgb): Hsl {
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  const l = (max + min) / 2;

  if (max === min) {
    return [0, 0, l * 100];
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case rN:
      h = (gN - bN) / d + (gN < bN ? 6 : 0);
      break;
    case gN:
      h = (bN - rN) / d + 2;
      break;
    default:
      h = (rN - gN) / d + 4;
  }
  return [(h / 6) * 360, s * 100, l * 100];
}

function hslToRgb([h, s, l]: Hsl): Rgb {
  const hN = h / 360;
  const sN = s / 100;
  const lN = l / 100;

  if (sN === 0) {
    const v = Math.round(lN * 255);
    return [v, v, v];
  }

  const hue2rgb = (p: number, q: number, t: number): number => {
    let tN = t;
    if (tN < 0) tN += 1;
    if (tN > 1) tN -= 1;
    if (tN < 1 / 6) return p + (q - p) * 6 * tN;
    if (tN < 1 / 2) return q;
    if (tN < 2 / 3) return p + (q - p) * (2 / 3 - tN) * 6;
    return p;
  };

  const q = lN < 0.5 ? lN * (1 + sN) : lN + sN - lN * sN;
  const p = 2 * lN - q;
  return [Math.round(hue2rgb(p, q, hN + 1 / 3) * 255), Math.round(hue2rgb(p, q, hN) * 255), Math.round(hue2rgb(p, q, hN - 1 / 3) * 255)];
}

function clampLightness(l: number): number {
  return Math.min(96, Math.max(4, l));
}

function triplet([r, g, b]: Rgb): string {
  return `${r} ${g} ${b}`;
}

/**
 * Pinta el color primario de toda la app (botones, links, focos, etc.) a partir del
 * `accentColor` del usuario. Las variantes hover/light/active se derivan por HSL en vez de
 * pedirle 4 colores al usuario, tocando los mismos custom properties que consume
 * tailwind.config.ts para `primary.*`.
 */
export function applyAccentColor(hex: string): void {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    return;
  }
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  const root = document.documentElement.style;
  root.setProperty(CSS_VARS[0], triplet(hexToRgb(hex)));
  root.setProperty(CSS_VARS[1], triplet(hslToRgb([h, s, clampLightness(l - 6)])));
  root.setProperty(CSS_VARS[2], triplet(hslToRgb([h, s, clampLightness(l + 12)])));
  root.setProperty(CSS_VARS[3], triplet(hslToRgb([h, s, clampLightness(l - 14)])));
}

export function resetAccentColor(): void {
  const root = document.documentElement.style;
  CSS_VARS.forEach((name) => root.removeProperty(name));
}
