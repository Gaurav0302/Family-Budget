import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Info, MonthColumns, NumberField, PageHeader, Tabs } from '../components/bits';
import { allMonths, addMonths } from '../data/analysis';
import { useStore } from '../data/store';
import type { Every, PayEntry, WealthItem } from '../data/types';
import {
  expectedIncome, financialYear, grossMonthly, latestSuper, netWorth, netWorthSeries, PER_MONTH, payChanges, payFor, people, superMonthly, superRoom,
} from '../data/wealth';
import { longDate, money, thisMonth } from '../lib/format';

const today = () => new Date().toISOString().slice(0, 10);
const KIND_LABEL: Record<WealthItem['kind'], string> = { home: 'Home', shares: 'Shares', crypto: 'Crypto', other: 'Other asset', loan: 'Home loan', debt: 'Other debt' };
const EVERY_LABEL: Record<Every, string> = { week: 'week', fortnight: 'fortnight', month: 'month', quarter: 'quarter', year: 'year' };

function NetWorthTab() {
  const { data, updateSettings } = useStore();
  const s = data.settings;
  const nw = netWorth(s, '9999-12-31');
  const nowNw = netWorth(s, today());
  const months = useMemo(() => {
    const have = allMonths(data.transactions);
    const end = thisMonth();
    const out: string[] = [];
    for (let m = have[0] ?? end; m <= end; m = addMonths(m, 1)) out.push(m);
    return out.slice(-12);
  }, [data.transactions]);
  // Only months where bank balances are known; before that the total would be missing the cash.
  const series = netWorthSeries(s, months.filter((m) => netWorth(s, `${m}-28`).cash > 0 || netWorth(s, `${addMonths(m, 1)}-01`).cash > 0));
  const [name, setName] = useState('');
  const [kind, setKind] = useState<WealthItem['kind']>('shares');
  const [amount, setAmount] = useState('');
  const future = nw.total !== nowNw.total;

  const setValue = (id: string, amt: number) => updateSettings({
    wealth: (s.wealth ?? []).map((w) => (w.id === id ? { ...w, values: [...w.values.filter((v) => v.date !== today()), { date: today(), amount: amt }] } : w)),
  });

  return (
    <>
      <section className="hero-small">
        <p className="kicker">Net worth today</p>
        <p className="big-num">{money(nowNw.total)}</p>
        <p className="muted">Owned {money(nowNw.cash + nowNw.super + nowNw.assets)}, owed {money(nowNw.debts)}.
          {future && <> From settlement it becomes {money(nw.total)} once the house and loan count. <Info>The house and loan are dated from settlement. After settlement, update your bank balances: the deposit and stamp duty will have left your savings.</Info></>}</p>
      </section>
      {series.length > 1 && <section className="panel"><h2>Month by month</h2><MonthColumns rows={series.map((x) => ({ month: x.month, value: x.value }))} /></section>}
      <div className="wealth-grid">
        <section className="panel">
          <h2>What you own</h2>
          <ul className="value-list">
            <li><span><b>Cash in the bank</b><small>From account balances on the Goals page</small></span><span>{money(nw.cash)}</span></li>
            <li><span><b>Super</b><small>From the Income & super tab</small></span><span>{money(nw.super)}</span></li>
            {(s.wealth ?? []).filter((w) => w.kind !== 'loan' && w.kind !== 'debt').map((w) => {
              const v = [...w.values].sort((a, b) => b.date.localeCompare(a.date))[0];
              return <li key={w.id}><span><b>{w.name}</b><small>{KIND_LABEL[w.kind]}{v ? `, as at ${longDate(v.date)}` : ''}</small></span>
                <NumberField label={`${w.name} value`} value={v?.amount ?? 0} onSave={(n) => setValue(w.id, n)} /></li>;
            })}
          </ul>
        </section>
        <section className="panel">
          <h2>What you owe</h2>
          <ul className="value-list">
            {(s.wealth ?? []).filter((w) => w.kind === 'loan' || w.kind === 'debt').map((w) => {
              const v = [...w.values].sort((a, b) => b.date.localeCompare(a.date))[0];
              return <li key={w.id}><span><b>{w.name}</b><small>{v ? `As at ${longDate(v.date)}` : ''}</small></span>
                <NumberField label={`${w.name} balance`} value={v?.amount ?? 0} onSave={(n) => setValue(w.id, n)} /></li>;
            })}
            {!(s.wealth ?? []).some((w) => w.kind === 'loan' || w.kind === 'debt') && <li className="muted">Nothing owed.</li>}
          </ul>
          <details className="add">
            <summary>Add something you own or owe</summary>
            <form className="inline-form" onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim() || !amount) return;
              updateSettings({ wealth: [...(s.wealth ?? []), { id: `w${Date.now().toString(36)}`, name: name.trim(), kind, values: [{ date: today(), amount: Number(amount) }] }] });
              setName(''); setAmount('');
            }}>
              <input placeholder="Name, e.g. Car" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
              <select value={kind} onChange={(e) => setKind(e.target.value as WealthItem['kind'])} aria-label="Type">
                {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <span className="money-input"><span aria-hidden>$</span><input inputMode="decimal" placeholder="Value" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} aria-label="Value" /></span>
              <button className="btn small">Add</button>
            </form>
          </details>
        </section>
      </div>
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
      <p className="fine">Cash balances are updated on <Link to="/goals">Goals</Link>.</p>
    </div>
  );
}
