import { describe, expect, it } from 'vitest';
import { contrast } from './color';
import { buildTheme, THEMES } from './themes';

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

describe('meaning never depends on the theme', () => {
  it('keeps good green, warning amber and bad red in every theme, and never touches data colours', () => {
    for (const t of THEMES) for (const mode of ['light', 'dark'] as const) {
      const v = buildTheme(t, mode);
      const [gr, gg, gb] = rgb(v.good), [br, bg, bb] = rgb(v.bad), [wr, wg, wb] = rgb(v.warn);
      expect(gg > gr && gg > gb, `${t.id} ${mode} good ${v.good}`).toBe(true);
      expect(br > bg && br > bb, `${t.id} ${mode} bad ${v.bad}`).toBe(true);
      expect(wr > wb && wg > wb && wr >= wg, `${t.id} ${mode} warn ${v.warn}`).toBe(true);
      expect(Object.keys(v).some((k) => /^(data|s\d|k-|p\d|pj)/.test(k))).toBe(false);
    }
  });
});

describe('every theme is readable in light and dark', () => {
  it('has 54 themes with unique ids', () => {
    expect(THEMES).toHaveLength(54);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(54);
  });
  for (const t of THEMES) for (const mode of ['light', 'dark'] as const) {
    it(`${t.name} (${mode})`, () => {
      const v = buildTheme(t, mode);
      const surfaces = [v.paper, v.card, v['card-2']];
      const fails: string[] = [];
      const need = (fg: string, bgs: string[], ratio: number) => { for (const bg of bgs) { const c = contrast(v[fg] ?? fg, v[bg] ?? bg); if (c < ratio) fails.push(`${fg} on ${bg}: ${c.toFixed(2)} < ${ratio}`); } };
      need('ink', ['paper', 'card', 'card-2'], 7);
      need('ink-2', ['paper', 'card', 'card-2'], 4.5);
      need('muted', ['paper', 'card', 'card-2'], 4.5);
      need('euc', ['paper', 'card'], 4.5);          // links and ghost buttons
      need('euc-ink', ['euc'], 4.5);                // text on the main button
      need('brass-ink', ['brass-soft'], 4.5);
      need('brass', ['card'], 2.5);                 // meter fills, focus ring, budget line
      for (const s of ['good', 'warn', 'bad', 'info']) need(s, ['card', `${s}-soft`], 4.5);
      expect(fails, fails.join('; ')).toEqual([]);
      expect(contrast(v.line, v.card)).toBeGreaterThan(1.15);
      void surfaces;
    });
  }
});
