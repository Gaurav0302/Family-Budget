import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight, Trash2, X } from 'lucide-react';
import { Info, NumberField, PageHeader, Tabs } from '../components/bits';
import { LineChart } from '../components/LineChart';
import { addMonths } from '../data/analysis';
import { useStore } from '../data/store';
import type { Every, PayEntry, WealthItem } from '../data/types';
import {
  expectedIncome, financialYear, grossMonthly, latestSuper, netWorth, ownedSinceOf, PER_MONTH, payChanges, payFor, people, superMonthly, superRoom,
} from '../data/wealth';
import { longDate, money, thisMonth } from '../lib/format';

const today = () => new Date().toLocaleDateString('en-CA');   // local date, YYYY-MM-DD
const KIND_LABEL: Record<WealthItem['kind'], string> = { home: 'Home', shares: 'Shares', crypto: 'Crypto', other: 'Other asset', loan: 'Home loan', debt: 'Other debt' };
const EVERY_LABEL: Record<Every, string> = { week: 'week', fortnight: 'fortnight', month: 'month', quarter: 'quarter', year: 'year' };

const isDebt = (w: WealthItem) => w.kind === 'loan' || w.kind === 'debt';
const monthEnd = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0')}`;
};

/** Everything about one thing you own or owe: when it started counting, its values over time, and deleting it. */
function ItemSheet({ item, onClose }: { item: WealthItem; onClose: () => void }) {
  const { data, updateSettings } = useStore();
  const s = data.settings;
  const w = (s.wealth ?? []).find((x) => x.id === item.id) ?? item;
  const set = (patch: Partial<WealthItem>) => updateSettings({ wealth: (s.wealth ?? []).map((x) => (x.id === w.id ? { ...x, ...patch } : x)) });
  const values = [...w.values].sort((a, b) => b.date.localeCompare(a.date));
  const before = ownedSinceOf(w) === '0000-01-01';
  const [date, setDate] = useState(today());
  const [amt, setAmt] = useState('');
  const [sure, setSure] = useState(false);
  const owners = [...new Set([...people(s), 'Joint'])];

  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-labelledby="item-title" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 id="item-title">{w.name}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <div className="fund-fields">
          <label>Name<input defaultValue={w.name} onBlur={(e) => e.target.value.trim() && e.target.value !== w.name && set({ name: e.target.value.trim() })} /></label>
          <label>Type<select value={w.kind} onChange={(e) => set({ kind: e.target.value as WealthItem['kind'] })}>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label>Whose<select value={w.owner ?? ''} onChange={(e) => set({ owner: e.target.value || undefined })}><option value="">Not set</option>{owners.map((o) => <option key={o}>{o}</option>)}</select></label>
        </div>

        <h3 className="sub">{isDebt(w) ? 'Owed since' : 'Owned since'} <Info>Before this date it counts as nothing in net worth. Tick “before our records” for things you've had a long time, like a house overseas or old shares: their value then counts in every month, so adding them doesn't look like a sudden jump.</Info></h3>
        <label className="check small"><input type="checkbox" checked={before} onChange={(e) => set({ ownedSince: e.target.checked ? '0000-01-01' : (values[values.length - 1]?.date ?? today()) })} />
          <span>Before our records start</span></label>
        {!before && <label className="inline">Date <input type="date" value={ownedSinceOf(w)} onChange={(e) => e.target.value && set({ ownedSince: e.target.value })} /></label>}
        <label className="inline">{isDebt(w) ? 'Paid off on' : 'Sold on'} <input type="date" value={w.endedOn ?? ''} onChange={(e) => set({ endedOn: e.target.value || undefined })} /></label>

        <h3 className="sub">{isDebt(w) ? 'Balance' : 'Value'} over time</h3>
        <ul className="value-list">
          {values.map((v, i) => (
            <li key={v.date + i}>
              <input type="date" aria-label="As at" value={v.date} onChange={(e) => e.target.value && set({ values: w.values.map((x) => (x === v ? { ...x, date: e.target.value } : x)) })} />
              <span className="row-gap">
                <NumberField label={`Value on ${v.date}`} value={v.amount} onSave={(n) => set({ values: w.values.map((x) => (x === v ? { ...x, amount: n } : x)) })} />
                {values.length > 1 && <button className="icon-btn" aria-label={`Delete the value on ${longDate(v.date)}`} onClick={() => set({ values: w.values.filter((x) => x !== v) })}><Trash2 size={15} /></button>}
              </span>
            </li>
          ))}
        </ul>
        <form className="inline-form" onSubmit={(e) => {
          e.preventDefault();
          if (!amt) return;
          set({ values: [...w.values.filter((v) => v.date !== date), { date, amount: Number(amt) }] });
          setAmt('');
        }}>
          <span className="money-input"><span aria-hidden>$</span><input inputMode="decimal" placeholder="New value" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d.]/g, ''))} aria-label="New value" /></span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="As at" />
          <button className="btn small">Add value</button>
        </form>

        <div className="sheet-actions">
          {sure ? <>
            <span className="muted">Remove {w.name} and its history?</span>
            <button className="btn small" onClick={() => setSure(false)}>Keep</button>
            <button className="btn small danger" onClick={() => { updateSettings({ wealth: (s.wealth ?? []).filter((x) => x.id !== w.id) }); onClose(); }}>Delete</button>
          </> : <button className="btn small danger" onClick={() => setSure(true)}><Trash2 size={15} /> Delete</button>}
          <button className="btn small primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

