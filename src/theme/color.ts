/** Small colour helpers: OKLCH (perceptual lightness, chroma, hue) to sRGB hex, and WCAG contrast. */

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

/** OKLCH to linear sRGB (Björn Ottosson's OKLab). */
function oklchToLinear(l: number, c: number, h: number): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180), b = c * Math.sin((h * Math.PI) / 180);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - (0.06385 + 0.0000041728) * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3, M = m_ ** 3, S = s_ ** 3;
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
}
const inGamut = (rgb: number[]) => rgb.every((v) => v >= -0.0005 && v <= 1.0005);
const encode = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/** OKLCH to hex. Colours outside what a screen can show keep their lightness and hue and lose chroma until they fit. */
export function oklch(l: number, c: number, h: number): string {
  l = clamp(l);
  let lo = 0, hi = c, rgb = oklchToLinear(l, c, h);
  if (!inGamut(rgb)) {
    for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2; if (inGamut(oklchToLinear(l, mid, h))) lo = mid; else hi = mid; }
    rgb = oklchToLinear(l, lo, h);
  }
  return '#' + rgb.map((v) => Math.round(clamp(encode(clamp(v))) * 255).toString(16).padStart(2, '0')).join('');
}

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** WCAG contrast ratio between two hex colours (1 to 21). */
export function contrast(a: string, b: string) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Move a colour's lightness (darker on light backgrounds, lighter on dark ones) until it reaches a contrast ratio against every background given. */
export function reach(l: number, c: number, h: number, against: string[], ratio: number, dir: 1 | -1): string {
  let L = l;
  for (let i = 0; i < 80; i++) {
    const hex = oklch(L, c, h);
    if (against.every((bg) => contrast(hex, bg) >= ratio)) return hex;
    L += dir * 0.01;
    if (L <= 0 || L >= 1) break;
  }
  return oklch(clamp(L), c, h);
}

/** A hex colour with transparency, for shadows. */
export const alpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
