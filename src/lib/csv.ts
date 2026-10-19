/** A table as a CSV file a spreadsheet opens: numbers to the cent, text in quotes. Text that a spreadsheet would run as a
 *  formula (starting with = + - @, a tab or a return; anyone sending money can write a payment's description) gets a
 *  leading apostrophe, so it shows as text. */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const q = (v: string | number | null | undefined) => {
    if (v == null) return '';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return [header.map(q).join(','), ...rows.map((r) => r.map(q).join(','))].join('\r\n') + '\r\n';
}
