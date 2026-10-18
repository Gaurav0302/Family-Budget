import { Home, ReceiptText, Wallet, Scale, Mountain, Upload, Settings, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useStore } from '../data/store';

const MAIN = [
  { to: '/', label: 'Home', Icon: Home },
  { to: '/transactions', label: 'Spending', Icon: ReceiptText },
  { to: '/budget', label: 'Budget', Icon: Wallet },
  { to: '/review', label: 'Review', Icon: Scale },
  { to: '/goals', label: 'Goals', Icon: Mountain },
];
const EXTRA = [
  { to: '/import', label: 'Add statements', Icon: Upload },
  { to: '/settings', label: 'Settings', Icon: Settings },
];

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
  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>
      <aside className="side">
        <div className="brand"><Purse /><div><strong>Family Purse</strong><span>{data.settings.household}</span></div></div>
        <nav aria-label="Main">
          {MAIN.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className="nav-item">
              <Icon size={19} aria-hidden /><span>{label}</span>
              {to === '/transactions' && toSort > 0 && <em className="count" aria-label={`${toSort} to sort`}>{toSort}</em>}
            </NavLink>
          ))}
        </nav>
        <nav aria-label="Tools" className="nav-extra">
          {EXTRA.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className="nav-item"><Icon size={19} aria-hidden /><span>{label}</span></NavLink>
          ))}
        </nav>
        {mode === 'local' && <p className="demo-note">Demo mode: data stays in this browser.</p>}
      </aside>

      <header className="topbar">
        <div className="brand"><Purse /><strong>Family Purse</strong></div>
        <div className="topbar-tools">
          {EXTRA.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className="icon-btn" aria-label={label} title={label}><Icon size={20} /></NavLink>
          ))}
        </div>
      </header>

      <main id="main" className="main">{children}</main>

      <nav className="tabbar" aria-label="Main">
        {MAIN.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className="tab">
            <Icon size={21} aria-hidden /><span>{label}</span>
            {to === '/transactions' && toSort > 0 && <em className="count">{toSort}</em>}
          </NavLink>
        ))}
      </nav>
      {saving && <div className="saving" role="status"><Loader2 size={14} className="spin" /> Saving</div>}
    </div>
  );
}
