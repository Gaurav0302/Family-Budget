import { alpha, contrast, oklch, reach } from './color';

export type Mode = 'light' | 'dark';
type Font = 'grotesk' | 'geometric' | 'serif' | 'rounded' | 'editorial' | 'mono' | 'humanist';
type Shape = 'sharp' | 'soft' | 'standard' | 'round';

/** One theme, described by a few choices; every colour is worked out from these, for light and for dark, with readable contrast guaranteed. */
export interface ThemeSpec {
  id: string;
  name: string;
  family: string;
  /** Main colour (buttons, links, the selected tab): chroma and hue in OKLCH. */
  primary: [number, number];
  /** Second colour (highlights, meters, the budget line). */
  second: [number, number];
  /** The tint of backgrounds and greys: hue and chroma. */
  neutral: [number, number];
  font: Font;
  shape: Shape;
  /** Lightness of the page background in light mode (0.94 sage paper to 0.99 near white). */
  paper?: number;
  /** Lightness of the page background in dark mode (0.12 near black to 0.26 slate). */
  night?: number;
  /** A short line on the feel, shown in the picker. */
  feel: string;
}

const F = (family: string) => (list: Omit<ThemeSpec, 'family'>[]) => list.map((t) => ({ ...t, family }));

export const THEMES: ThemeSpec[] = [
  ...F('Calm & natural')([
    { id: 'eucalyptus', name: 'Eucalyptus', primary: [0.06, 170], second: [0.12, 85], neutral: [155, 0.012], font: 'grotesk', shape: 'standard', feel: 'Eucalyptus and brass on sage paper' },
    { id: 'sage-garden', name: 'Sage Garden', primary: [0.08, 150], second: [0.12, 80], neutral: [145, 0.014], font: 'humanist', shape: 'soft', paper: 0.96, feel: 'Soft greens, honey highlights' },
    { id: 'moss', name: 'Moss', primary: [0.1, 132], second: [0.1, 55], neutral: [120, 0.016], font: 'grotesk', shape: 'soft', paper: 0.95, night: 0.18, feel: 'Forest floor, copper accents' },
    { id: 'olive-grove', name: 'Olive Grove', primary: [0.09, 112], second: [0.11, 65], neutral: [100, 0.016], font: 'serif', shape: 'standard', paper: 0.96, feel: 'Mediterranean olive and ochre' },
    { id: 'fern', name: 'Fern', primary: [0.12, 155], second: [0.1, 205], neutral: [160, 0.01], font: 'rounded', shape: 'round', paper: 0.97, feel: 'Fresh green with a splash of sky' },
    { id: 'matcha', name: 'Matcha', primary: [0.11, 128], second: [0.07, 55], neutral: [105, 0.02], font: 'geometric', shape: 'soft', paper: 0.965, feel: 'Tea-house green on rice paper' },
  ]),
  ...F('Ocean & sky')([
    { id: 'harbour', name: 'Harbour', primary: [0.11, 245], second: [0.12, 82], neutral: [240, 0.012], font: 'grotesk', shape: 'standard', paper: 0.96, feel: 'Navy water, brass fittings' },
    { id: 'lagoon', name: 'Lagoon', primary: [0.1, 195], second: [0.13, 28], neutral: [200, 0.012], font: 'rounded', shape: 'round', paper: 0.97, feel: 'Turquoise with coral' },
    { id: 'glacier', name: 'Glacier', primary: [0.09, 228], second: [0.09, 275], neutral: [230, 0.014], font: 'geometric', shape: 'soft', paper: 0.975, night: 0.2, feel: 'Ice blue and cool lilac' },
    { id: 'deep-sea', name: 'Deep Sea', primary: [0.13, 258], second: [0.11, 188], neutral: [255, 0.022], font: 'geometric', shape: 'standard', paper: 0.955, night: 0.16, feel: 'Ink-blue depths, bioluminescent teal' },
    { id: 'coastal', name: 'Coastal', primary: [0.09, 218], second: [0.1, 72], neutral: [80, 0.014], font: 'serif', shape: 'soft', paper: 0.96, feel: 'Sea blue on beach sand' },
    { id: 'tidepool', name: 'Tidepool', primary: [0.1, 182], second: [0.14, 355], neutral: [190, 0.01], font: 'humanist', shape: 'soft', paper: 0.965, feel: 'Rock-pool teal and anemone pink' },
  ]),
  ...F('Warm & earthy')([
    { id: 'terracotta', name: 'Terracotta', primary: [0.13, 40], second: [0.09, 150], neutral: [60, 0.016], font: 'serif', shape: 'standard', paper: 0.955, feel: 'Fired clay and garden green' },
    { id: 'desert-sand', name: 'Desert Sand', primary: [0.1, 62], second: [0.1, 222], neutral: [75, 0.022], font: 'geometric', shape: 'soft', paper: 0.95, feel: 'Dune gold under a blue sky' },
    { id: 'clay', name: 'Clay', primary: [0.09, 30], second: [0.07, 90], neutral: [50, 0.012], font: 'humanist', shape: 'soft', paper: 0.96, feel: 'Quiet pottery tones' },
    { id: 'saffron', name: 'Saffron', primary: [0.14, 68], second: [0.12, 18], neutral: [80, 0.016], font: 'rounded', shape: 'round', paper: 0.965, feel: 'Spice-market yellow and chilli' },
    { id: 'cinnamon', name: 'Cinnamon', primary: [0.11, 45], second: [0.08, 108], neutral: [55, 0.02], font: 'editorial', shape: 'standard', paper: 0.955, feel: 'Warm spice, bakery calm' },
    { id: 'outback', name: 'Outback', primary: [0.13, 35], second: [0.1, 95], neutral: [45, 0.022], font: 'grotesk', shape: 'sharp', paper: 0.95, night: 0.17, feel: 'Red earth and spinifex' },
  ]),
  ...F('Bold & bright')([
    { id: 'coral-punch', name: 'Coral Punch', primary: [0.18, 25], second: [0.12, 255], neutral: [260, 0.01], font: 'geometric', shape: 'round', paper: 0.97, night: 0.2, feel: 'Hot coral, bank-card blue' },
    { id: 'electric-violet', name: 'Electric Violet', primary: [0.2, 285], second: [0.15, 200], neutral: [280, 0.012], font: 'geometric', shape: 'soft', paper: 0.97, night: 0.16, feel: 'Vivid violet with a cyan spark' },
    { id: 'neon-ledger', name: 'Neon Ledger', primary: [0.2, 140], second: [0.17, 330], neutral: [140, 0.004], font: 'geometric', shape: 'sharp', paper: 0.975, night: 0.13, feel: 'Trading-floor green on black' },
    { id: 'money-green', name: 'Money Green', primary: [0.19, 148], second: [0.12, 95], neutral: [150, 0.008], font: 'rounded', shape: 'round', paper: 0.975, night: 0.17, feel: 'Bright banknote green' },
    { id: 'ultramarine', name: 'Ultramarine', primary: [0.19, 275], second: [0.14, 200], neutral: [270, 0.012], font: 'grotesk', shape: 'soft', paper: 0.975, night: 0.19, feel: 'Deep blurple, crisp and techy' },
    { id: 'sunset-pop', name: 'Sunset Pop', primary: [0.19, 15], second: [0.16, 60], neutral: [20, 0.012], font: 'rounded', shape: 'round', paper: 0.97, night: 0.18, feel: 'Pink-to-orange evening glow' },
  ]),
  ...F('Night studio')([
    { id: 'vampire', name: 'Vampire', primary: [0.13, 300], second: [0.17, 350], neutral: [285, 0.03], font: 'mono', shape: 'soft', paper: 0.96, night: 0.24, feel: 'Purple and pink coder classic' },
    { id: 'polar-night', name: 'Polar Night', primary: [0.08, 232], second: [0.1, 92], neutral: [252, 0.026], font: 'geometric', shape: 'soft', paper: 0.95, night: 0.27, feel: 'Arctic frost and aurora gold' },
    { id: 'solar', name: 'Solar', primary: [0.12, 240], second: [0.14, 85], neutral: [95, 0.035], font: 'mono', shape: 'sharp', paper: 0.965, night: 0.24, feel: 'Low-glare cream and teal-blue' },
    { id: 'retro-groove', name: 'Retro Groove', primary: [0.12, 75], second: [0.13, 30], neutral: [70, 0.03], font: 'mono', shape: 'sharp', paper: 0.94, night: 0.23, feel: 'Seventies amber and rust' },
    { id: 'mocha-latte', name: 'Mocha Latte', primary: [0.13, 290], second: [0.1, 350], neutral: [280, 0.025], font: 'rounded', shape: 'round', paper: 0.955, night: 0.22, feel: 'Pastel mauve, coffee-house cosy' },
    { id: 'dusky-rose', name: 'Dusky Rose', primary: [0.09, 350], second: [0.08, 200], neutral: [300, 0.025], font: 'humanist', shape: 'soft', paper: 0.965, night: 0.2, feel: 'Rose, pine and dusk' },
  ]),
  ...F('Elegant & luxe')([
    { id: 'champagne', name: 'Champagne', primary: [0.08, 72], second: [0.06, 30], neutral: [80, 0.016], font: 'editorial', shape: 'soft', paper: 0.965, feel: 'Pale gold and blush' },
    { id: 'onyx-gold', name: 'Onyx & Gold', primary: [0.12, 85], second: [0.05, 85], neutral: [85, 0.003], font: 'editorial', shape: 'sharp', paper: 0.97, night: 0.13, feel: 'Black card, gold leaf' },
    { id: 'bordeaux', name: 'Bordeaux', primary: [0.14, 15], second: [0.1, 80], neutral: [20, 0.012], font: 'serif', shape: 'standard', paper: 0.96, feel: 'Wine red and candlelight' },
    { id: 'emerald-club', name: 'Emerald Club', primary: [0.12, 162], second: [0.11, 85], neutral: [165, 0.016], font: 'editorial', shape: 'standard', paper: 0.955, night: 0.17, feel: 'Green leather and brass' },
    { id: 'pearl', name: 'Pearl', primary: [0.06, 282], second: [0.07, 340], neutral: [290, 0.008], font: 'geometric', shape: 'round', paper: 0.985, night: 0.21, feel: 'Iridescent white, soft lilac' },
    { id: 'velvet-plum', name: 'Velvet Plum', primary: [0.13, 330], second: [0.1, 80], neutral: [330, 0.016], font: 'serif', shape: 'standard', paper: 0.96, night: 0.18, feel: 'Plum velvet, gold thread' },
  ]),
  ...F('Minimal & paper')([
    { id: 'paper', name: 'Paper', primary: [0.03, 250], second: [0.1, 60], neutral: [80, 0.006], font: 'humanist', shape: 'soft', paper: 0.985, night: 0.2, feel: 'Plain notebook, nothing extra' },
    { id: 'ink', name: 'Ink', primary: [0.16, 255], second: [0.08, 255], neutral: [255, 0.004], font: 'geometric', shape: 'soft', paper: 0.99, night: 0.17, feel: 'Clean white, one blue' },
    { id: 'graphite', name: 'Graphite', primary: [0.02, 260], second: [0.13, 60], neutral: [260, 0.008], font: 'mono', shape: 'sharp', paper: 0.96, night: 0.18, feel: 'Pencil grey and a highlighter' },
    { id: 'linen', name: 'Linen', primary: [0.07, 58], second: [0.06, 150], neutral: [70, 0.012], font: 'serif', shape: 'soft', paper: 0.965, feel: 'Natural cloth, unbleached' },
    { id: 'newsprint', name: 'Newsprint', primary: [0.03, 90], second: [0.15, 28], neutral: [90, 0.01], font: 'editorial', shape: 'sharp', paper: 0.955, night: 0.19, feel: 'Morning paper, red pencil' },
    { id: 'swiss', name: 'Swiss', primary: [0.2, 27], second: [0.02, 260], neutral: [0, 0], font: 'grotesk', shape: 'sharp', paper: 0.985, night: 0.15, feel: 'White, black and one red' },
  ]),
  ...F('Playful')([
    { id: 'bubblegum', name: 'Bubblegum', primary: [0.15, 355], second: [0.11, 220], neutral: [350, 0.02], font: 'rounded', shape: 'round', paper: 0.97, feel: 'Pink and sky, all smiles' },
    { id: 'lime-soda', name: 'Lime Soda', primary: [0.17, 128], second: [0.13, 300], neutral: [120, 0.015], font: 'rounded', shape: 'round', paper: 0.975, feel: 'Fizzy lime and grape' },
    { id: 'tangerine', name: 'Tangerine', primary: [0.17, 50], second: [0.12, 250], neutral: [55, 0.015], font: 'rounded', shape: 'round', paper: 0.97, feel: 'Juicy orange, cool blue' },
    { id: 'lavender-haze', name: 'Lavender Haze', primary: [0.12, 300], second: [0.1, 190], neutral: [300, 0.02], font: 'humanist', shape: 'round', paper: 0.965, feel: 'Dreamy lavender and mint' },
    { id: 'jelly-bean', name: 'Jelly Bean', primary: [0.16, 270], second: [0.17, 20], neutral: [275, 0.015], font: 'rounded', shape: 'round', paper: 0.97, feel: 'Candy blue and cherry' },
    { id: 'mint-chip', name: 'Mint Chip', primary: [0.1, 170], second: [0.06, 40], neutral: [170, 0.015], font: 'geometric', shape: 'round', paper: 0.975, feel: 'Mint ice cream, chocolate chips' },
  ]),
  ...F('Seasons & places')([
    { id: 'cherry-blossom', name: 'Cherry Blossom', primary: [0.12, 0], second: [0.08, 140], neutral: [10, 0.015], font: 'serif', shape: 'round', paper: 0.97, feel: 'Spring petals and new leaves' },
    { id: 'monsoon', name: 'Monsoon', primary: [0.08, 240], second: [0.12, 150], neutral: [230, 0.02], font: 'humanist', shape: 'soft', paper: 0.95, night: 0.2, feel: 'Rain-grey sky, wet green' },
    { id: 'aurora', name: 'Aurora', primary: [0.14, 170], second: [0.15, 310], neutral: [260, 0.02], font: 'geometric', shape: 'soft', paper: 0.965, night: 0.16, feel: 'Northern lights over a dark sky' },
    { id: 'autumn-maple', name: 'Autumn Maple', primary: [0.15, 40], second: [0.12, 85], neutral: [50, 0.02], font: 'serif', shape: 'standard', paper: 0.955, feel: 'Maple red and harvest gold' },
    { id: 'midnight-city', name: 'Midnight City', primary: [0.13, 270], second: [0.13, 330], neutral: [270, 0.03], font: 'mono', shape: 'soft', paper: 0.955, night: 0.2, feel: 'Neon signs after dark' },
    { id: 'rainforest', name: 'Rainforest', primary: [0.12, 160], second: [0.13, 85], neutral: [155, 0.025], font: 'humanist', shape: 'standard', paper: 0.95, night: 0.17, feel: 'Canopy green, sunlit gold' },
  ]),
];

