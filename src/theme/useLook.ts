import { useEffect, useState } from 'react';
import { useStore } from '../data/store';
import { applyTheme, DEFAULT_THEME, type Mode } from './themes';

export interface Look { theme: string; mode: 'auto' | 'light' | 'dark' }
const KEY = 'fb:look';

/** The look saved on this device, so the right colours show before anything has loaded. */
export function cachedLook(): Look | null {
  try { const v = localStorage.getItem(KEY); return v ? (JSON.parse(v) as Look) : null; } catch { return null; }
}
function cache(l: Look) { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* private window: fine */ } }

const systemDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
export const resolveMode = (m: Look['mode'], dark = systemDark()): Mode => (m === 'auto' ? (dark ? 'dark' : 'light') : m);

/** Apply before React starts (main.tsx). */
export function applyCachedLook() {
  const l = cachedLook() ?? { theme: DEFAULT_THEME, mode: 'auto' };
  applyTheme(l.theme, resolveMode(l.mode));
}

/** Each person has their own look; it follows them to any device they sign in on. */
export function useLook() {
  const { data, email, updateSettings } = useStore();
  const who = (email ?? 'demo').toLowerCase();
  const s = data.settings;
  const cached = cachedLook();
  const look: Look = s.looks?.[who] ?? { theme: cached?.theme ?? DEFAULT_THEME, mode: cached?.mode ?? s.theme ?? 'auto' };
  const [dark, setDark] = useState(systemDark());
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const mode = resolveMode(look.mode, dark);
  useEffect(() => { applyTheme(look.theme, mode); cache(look); }, [look.theme, look.mode, mode]);
  const setLook = (patch: Partial<Look>) => updateSettings({ looks: { ...(s.looks ?? {}), [who]: { ...look, ...patch } } });
  return { look, mode, setLook };
}
