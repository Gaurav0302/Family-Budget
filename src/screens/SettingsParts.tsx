import { useEffect, useState } from 'react';
import * as hh from '../data/adapters/households';
import type { Invite, Member } from '../data/adapters/households';
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

/** The household's people: who's in, invitations waiting, and (for the owner) inviting and removing. */
export function People() {
  const { household, email } = useStore();
  const [list, setList] = useState<Member[] | null>(null);
  const [waiting, setWaiting] = useState<Invite[]>([]);
  const [to, setTo] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => { setCopied(true); setMsg('Link copied.'); setTimeout(() => setCopied(false), 2000); }, () => setMsg('Copy didn\'t work here: select the link and copy it.'));
  const owner = household?.role === 'owner';
  const refresh = async () => {
    if (!household) return;
    try { setList(await hh.members(household.id)); setWaiting(await hh.invites(household.id)); }
    catch (e: any) { setMsg(`Couldn't load the household's people (${e?.message ?? e}).`); }
  };
  useEffect(() => { refresh(); }, [household?.id]);
  if (!household) return null;
  const act = async (fn: () => Promise<unknown>, done: string) => {
    setMsg(null);
    try { await fn(); setMsg(done); await refresh(); } catch (e: any) { setMsg(e?.message ?? String(e)); }
  };
  const self = list?.find((m) => m.email?.toLowerCase() === email?.toLowerCase());
  return (
    <section className="panel" aria-labelledby="people-h">
      <div className="panel-head"><h2 id="people-h">People in {household.name}</h2><Info>Everyone here sees and changes the same budget, payments and plans. The owner can invite and remove people. An invitation is a private link: send it to the person (a text or an email); whoever opens it and signs in can join, once, within 14 days. Cancel a link you no longer need.</Info></div>
      {list === null ? <p className="muted">Loading…</p> : (
        <ul className="value-list people">
          {list.map((m) => (
            <li key={m.userId}>
              <span><b>{m.email ?? 'Someone'}</b>{m.email?.toLowerCase() === email?.toLowerCase() ? ' (you)' : ''}<small>{m.role === 'owner' ? 'Owner' : 'Member'}, joined {longDate(m.added.slice(0, 10))}</small></span>
              {owner && m.userId !== self?.userId && <button className="btn small" onClick={() => { if (confirm(`Remove ${m.email} from ${household.name}? They won't see its data any more.`)) act(() => hh.removeMember(m.userId), `${m.email} removed.`); }}>Remove</button>}
            </li>
          ))}
          {waiting.map((i) => (
            <li key={i.code}>
              <span><b>{i.email || 'Invitation link'}</b><small>Not joined yet. The link works until {longDate(i.expires.slice(0, 10))}</small></span>
              <span className="btn-row">
                <button className="btn small" onClick={() => copy(hh.inviteLink(i.code))}>Copy link</button>
                {owner && <button className="btn small" onClick={() => act(() => hh.cancelInvite(i.code), 'Invitation cancelled: its link no longer works.')}>Cancel</button>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {owner && (
        <form className="invite-form" onSubmit={async (e) => {
          e.preventDefault();
          setMsg(null);
          try {
            const code = await hh.invite(household.id, to);
            setLink(hh.inviteLink(code)); setTo(''); await refresh();
          } catch (err: any) { setMsg(err?.message ?? String(err)); }
        }}>
          <label>Who it's for (optional)<input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="partner@example.com" /></label>
          <button className="btn small primary">Make an invitation link</button>
        </form>
      )}
      {link && (
        <div className="invite-link" role="status">
          <p>Send this link to them (a text or an email). It works once, for 14 days:</p>
          <input readOnly value={link} aria-label="Invitation link" onFocus={(e) => e.target.select()} />
          <button className="btn small" onClick={() => copy(link)}>{copied ? 'Copied' : 'Copy link'}</button>
        </div>
      )}
      {msg && <p className="fine" role="status">{msg}</p>}
    </section>
  );
}

/** Leaving, or (the owner) deleting the household and everything in it. */
export function LeaveOrDelete() {
  const { household, enterHousehold } = useStore();
  const [typed, setTyped] = useState('');
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!household) return null;
  const owner = household.role === 'owner';
  const run = async (fn: () => Promise<void>) => { setMsg(null); try { await fn(); await enterHousehold(); } catch (e: any) { setMsg(e?.message ?? String(e)); } };
  return (
    <div className="danger-zone">
      {!open ? <button className="link danger" onClick={() => setOpen(true)}>{owner ? 'Leave or delete this household' : 'Leave this household'}</button> : (
        <>
          <p><b>Leave {household.name}:</b> you stop seeing its data; everyone else keeps it.{owner ? ' The longest-standing member becomes the owner. If you are the only one, the household and its data are deleted.' : ''}</p>
          <button className="btn small" onClick={() => { if (confirm(`Leave ${household.name}?`)) run(hh.leaveHousehold); }}>Leave the household</button>
          {owner && <>
            <p><b>Delete {household.name}:</b> every payment, budget, plan and setting, for everyone in it. This can't be undone, so download all your data first. Type the household's name to confirm.</p>
            <input aria-label="Type the household's name to confirm" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={household.name} />
            <button className="btn small danger" disabled={typed.trim() !== household.name} onClick={() => run(hh.deleteHousehold)}>Delete everything</button>
          </>}
          <button className="link" onClick={() => { setOpen(false); setTyped(''); }}>Cancel</button>
        </>
      )}
      {msg && <p className="form-error" role="alert">{msg}</p>}
    </div>
  );
}
