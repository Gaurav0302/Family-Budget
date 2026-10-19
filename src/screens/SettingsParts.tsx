import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Info } from '../components/bits';
import { addMonths, allMonths, budgetFor, lastDay } from '../data/analysis';
import { billList } from '../data/billList';
import { calendarFile, DAY_NAMES, NTH_NAMES, nthWeekday, type CalendarChoice } from '../data/calendar';
import { CATEGORY, label, SPEND_CATEGORIES, KEEP_CATEGORIES } from '../data/categories';
import { freqOf, perTime, EVERY_WORDS } from '../data/frequency';
import { useStore } from '../data/store';
import { netWorth, netWorthSeries } from '../data/wealth';
import { toCsv } from '../lib/csv';
import { download, longDate, thisMonth, today } from '../lib/format';
import type { Settings } from '../data/types';

type When = NonNullable<Settings['meetingWhen']>;

/** Reminders as a calendar file: statements on the 1st, the money meeting, bills and big costs. */
export function Reminders() {
  const { data, updateSettings } = useStore();
  const w: When = data.settings.meetingWhen ?? { nth: 1, day: 'SU', time: '19:30' };
  const [pick, setPick] = useState<CalendarChoice>({ statements: true, meeting: true, bills: true, big: true });
  const setWhen = (patch: Partial<When>) => updateSettings({ meetingWhen: { ...w, ...patch } });
  const next = nthWeekday(addMonths(thisMonth(), 1), w.nth, w.day);
  const make = () => {
    const t = today();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Melbourne';
    const file = calendarFile({ ...data, settings: { ...data.settings, meetingWhen: w } }, billList(data, t), t, pick, location.href.split('#')[0], tz);
    if (pick.meeting && !data.settings.meetingWhen) updateSettings({ meetingWhen: w });
    download('family-purse-reminders.ics', file, 'text/calendar');
  };
  const box = (k: keyof CalendarChoice, text: string) => (
    <label className="check"><input type="checkbox" checked={pick[k]} onChange={(e) => setPick({ ...pick, [k]: e.target.checked })} /><span>{text}</span></label>
  );
  return (
    <section className="panel reminders" aria-labelledby="rem-h">
      <div className="panel-head">
        <h2 id="rem-h">Reminders</h2>
        <Info>The app can't send notifications, so reminders go into your phone's calendar instead. Download the file and open it. iPhone: tap the file, then Add All. Android or Google Calendar: on a computer, calendar.google.com → Settings → Import. Download it again after bills change: the same events are updated, not doubled.</Info>
      </div>
      <div className="meet-when">
        <span>We hold the money meeting on the</span>
        <select aria-label="Which week" value={w.nth} onChange={(e) => setWhen({ nth: Number(e.target.value) })}>{[1, 2, 3, 4, -1].map((n) => <option key={n} value={n}>{NTH_NAMES[n]}</option>)}</select>
        <select aria-label="Which day" value={w.day} onChange={(e) => setWhen({ day: e.target.value as When['day'] })}>{(Object.keys(DAY_NAMES) as When['day'][]).map((d) => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}</select>
        <span>of the month at</span>
        <input type="time" aria-label="Time" value={w.time} onChange={(e) => e.target.value && setWhen({ time: e.target.value })} />
      </div>
      <p className="fine">Next one: {longDate(next)}.</p>
      <div className="check-col">
        {box('statements', "Add last month's statements, on the 1st")}
        {box('meeting', 'The money meeting')}
        {box('bills', 'Each regular bill, the day before')}
        {box('big', 'Big costs (terms, rego, insurance), a week before')}
      </div>
      <button className="btn primary" disabled={!Object.values(pick).some(Boolean)} onClick={make}>Download calendar file</button>
    </section>
  );
}

/** Everything as spreadsheets: budget, bills, net worth. (Transactions download from their own page, the tax pack from the financial year.) */
export function Exports() {
  const { data } = useStore();
  const t = today();
  const month = thisMonth();
  const budget = () => {
    const cats = [...SPEND_CATEGORIES, ...KEEP_CATEGORIES].filter((c) => budgetFor(data.budgets, c.id, month) > 0);
    const rows = cats.map((c) => {
      const f = freqOf(data.settings, c.id);
      const monthly = budgetFor(data.budgets, c.id, month);
      return [CATEGORY[c.id]?.group ?? '', c.label, monthly, EVERY_WORDS[f.every], perTime(monthly, f.every), f.due ?? ''];
    });
    download(`budget-${month}.csv`, toCsv(['Area', 'Category', 'Monthly', 'How often', 'Each time', 'Due month'], rows), 'text/csv');
  };
  const bills = () => {
    const rows = billList(data, t).map((b) => [b.name, label(b.category), EVERY_WORDS[b.every], b.amount, b.varies ? 'yes' : '', b.next, Math.round(b.yearly), b.stopsAfter ?? '']);
    download(`bills-${t}.csv`, toCsv(['Bill', 'Category', 'How often', 'Amount', 'Varies', 'Next', 'Next 12 months', 'Last month paid'], rows), 'text/csv');
  };
  const worth = () => {
    const months = allMonths(data.transactions);
    const series = netWorthSeries(data.settings, months.length ? months : [month]);
    const rows = series.map((x) => { const n = netWorth(data.settings, lastDay(x.month)); return [x.month, Math.round(n.cash), Math.round(n.super), Math.round(n.assets), Math.round(n.debts), Math.round(n.total)]; });
    download(`net-worth-${t}.csv`, toCsv(['Month', 'Cash', 'Super', 'Other assets', 'Owed', 'Net worth'], rows), 'text/csv');
  };
  return (
    <div className="btn-row">
      <Link className="btn" to="/transactions">Transactions (CSV)</Link>
      <button className="btn" onClick={budget}>Budget (CSV)</button>
      <button className="btn" onClick={bills}>Bills (CSV)</button>
      <button className="btn" onClick={worth}>Net worth by month (CSV)</button>
    </div>
  );
}

/** Who changed what lately: the other person's edits are easy to see. */
export function RecentChanges() {
  const { activity, email } = useStore();
  const [all, setAll] = useState(false);
  if (!activity.length) return null;
  const when = (iso: string) => {
    const d = new Date(iso);
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const day = today() === local ? 'Today' : d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
    return `${day}, ${d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}`;
  };
  const who = (by: string | null) => (!by ? 'Someone' : by === email ? 'You' : by.split('@')[0]);
  return (
    <section className="panel" aria-labelledby="changes-h">
      <div className="panel-head"><h2 id="changes-h">Recent changes</h2><Info>Everyone signed in to this household sees the same list. The same change made several times within ten minutes shows once.</Info></div>
      <ul className="value-list changes">
        {activity.slice(0, all ? 100 : 8).map((a, i) => <li key={`${a.at}${i}`}><span><b>{who(a.by)}</b> {a.what.charAt(0).toLowerCase() + a.what.slice(1)}</span><small>{when(a.at)}</small></li>)}
      </ul>
      {activity.length > 8 && <button className="link" onClick={() => setAll(!all)}>{all ? 'Show fewer' : 'Show more'}</button>}
    </section>
  );
}
