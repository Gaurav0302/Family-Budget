import { addMonths, lastDay } from './analysis';
import type { ListedBill } from './billList';
import { pots } from './setAside';
import type { Data, Every, Settings } from './types';

/** Reminders as a calendar file (.ics) that phone and computer calendars can open: statements on the 1st, the money meeting,
 *  every regular bill (a day before), and big costs that are due. Re-adding the file updates the same events rather than
 *  doubling them (each has a fixed id). */

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const d8 = (date: string) => date.replace(/-/g, '');
const dayAfter = (date: string) => { const x = new Date(date + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
/** Lines over 75 characters are folded, as the calendar format asks. */
const fold = (line: string) => {
  const out = [line.slice(0, 75)];
  for (let s = line.slice(75); s.length; s = s.slice(74)) out.push(' ' + s.slice(0, 74));
  return out.join('\r\n');
};
const money = (n: number) => `$${Math.round(n).toLocaleString('en-AU')}`;

const RRULE: Record<Every, string> = {
  week: 'FREQ=WEEKLY', fortnight: 'FREQ=WEEKLY;INTERVAL=2', month: 'FREQ=MONTHLY', term: 'FREQ=MONTHLY;INTERVAL=3', quarter: 'FREQ=MONTHLY;INTERVAL=3', year: 'FREQ=YEARLY',
};
export const DAY_NAMES: Record<NonNullable<Settings['meetingWhen']>['day'], string> = { MO: 'Monday', TU: 'Tuesday', WE: 'Wednesday', TH: 'Thursday', FR: 'Friday', SA: 'Saturday', SU: 'Sunday' };
export const NTH_NAMES: Record<number, string> = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', [-1]: 'last' };

interface Ev { uid: string; summary: string; start: string; allDay?: boolean; time?: string; minutes?: number; rrule?: string; until?: string; alarm?: string; description?: string }

function event(e: Ev, stamp: string, tz: string): string {
  const lines = ['BEGIN:VEVENT', `UID:${e.uid}@family-purse`, `DTSTAMP:${stamp}`, `SUMMARY:${esc(e.summary)}`];
  if (e.allDay || !e.time) lines.push(`DTSTART;VALUE=DATE:${d8(e.start)}`, `DTEND;VALUE=DATE:${d8(dayAfter(e.start))}`);
  else {
    const t = e.time.replace(':', '') + '00';
    const endMin = Number(e.time.slice(0, 2)) * 60 + Number(e.time.slice(3, 5)) + (e.minutes ?? 60);
    const end = `${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}${String(endMin % 60).padStart(2, '0')}00`;
    lines.push(`DTSTART;TZID=${tz}:${d8(e.start)}T${t}`, `DTEND;TZID=${tz}:${d8(e.start)}T${end}`);
  }
  if (e.rrule) lines.push(`RRULE:${e.rrule}${e.until ? `;UNTIL=${d8(e.until)}` : ''}`);
  if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
  if (e.alarm) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.summary)}`, `TRIGGER:${e.alarm}`, 'END:VALARM');
  lines.push('END:VEVENT');
  return lines.map(fold).join('\r\n');
}

export interface CalendarChoice { statements: boolean; meeting: boolean; bills: boolean; big: boolean }

export function calendarFile(data: Pick<Data, 'budgets' | 'settings' | 'transactions'>, bills: ListedBill[], today: string, pick: CalendarChoice, appUrl = '', tz = 'Australia/Melbourne'): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const month = today.slice(0, 7);
  const evs: Ev[] = [];
  const link = appUrl ? `\n${appUrl}` : '';
  if (pick.statements) evs.push({
    uid: 'statements', summary: 'Family Purse: add last month\'s statements', start: `${addMonths(month, 1)}-01`, allDay: true, rrule: 'FREQ=MONTHLY;BYMONTHDAY=1', alarm: 'PT9H',
    description: `Download last month's statements for every account and add them on Statements → Add statements.${link}`,
  });
  const w = data.settings.meetingWhen;
  if (pick.meeting && w) {
    // The first such day from next month on (the rule then repeats it every month).
    const first = nthWeekday(addMonths(month, 1), w.nth, w.day);
    evs.push({
      uid: 'meeting', summary: 'Money meeting', start: first, time: w.time, minutes: 45, rrule: `FREQ=MONTHLY;BYDAY=${w.nth}${w.day}`, alarm: '-PT30M',
      description: `Open Family Purse → Monthly check-in and go through the steps together.${link}`,
    });
  }
  if (pick.bills) for (const b of bills) {
    if (b.next < today) continue;
    const amount = b.varies ? `about ${money(b.amount)}` : money(b.amount);
    evs.push({
      uid: `bill-${b.key.replace(/[^\w-]/g, '_')}`, summary: `${b.name}: ${amount}`, start: b.next, allDay: true,
      // A monthly bill on the 29th–31st: calendars skip months without that day, so use the month's last day instead.
      rrule: b.every === 'month' && Number(b.next.slice(8, 10)) >= 29 ? 'FREQ=MONTHLY;BYMONTHDAY=-1' : RRULE[b.every],
      until: b.stopsAfter ? lastDay(b.stopsAfter) : undefined, alarm: '-PT15H',   // 9am the day before
    });
  }
  if (pick.big) for (const p of pots(data, month).pots) evs.push({
    uid: `due-${p.cat}`, summary: `${p.label} due: about ${money(p.per)}`, start: `${p.due}-01`, allDay: true, alarm: '-P6DT15H',   // 9am a week before
    description: `Put aside ${money(p.monthly)} a month for it on the Budget.${link}`,
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Family Purse//Reminders//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Family Purse',
    ...evs.map((e) => event(e, stamp, tz)), 'END:VCALENDAR'].join('\r\n') + '\r\n';
}

/** The nth weekday of a month (nth -1 = the last one), as YYYY-MM-DD. */
export function nthWeekday(month: string, nth: number, day: keyof typeof DAY_NAMES): string {
  const want = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].indexOf(day);
  const [y, m] = month.split('-').map(Number);
  if (nth > 0) {
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const d = 1 + ((want - first + 7) % 7) + (nth - 1) * 7;
    return `${month}-${String(d).padStart(2, '0')}`;
  }
  const lastD = new Date(Date.UTC(y, m, 0));
  const d = lastD.getUTCDate() - ((lastD.getUTCDay() - want + 7) % 7);
  return `${month}-${String(d).padStart(2, '0')}`;
}
