import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { homeProperty } from './data/property';
import { Shell } from './components/Shell';
import { PageBoundary } from './components/PageBoundary';
import { StoreProvider, useStore } from './data/store';
import { useLook } from './theme/useLook';
import { HomeScreen } from './screens/Home';
import { Login, SetPassword } from './screens/Login';

// Pages load when first opened, so the app starts faster (Home and sign-in come with the first download).
const PropertyScreen = lazy(() => import('./screens/Property').then((m) => ({ default: m.PropertyScreen })));
const Uni = lazy(() => import('./screens/Uni').then((m) => ({ default: m.Uni })));
const Accounts = lazy(() => import('./screens/Accounts').then((m) => ({ default: m.Accounts })));
const Bills = lazy(() => import('./screens/Bills').then((m) => ({ default: m.Bills })));
const Categories = lazy(() => import('./screens/Categories').then((m) => ({ default: m.Categories })));
const Budget = lazy(() => import('./screens/Budget').then((m) => ({ default: m.Budget })));
const Goals = lazy(() => import('./screens/Goals').then((m) => ({ default: m.Goals })));
const More = lazy(() => import('./screens/More').then((m) => ({ default: m.More })));
const Reports = lazy(() => import('./screens/Reports').then((m) => ({ default: m.Reports })));
const SettingsScreen = lazy(() => import('./screens/Settings').then((m) => ({ default: m.SettingsScreen })));
const Statements = lazy(() => import('./screens/Statements').then((m) => ({ default: m.Statements })));
const Transactions = lazy(() => import('./screens/Transactions').then((m) => ({ default: m.Transactions })));
const Wealth = lazy(() => import('./screens/Wealth').then((m) => ({ default: m.Wealth })));
const WhatIf = lazy(() => import('./screens/WhatIf').then((m) => ({ default: m.WhatIf })));

/** An old address: go to the new one, keeping anything after the "?" (like ?step=… for the meeting). */
function Moved({ to, add }: { to: string; add?: Record<string, string> }) {
  const q = new URLSearchParams(useLocation().search);
  for (const [k, v] of Object.entries(add ?? {})) q.set(k, v);
  const qs = q.toString();
  return <Navigate to={`${to}${qs ? `?${qs}` : ''}`} replace />;
}

/** What if now lives on the home's Property page; with no home yet it still opens on its own. */
function WhatIfMoved() {
  const { data } = useStore();
  const home = homeProperty(data.settings, data.budgets);
  return home ? <Navigate to={`/property/${home.id}?tab=whatif`} replace /> : <WhatIf />;
}

function Gate() {
  const { status, error, reload, recovering } = useStore();
  const where = useLocation().pathname;
  useLook();

  if (status === 'loading') return <div className="center-screen"><div className="loader" aria-label="Loading" /><p>Opening the family purse…</p></div>;
  if (recovering) return <SetPassword />;
  if (status === 'signed-out') return <Login />;
  if (status === 'error') return (
    <div className="center-screen">
      <h1>Couldn't load your data</h1>
      <p className="lead">{error}</p>
      <p>If the database has been asleep (free projects pause after a week without use), open supabase.com, choose the family-budget project and click <b>Restore project</b>. Then try again.</p>
      <button className="btn primary" onClick={() => reload()}>Try again</button>
    </div>
  );
  return (
    <Shell>
      <PageBoundary resetKey={where}>
      <Suspense fallback={<div className="page-loading" aria-label="Loading page"><div className="loader" /></div>}>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/check-in" element={<Reports />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/budget" element={<Budget />} />
        <Route path="/bills" element={<Bills />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/property" element={<PropertyScreen />} />
        <Route path="/property/:id" element={<PropertyScreen />} />
        <Route path="/uni" element={<Uni />} />
        <Route path="/wealth" element={<Wealth />} />
        <Route path="/statements" element={<Statements />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/more" element={<More />} />
        {/* Old addresses (bookmarks, links in notes) go to where those pages live now. */}
        <Route path="/reports" element={<Moved to="/check-in" />} />
        <Route path="/review" element={<Moved to="/check-in" />} />
        <Route path="/trends" element={<Moved to="/check-in" add={{ tab: 'trends' }} />} />
        <Route path="/import" element={<Moved to="/statements" add={{ tab: 'add' }} />} />
        <Route path="/what-if" element={<WhatIfMoved />} />
        <Route path="*" element={<HomeScreen />} />
      </Routes>
      </Suspense>
      </PageBoundary>
    </Shell>
  );
}

export default function App() {
  return (
    <HashRouter>
      <StoreProvider><Gate /></StoreProvider>
    </HashRouter>
  );
}
