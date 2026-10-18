import { CalendarClock, FileText, Home, LayoutGrid, Loader2, Mountain, ReceiptText, Scale, Settings, Sparkles, Upload, Wallet, Landmark } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useStore } from '../data/store';

export const NAV = [
  { section: '', items: [
    { to: '/', label: 'Home', Icon: Home, hint: 'This month at a glance' },
    { to: '/transactions', label: 'Spending', Icon: ReceiptText, hint: 'Every transaction' },
    { to: '/budget', label: 'Budget', Icon: Wallet, hint: 'Give every dollar a job' },
    { to: '/bills', label: 'Bills', Icon: CalendarClock, hint: 'What is due, and what went up' },
  ] },
  { section: 'Looking back', items: [
    { to: '/review', label: 'Review', Icon: Scale, hint: 'How the month went' },
    { to: '/reports', label: 'Reports', Icon: FileText, hint: 'Money meeting and tax time' },
  ] },
  { section: 'Looking ahead', items: [
    { to: '/goals', label: 'Goals', Icon: Mountain, hint: 'Baby steps, funds, the house' },
    { to: '/what-if', label: 'What if', Icon: Sparkles, hint: 'Try cuts, see the effect' },
    { to: '/wealth', label: 'Wealth', Icon: Landmark, hint: 'Net worth, income and super' },
  ] },
  { section: 'Tools', items: [
    { to: '/import', label: 'Add statements', Icon: Upload, hint: 'Bring in new transactions' },
    { to: '/settings', label: 'Settings', Icon: Settings, hint: 'Accounts, categories, backup' },
  ] },
];
const TABS = [NAV[0].items[0], NAV[0].items[1], NAV[0].items[2], NAV[1].items[0], { to: '/more', label: 'More', Icon: LayoutGrid, hint: '' }];

function Purse() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden className="mark">
      <path d="M9 9c0-3 3-5 7-5s7 2 7 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="4" y="9" width="24" height="19" rx="7" fill="currentColor" />
      <circle cx="16" cy="18.5" r="3.4" fill="var(--brass)" />
    </svg>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { data, saving, mode } = useStore();
  const toSort = data.transactions.filter((t) => t.needsReview).length;
  const badge = (to: string) => (to === '/transactions' && toSort > 0 ? <em className="count" aria-label={`${toSort} to sort`}>{toSort}</em> : null);
  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>
      <aside className="side">
        <div className="brand"><Purse /><div><strong>Family Purse</strong><span>{data.settings.household}</span></div></div>
        {NAV.map((g) => (
          <nav key={g.section || 'main'} aria-label={g.section || 'Main'} className={g.section === 'Tools' ? 'nav-extra' : ''}>
            {g.section && g.section !== 'Tools' && <p className="nav-section">{g.section}</p>}
            {g.items.map(({ to, label, Icon }) => (
              <NavLink key={to} to={to} end={to === '/'} className="nav-item"><Icon size={19} aria-hidden /><span>{label}</span>{badge(to)}</NavLink>
            ))}
          </nav>
        ))}
        {mode === 'local' && <p className="demo-note">Demo mode: data stays in this browser.</p>}
      </aside>

      <header className="topbar">
        <div className="brand"><Purse /><strong>Family Purse</strong></div>
        <div className="topbar-tools">
          <NavLink to="/import" className="icon-btn" aria-label="Add statements" title="Add statements"><Upload size={20} /></NavLink>
          <NavLink to="/settings" className="icon-btn" aria-label="Settings" title="Settings"><Settings size={20} /></NavLink>
        </div>
      </header>

      <main id="main" className="main">{children}</main>

      <nav className="tabbar" aria-label="Main">
        {TABS.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className="tab"><Icon size={21} aria-hidden /><span>{label}</span>{badge(to)}</NavLink>
        ))}
      </nav>
      {saving && <div className="saving" role="status"><Loader2 size={14} className="spin" /> Saving</div>}
    </div>
  );
}