function NetWorthTab() {
  const { data, updateSettings } = useStore();
  const s = data.settings;
  const nw = netWorth(s, '9999-12-31');
  const nowNw = netWorth(s, today());
  const [range, setRange] = useState<'1y' | '3y' | 'all'>('all');
  const [open, setOpen] = useState<WealthItem | null>(null);

  // From the first month every bank account's balance is known (before that the total would be missing some cash) up to now.
  const all = useMemo(() => {
    const firsts = s.accounts.filter((a) => a.type !== 'loan').map((a) => s.balances.filter((b) => b.account === a.key).map((b) => b.date).sort()[0]).filter(Boolean) as string[];
    const firstCash = firsts.sort().at(-1);
    if (!firstCash) return [];
    const out: { month: string; value: number; parts: { label: string; amount: number }[] }[] = [];
    const now = thisMonth();
    for (let m = firstCash.slice(0, 7); m <= now; m = addMonths(m, 1)) {
      const n = netWorth(s, m === now ? today() : monthEnd(m));
      out.push({ month: m, value: n.total, parts: [{ label: 'Cash', amount: n.cash }, { label: 'Super', amount: n.super }, { label: 'Assets', amount: n.assets }, { label: 'Owed', amount: -n.debts }] });
    }
    return out;
  }, [s]);
  const series = range === '1y' ? all.slice(-12) : range === '3y' ? all.slice(-36) : all;
  const change = series.length > 1 ? series[series.length - 1].value - series[0].value : 0;

  const [name, setName] = useState('');
  const [kind, setKind] = useState<WealthItem['kind']>('shares');
  const [amount, setAmount] = useState('');
  const [longHeld, setLongHeld] = useState(true);
  const future = nw.total !== nowNw.total;

  const row = (w: WealthItem) => {
    const v = [...w.values].sort((a, b) => b.date.localeCompare(a.date))[0];
    const since = ownedSinceOf(w);
    const note = since > today() ? `${KIND_LABEL[w.kind]}, from ${longDate(since)}`
      : [KIND_LABEL[w.kind], v && `as at ${longDate(v.date)}`, w.endedOn ? `ended ${longDate(w.endedOn)}` : since !== '0000-01-01' ? `since ${longDate(since)}` : ''].filter(Boolean).join(', ');
    return (
      <li key={w.id}>
        <button className="row-btn" onClick={() => setOpen(w)}>
          <span><b>{w.name}</b><small>{note}</small></span>
          <span className="num">{money(v?.amount ?? 0)}<ChevronRight size={16} aria-hidden /></span>
        </button>
      </li>
    );
  };

  return (
    <>
      <section className="hero-small">
        <p className="kicker">Net worth today</p>
        <p className="big-num">{money(nowNw.total)}</p>
        <p className="muted">Owned {money(nowNw.cash + nowNw.super + nowNw.assets)}, owed {money(nowNw.debts)}.
          {future && <> From settlement it becomes {money(nw.total)} once the house and loan count. <Info>The house and loan are dated from settlement. After settlement, update your bank balances: the deposit and stamp duty will have left your savings.</Info></>}</p>
      </section>
      {all.length > 1 && (
        <section className="panel">
          <div className="panel-head">
            <h2>Over time <small className={change >= 0 ? 'good' : 'bad'}>{change >= 0 ? '+' : ''}{money(change)}</small></h2>
            {all.length > 12 && <Tabs value={range} onChange={setRange} items={[{ id: '1y', label: '1Y' }, ...(all.length > 36 ? [{ id: '3y' as const, label: '3Y' }] : []), { id: 'all', label: 'All' }]} />}
          </div>
          <LineChart points={series} label="Net worth" />
        </section>
      )}
      <div className="wealth-grid">
        <section className="panel">
          <h2>What you own</h2>
          <ul className="value-list items">
            <li><Link className="row-btn" to="/accounts"><span><b>Cash in the bank</b><small>From balances on Accounts</small></span><span className="num">{money(nowNw.cash)}<ChevronRight size={16} aria-hidden /></span></Link></li>
            <li><Link className="row-btn" to="/wealth?tab=income"><span><b>Super</b><small>From the Income & super tab</small></span><span className="num">{money(nowNw.super)}<ChevronRight size={16} aria-hidden /></span></Link></li>
            {(s.wealth ?? []).filter((w) => !isDebt(w)).map(row)}
          </ul>
        </section>
        <section className="panel">
          <h2>What you owe</h2>
          <ul className="value-list items">
            {(s.wealth ?? []).filter(isDebt).map(row)}
            {!(s.wealth ?? []).some(isDebt) && <li className="muted">Nothing owed.</li>}
          </ul>
          <details className="add">
            <summary>Add something you own or owe</summary>
            <form className="stack-form" onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim() || !amount) return;
              updateSettings({ wealth: [...(s.wealth ?? []), { id: `w${Date.now().toString(36)}`, name: name.trim(), kind, ownedSince: longHeld ? '0000-01-01' : today(), values: [{ date: today(), amount: Number(amount) }] }] });
              setName(''); setAmount('');
            }}>
              <div className="inline-form">
                <input placeholder="Name, e.g. Car" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
                <select value={kind} onChange={(e) => setKind(e.target.value as WealthItem['kind'])} aria-label="Type">
                  {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <span className="money-input"><span aria-hidden>$</span><input inputMode="decimal" placeholder="Value today" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} aria-label="Value today" /></span>
              </div>
              <label className="check small"><input type="checkbox" checked={longHeld} onChange={(e) => setLongHeld(e.target.checked)} /><span>Had it before our records start <small>Untick if it's new this month.</small></span></label>
              <button className="btn small">Add</button>
            </form>
          </details>
        </section>
      </div>
      {open && <ItemSheet item={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function PersonCard({ person }: { person: string }) {
  const { data, updateSettings } = useStore();
  const s = data.settings;
  const month = thisMonth();
  const p = payFor(s, person, month);
  const sup = latestSuper(s, person);
  const room = p ? superRoom(p, month) : null;
  const [from, setFrom] = useState(month);
  const [draft, setDraft] = useState<PayEntry | null>(null);

  const change = (patch: Partial<PayEntry>) => setDraft({ ...(draft ?? p ?? { person, from, grossYearly: 0, takeHome: 0, every: 'month', superPct: 12, salarySacrifice: 0 }), ...patch });
  const save = () => {
    if (!draft) return;
    const entry = { ...draft, from };
    updateSettings({ pay: [...(s.pay ?? []).filter((x) => !(x.person === person && x.from === from)), entry] });
    setDraft(null);
  };
  const cur = draft ?? p;
  const history = (s.pay ?? []).filter((x) => x.person === person).sort((a, b) => b.from.localeCompare(a.from));

  return (
    <section className="panel person">
      <h2>{person}</h2>
      {cur ? (
        <div className="fund-fields">
          <label>Salary before tax, per year<NumberField label="Salary per year" value={cur.grossYearly} onSave={(n) => change({ grossYearly: n })} /></label>
          <label>Take-home pay<span className="row-gap"><NumberField label="Take-home per pay" value={cur.takeHome} onSave={(n) => change({ takeHome: n })} width="6em" />
            <select aria-label="How often" value={cur.every} onChange={(e) => change({ every: e.target.value as Every })}>
              {(['week', 'fortnight', 'month'] as Every[]).map((e) => <option key={e} value={e}>per {EVERY_LABEL[e]}</option>)}
            </select></span></label>
          <label>Employer super<NumberField label="Employer super percent" prefix="" suffix="%" width="4em" value={cur.superPct} onSave={(n) => change({ superPct: n })} /></label>
          <label>Salary sacrifice to super, per month<NumberField label="Salary sacrifice per month" value={cur.salarySacrifice} onSave={(n) => change({ salarySacrifice: n })} /></label>
        </div>
      ) : <button className="btn small" onClick={() => change({})}>Add {person}'s pay</button>}
      {draft && (
        <div className="save-row">
          <label className="inline">Applies from <input type="month" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <button className="btn small" onClick={() => setDraft(null)}>Cancel</button>
          <button className="btn small primary" onClick={save}>Save change</button>
        </div>
      )}
      {cur && !draft && <p className="muted small-print">About {money(cur.takeHome * PER_MONTH[cur.every])} a month take-home. Changes keep the old figures for earlier months.{history.length > 1 && <> Earlier: {history.slice(1).map((h) => `${money(h.takeHome)} from ${h.from}`).join('; ')}.</>}</p>}

      <h3 className="sub">Super</h3>
      <div className="fund-fields">
        <label>Balance<NumberField label={`${person} super balance`} value={sup?.amount ?? 0} onSave={(n) => updateSettings({ superBalances: [...(s.superBalances ?? []), { person, date: today(), amount: n, fund: sup?.fund }] })} /></label>
        <label>Fund<input defaultValue={sup?.fund ?? ''} placeholder="e.g. Spaceship" onBlur={(e) => { if (e.target.value !== (sup?.fund ?? '')) updateSettings({ superBalances: [...(s.superBalances ?? []), { person, date: today(), amount: sup?.amount ?? 0, fund: e.target.value }] }); }} /></label>
      </div>
      {sup && <p className="muted small-print">As at {longDate(sup.date)}.{sup.date < addMonths(month, -3) + '-01' && ' Worth updating: check your super app.'}</p>}

      {room && (
        <div className="room">
          <div className="room-head"><b>Before-tax super limit, {financialYear(month)}</b><Info>The yearly cap on employer super plus salary sacrifice is {money(room.cap)}{room.capKnown ? '' : ' (latest known figure)'}. Unused cap from the last five years can be carried forward while your super balance is under $500,000.</Info></div>
          <div className="progress" role="img" aria-label={`${money(room.used)} of ${money(room.cap)} used`}><span style={{ width: `${Math.min(1, room.used / room.cap) * 100}%` }} /></div>
          <p className="small-print">{money(room.used)} used, {money(room.room)} of room. Each extra $1,000 salary-sacrificed costs about {money(room.costPer1000)} of take-home pay and saves about {money(room.taxSavedPer1000)} in tax.</p>
        </div>
      )}
    </section>
  );
}

function IncomeTab() {
  const { data } = useStore();
  const s = data.settings;
  const month = thisMonth();
  const changes = payChanges(data);
  const names = people(s);
  return (
    <>
      {changes.map((c) => <p key={c.person} className="partial-note">{c.person}'s pay in the bank changed from {money(c.from)} to {money(c.to)} in {c.month}. Update it below so the budget uses the right figure.</p>)}
      <div className="stat-row household">
        <div><span>Take-home each month</span><b>{money(expectedIncome(s, month))}</b></div>
        <div><span>Before tax</span><b>{money(grossMonthly(s, month))}</b></div>
        <div><span>Into super</span><b>{money(superMonthly(s, month))}</b></div>
      </div>
      <div className="wealth-grid">{names.map((p) => <PersonCard key={p} person={p} />)}</div>
    </>
  );
}

export function Wealth() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'worth' | 'income') ?? 'worth';
  return (
    <div className="wealth">
      <PageHeader title="Wealth">
        <Tabs value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} items={[{ id: 'worth', label: 'Net worth' }, { id: 'income', label: 'Income & super' }]} />
      </PageHeader>
      {tab === 'worth' ? <NetWorthTab /> : <IncomeTab />}
      <p className="fine">Bank balances are updated on <Link to="/accounts">Accounts</Link>.</p>
    </div>
  );
}
