import { Building2, GraduationCap, CalendarClock, FileText, Home, LayoutGrid, Loader2, Mountain, ReceiptText, Scale, Settings, Sparkles, Upload, Wallet, Landmark, Tags, CreditCard, TrendingUp, ClipboardCheck, AlertTriangle } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import { useAudits } from '../data/useAudit';
import { DrillProvider } from './Drill';
import { PaneProvider, StepPane } from './StepPane';

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
    { to: '/trends', label: 'Trends', Icon: TrendingUp, hint: 'Any area or category over time' },
  ] },
  { section: 'Looking ahead', items: [
    { to: '/goals', label: 'Goals', Icon: Mountain, hint: 'Baby steps and cash on hand' },
    { to: '/property', label: 'Property', Icon: Building2, hint: 'Each property: buying, loan, costs, scenarios' },
    { to: '/uni', label: 'Uni funds', Icon: GraduationCap, hint: 'Each child’s fund over time' },
    { to: '/what-if', label: 'What if', Icon: Sparkles, hint: 'Try cuts, see the effect' },
    { to: '/wealth', label: 'Wealth', Icon: Landmark, hint: 'Net worth, income and super' },
  ] },
  { section: 'Tools', items: [
    { to: '/import', label: 'Add statements', Icon: Upload, hint: 'Bring in new transactions' },
    { to: '/statements', label: 'Statements', Icon: ClipboardCheck, hint: 'What’s in for each month, and what’s missing' },
    { to: '/categories', label: 'Categories & payees', Icon: Tags, hint: 'Where each payee is sorted' },
    { to: '/accounts', label: 'Accounts', Icon: CreditCard, hint: 'Bank accounts, cards, offsets' },
    { to: '/settings', label: 'Settings', Icon: Settings, hint: 'Look, logins, backup' },
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
  return <PaneProvider><ShellInner>{children}</ShellInner></PaneProvider>;
}

function ShellInner({ children }: { children: ReactNode }) {
  const { data, saving, mode, saveError, retrySave, dismissSaveError, reload } = useStore();
  const [retrying, setRetrying] = useState(false);
  // Each page gets its own tab title, and moving to a new page moves keyboard and screen-reader focus to its content.
  const where = useLocation().pathname;
  const firstPage = useRef(true);
  useEffect(() => {
    const item = NAV.flatMap((g) => g.items).find((i) => (i.to === '/' ? where === '/' : where.startsWith(i.to)));
    document.title = item && item.to !== '/' ? `${item.label} – Family Purse` : 'Family Purse';
    if (firstPage.current) { firstPage.current = false; return; }
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [where]);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const onReports = pathname === '/reports';
  // The steps pane: hovering Reports previews it; clicking Reports or a step keeps it open until something else in the menu is clicked.
  const [pinned, setPinned] = useState(onReports);
  const [peek, setPeek] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => { if (!onReports) setPinned(false); }, [onReports]);
  const enter = () => { window.clearTimeout(timer.current); setPeek(true); };
  const leave = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setPeek(false), 250); };
  const openStep = (id: string) => { setPinned(true); setPeek(false); navigate(`/reports?step=${id}`); };
  const toSort = data.transactions.filter((t) => t.needsReview).length;
  // Statements still missing for last month: a gentle count on the Statements menu item.
  const { audits, lastFinished } = useAudits();
  const missingLast = audits.get(lastFinished)?.state === 'missing' ? audits.get(lastFinished)!.missing.length : 0;
  const badge = (to: string) => (to === '/transactions' && toSort > 0 ? <em className="count" aria-label={`${toSort} to sort`}>{toSort}</em>
    : to === '/statements' && missingLast > 0 ? <em className="count" aria-label={`${missingLast} statements missing`}>{missingLast}</em> : null);
  return (
    <div className={`shell ${pinned ? 'has-pane' : ''}`}>
      {/* A button, not href="#main": with hash routing that link would open the Home page. */}
      <button type="button" className="skip" onClick={() => document.getElementById('main')?.focus()}>Skip to content</button>
      <aside className="side">
        <div className="brand"><Purse /><div><strong>Family Purse</strong><span>{data.settings.household}</span></div></div>
        {NAV.map((g) => (
          <nav key={g.section || 'main'} aria-label={g.section || 'Main'} className={g.section === 'Tools' ? 'nav-extra' : ''}>
            {g.section && g.section !== 'Tools' && <p className="nav-section">{g.section}</p>}
            {g.items.map(({ to, label, Icon }) => (
              <NavLink key={to} to={to} end={to === '/'} className="nav-item"
                {...(to === '/reports'
                  ? { onMouseEnter: enter, onMouseLeave: leave, onClick: () => { setPinned(true); setPeek(false); }, 'aria-haspopup': true }
                  : { onClick: () => { setPinned(false); setPeek(false); } })}>
                <Icon size={19} aria-hidden /><span>{label}</span>{badge(to)}</NavLink>
            ))}
          </nav>
        ))}
        {mode === 'local' && <p className="demo-note">Demo mode: data stays in this browser.</p>}
      </aside>

      {(pinned || peek) && <StepPane pinned={pinned} here={onReports} onStep={openStep} onEnter={enter} onLeave={leave}
        onPresent={() => { setPinned(true); setPeek(false); navigate('/reports?present=1'); }} onClose={() => { setPinned(false); setPeek(false); }} />}

      <header className="topbar">
        <div className="brand"><Purse /><strong>Family Purse</strong></div>
        <div className="topbar-tools">
          <NavLink to="/import" className="icon-btn" aria-label="Add statements" title="Add statements"><Upload size={20} /></NavLink>
          <NavLink to="/settings" className="icon-btn" aria-label="Settings" title="Settings"><Settings size={20} /></NavLink>
        </div>
      </header>

      <main id="main" className="main" tabIndex={-1}>
        {saveError && (
          <div className="save-error" role="alert">
            <AlertTriangle size={18} aria-hidden />
            <p><b>Your last change wasn't saved.</b> {saveError}</p>
            <div className="save-error-actions">
              <button className="btn small primary" disabled={retrying} onClick={async () => { setRetrying(true); await retrySave(); setRetrying(false); }}>{retrying ? 'Trying…' : 'Try again'}</button>
              <button className="btn small" onClick={() => { dismissSaveError(); reload(); }}>Undo it</button>
            </div>
          </div>
        )}
        <DrillProvider>{children}</DrillProvider>
      </main>

      <nav className="tabbar" aria-label="Main">
        {TABS.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className="tab"><Icon size={21} aria-hidden /><span>{label}</span>{badge(to)}</NavLink>
        ))}
      </nav>
      {saving && <div className="saving" role="status"><Loader2 size={14} className="spin" /> Saving</div>}
    </div>
  );
}