export const DEFAULT_THEME = 'eucalyptus';
export const themeById = (id: string | undefined) => THEMES.find((t) => t.id === id) ?? THEMES[0];

export const FONTS: Record<Font, { display: string; text: string; weight: number; css?: string }> = {
  grotesk: { display: "'Familjen Grotesk', 'Atkinson Hyperlegible', system-ui, sans-serif", text: "'Atkinson Hyperlegible', system-ui, -apple-system, 'Segoe UI', sans-serif", weight: 700 },
  geometric: { display: "'Outfit', system-ui, sans-serif", text: "'Manrope', system-ui, sans-serif", weight: 600, css: 'family=Outfit:wght@500;600;700&family=Manrope:wght@400;600;700' },
  serif: { display: "'Fraunces', Georgia, serif", text: "'Source Sans 3', system-ui, sans-serif", weight: 600, css: 'family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Source+Sans+3:ital,wght@0,400;0,700;1,400' },
  rounded: { display: "'Nunito', system-ui, sans-serif", text: "'Nunito Sans', system-ui, sans-serif", weight: 800, css: 'family=Nunito:wght@600;700;800&family=Nunito+Sans:ital,wght@0,400;0,700;1,400' },
  editorial: { display: "'Playfair Display', Georgia, serif", text: "'DM Sans', system-ui, sans-serif", weight: 700, css: 'family=Playfair+Display:wght@500;600;700&family=DM+Sans:ital,wght@0,400;0,700;1,400' },
  mono: { display: "'JetBrains Mono', ui-monospace, monospace", text: "'IBM Plex Sans', system-ui, sans-serif", weight: 700, css: 'family=JetBrains+Mono:wght@500;700&family=IBM+Plex+Sans:ital,wght@0,400;0,700;1,400' },
  humanist: { display: "'Lexend', system-ui, sans-serif", text: "'Lexend', system-ui, sans-serif", weight: 600, css: 'family=Lexend:wght@400;600;700' },
};

