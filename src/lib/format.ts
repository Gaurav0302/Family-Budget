export const money = (n: number, opts: { cents?: boolean; sign?: boolean } = {}) => {
  const v = Math.abs(n);
  const s = v.toLocaleString('en-AU', { minimumFractionDigits: opts.cents ? 2 : 0, maximumFractionDigits: opts.cents ? 2 : 0 });
  const sign = n < 0 ? '−' : opts.sign && n > 0 ? '+' : '';
  return `${sign}$${s}`;
};

export const pct = (n: number) => `${Math.round(n * 100)}%`;

export const monthName = (m: string, style: 'long' | 'short' = 'long') =>
  new Date(m + '-01T00:00:00').toLocaleDateString('en-AU', { month: style, year: 'numeric' });

export const monthOnly = (m: string) => new Date(m + '-01T00:00:00').toLocaleDateString('en-AU', { month: 'long' });

export const dayName = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });

export const longDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

/** Today's date on this device (local time, YYYY-MM-DD). Never use toISOString() for "today": in Australia that's UTC,
 *  which is still yesterday until 10–11am. In development, an "fb:today" month override moves today into that month. */
export const today = () => {
  const d = new Date();
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const m = thisMonth();
  return local.startsWith(m) ? local : `${m}-15`;
};

export const thisMonth = () => {
  // While developing, localStorage "fb:today" = "2027-06" pretends it's that month (to try check-ins before the loan starts).
  if (import.meta.env?.DEV) { try { const t = localStorage.getItem('fb:today'); if (t) return t; } catch { /* no storage */ } }
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export function download(name: string, text: string, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
