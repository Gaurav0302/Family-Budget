import { Check } from 'lucide-react';
import { useEffect } from 'react';
import { FONTS, loadFont, THEMES, themeById, themeVars } from './themes';
import { useLook } from './useLook';

const FAMILIES = [...new Set(THEMES.map((t) => t.family))];

/** Light / dark choice and a gallery of themes, each drawn in its own colours and fonts. */
export function ThemePicker() {
  const { look, mode, setLook } = useLook();
  useEffect(() => { for (const f of Object.keys(FONTS)) loadFont(f as keyof typeof FONTS); }, []);
  const current = themeById(look.theme);
  return (
    <div className="theme-picker">
      <div className="seg" role="radiogroup" aria-label="Light or dark">
        {(['auto', 'light', 'dark'] as const).map((m) => (
          <button key={m} role="radio" aria-checked={look.mode === m} className={look.mode === m ? 'on' : ''} onClick={() => setLook({ mode: m })}>
            {m === 'auto' ? 'Match my device' : m === 'light' ? 'Light' : 'Dark'}
          </button>
        ))}
      </div>
      <p className="muted theme-now">Now: <b>{current.name}</b>, {mode}. {current.feel}.</p>
      {FAMILIES.map((fam) => (
        <section key={fam} className="theme-family" aria-label={fam}>
          <h3>{fam}</h3>
          <div className="theme-grid" role="radiogroup" aria-label={`${fam} themes`}>
            {THEMES.filter((t) => t.family === fam).map((t) => {
              const v = themeVars(t.id, mode);
              const on = t.id === current.id;
              return (
                <button key={t.id} type="button" role="radio" aria-checked={on} className={`swatch ${on ? 'on' : ''}`} onClick={() => setLook({ theme: t.id })} title={t.feel}>
                  <span className="sw-paper" style={{ background: v.paper, borderRadius: v['r-md'] }}>
                    <span className="sw-card" style={{ background: v.card, borderRadius: v['r-sm'], boxShadow: v.shadow }}>
                      <span className="sw-aa" style={{ color: v.ink, fontFamily: v.display, fontWeight: Number(v['display-weight']) }}>Aa</span>
                      <span className="sw-btn" style={{ background: v.euc, color: v['euc-ink'], borderRadius: v['r-sm'], fontFamily: v.font }}>$</span>
                      <span className="sw-bar" style={{ background: v['line-2'] }}><i style={{ background: v.brass, width: '62%' }} /></span>
                      <span className="sw-text" style={{ background: v.muted }} />
                    </span>
                    {on && <span className="sw-check" style={{ background: v.euc, color: v['euc-ink'] }}><Check size={13} strokeWidth={3} /></span>}
                  </span>
                  <span className="sw-name">{t.name}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