const SHAPES: Record<Shape, [number, number, number]> = { sharp: [6, 5, 4], soft: [12, 9, 6], standard: [18, 12, 8], round: [24, 16, 12] };

/** Every colour and shape token for a theme in one mode. Text colours are pushed until they meet WCAG contrast on every surface they sit on. */
export function buildTheme(t: ThemeSpec, mode: Mode): Record<string, string> {
  const [pc, ph] = t.primary, [sc, sh] = t.second, [nh, nc] = t.neutral;
  const v: Record<string, string> = {};
  if (mode === 'light') {
    const pL = t.paper ?? 0.955;
    v.paper = oklch(pL, nc, nh);
    v.card = oklch(0.998, nc * 0.25, nh);
    v['card-2'] = oklch(Math.min(0.98, pL + 0.02), nc * 0.7, nh);
    const surfaces = [v.paper, v.card, v['card-2']];
    v.ink = reach(0.24, Math.max(nc * 1.6, 0.012), nh, surfaces, 12, -1);
    v['ink-2'] = reach(0.42, nc * 1.4, nh, surfaces, 6.5, -1);
    v.muted = reach(0.55, nc * 1.2, nh, surfaces, 4.6, -1);
    v.line = oklch(Math.min(0.88, pL - 0.07), nc * 1.4, nh);
    v['line-2'] = oklch(Math.min(0.925, pL - 0.035), nc * 1.2, nh);
    v['euc-ink'] = '#ffffff';
    v.euc = reach(0.6, pc, ph, [...surfaces, '#ffffff'], 4.6, -1);
    v['euc-soft'] = oklch(0.935, Math.min(pc * 0.35, 0.05), ph);
    v.sage = oklch(0.75, Math.min(pc * 0.5, 0.07), ph);
    v.brass = reach(0.76, sc, sh, [v.card, v.paper], 2.6, -1);
    v['brass-soft'] = oklch(0.945, Math.min(sc * 0.35, 0.055), sh);
    v['brass-ink'] = reach(0.46, sc * 0.8, sh, [v['brass-soft'], v.card], 5, -1);
    const sem = (h: number, c: number, l: number) => reach(l, c, h, [...surfaces, oklch(0.945, 0.04, h)], 4.6, -1);
    v.good = sem(145, 0.14, 0.52); v['good-soft'] = oklch(0.945, 0.04, 145);
    v.warn = sem(70, 0.12, 0.52); v['warn-soft'] = oklch(0.955, 0.05, 85);
    v.bad = sem(27, 0.18, 0.52); v['bad-soft'] = oklch(0.945, 0.035, 25);
    v.info = sem(255, 0.1, 0.5); v['info-soft'] = oklch(0.945, 0.03, 255);
    v.shadow = `0 1px 2px ${alpha(v.ink, 0.06)}, 0 6px 20px ${alpha(v.ink, 0.05)}`;
  } else {
    const b = t.night ?? 0.19;
    v.paper = oklch(b, nc * 1.3, nh);
    v.card = oklch(b + 0.045, nc * 1.4, nh);
    v['card-2'] = oklch(b + 0.07, nc * 1.4, nh);
    const surfaces = [v.paper, v.card, v['card-2']];
    v.ink = reach(0.93, nc * 0.8, nh, surfaces, 11, 1);
    v['ink-2'] = reach(0.8, nc, nh, surfaces, 7, 1);
    v.muted = reach(0.66, nc, nh, surfaces, 4.6, 1);
    v.line = oklch(b + 0.13, nc * 1.4, nh);
    v['line-2'] = oklch(b + 0.085, nc * 1.4, nh);
    v.euc = reach(0.7, pc, ph, surfaces, 5, 1);
    v['euc-ink'] = contrast(v.euc, v.paper) >= 4.6 ? v.paper : '#000000';
    v['euc-soft'] = oklch(b + 0.1, Math.min(pc * 0.35, 0.05), ph);
    v.sage = oklch(Math.max(0.42, b + 0.25), Math.min(pc * 0.4, 0.06), ph);
    v.brass = reach(0.78, sc, sh, [v.card, v['card-2']], 3.2, 1);
    v['brass-soft'] = oklch(b + 0.08, Math.min(sc * 0.35, 0.05), sh);
    v['brass-ink'] = reach(0.85, sc * 0.7, sh, [v['brass-soft'], v.card], 6.5, 1);
    const sem = (h: number, c: number, l: number) => reach(l, c, h, [...surfaces, oklch(b + 0.08, 0.04, h)], 4.8, 1);
    v.good = sem(145, 0.14, 0.75); v['good-soft'] = oklch(b + 0.08, 0.04, 145);
    v.warn = sem(75, 0.12, 0.8); v['warn-soft'] = oklch(b + 0.08, 0.04, 80);
    v.bad = sem(25, 0.15, 0.72); v['bad-soft'] = oklch(b + 0.08, 0.04, 25);
    v.info = sem(255, 0.09, 0.78); v['info-soft'] = oklch(b + 0.08, 0.035, 255);
    v.shadow = '0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.25)';
  }
  const [lg, md, sm] = SHAPES[t.shape];
  v['r-lg'] = `${lg}px`; v['r-md'] = `${md}px`; v['r-sm'] = `${sm}px`;
  const f = FONTS[t.font];
  v.font = f.text; v.display = f.display; v['display-weight'] = String(f.weight);
  return v;
}

const cache = new Map<string, Record<string, string>>();
export function themeVars(id: string, mode: Mode) {
  const key = `${id}|${mode}`;
  if (!cache.has(key)) cache.set(key, buildTheme(themeById(id), mode));
  return cache.get(key)!;
}

const NAMES = Object.keys(buildTheme(THEMES[0], 'light'));
const loaded = new Set<string>();

/** Fetch a font pairing from Google Fonts the first time it's needed. */
export function loadFont(font: Font) {
  const f = FONTS[font];
  if (!f.css || loaded.has(font)) return;
  loaded.add(font);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${f.css}&display=swap`;
  document.head.appendChild(link);
}

/** Put a theme on the page: colours, shapes and fonts. Eucalyptus in its original form uses the hand-tuned colours in app.css. */
export function applyTheme(id: string, mode: Mode) {
  const root = document.documentElement;
  root.setAttribute('data-theme', mode);
  const t = themeById(id);
  for (const n of NAMES) root.style.removeProperty(`--${n}`);
  if (t.id !== DEFAULT_THEME) for (const [k, val] of Object.entries(themeVars(t.id, mode))) root.style.setProperty(`--${k}`, val);
  loadFont(t.font);
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', t.id === DEFAULT_THEME ? (mode === 'dark' ? '#0f1714' : '#2f5d50') : themeVars(t.id, mode)[mode === 'dark' ? 'paper' : 'euc']);
}
