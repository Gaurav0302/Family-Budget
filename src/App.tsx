import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Shell } from './components/Shell';
import { PageBoundary } from './components/PageBoundary';
import { StoreProvider, useStore } from './data/store';
import { useLook } from './theme/useLook';
import { HomeScreen } from './screens/Home';
import { Login } from './screens/Login';

// Pages load when first opened, so the app starts faster (Home and sign-in come with the first download).
const PropertyScreen = lazy(() => import('./screens/Property').then((m) => ({ default: m.PropertyScreen })));
const Uni = lazy(() => import('./screens/Uni').then((m) => ({ default: m.Uni })));
const Accounts = lazy(() => import('./screens/Accounts').then((m) => ({ default: m.Accounts })));
const Bills = lazy(() => import('./screens/Bills').then((m) => ({ default: m.Bills })));
const Categories = lazy(() => import('./screens/Categories').then((m) => ({ default: m.Categories })));
const Budget = lazy(() => import('./screens/Budget').then((m) => ({ default: m.Budget })));
const Goals = lazy(() => import('./screens/Goals').then((m) => ({ default: m.Goals })));
const Import = lazy(() => import('./screens/Import').then((m) => ({ default: m.Import })));
const More = lazy(() => import('./screens/More').then((m) => ({ default: m.More })));
const Reports = lazy(() => import('./screens/Reports').then((m) => ({ default: m.Reports })));
const Review = lazy(() => import('./screens/Review').then((m) => ({ default: m.Review })));
const SettingsScreen = lazy(() => import('./screens/Settings').then((m) => ({ default: m.SettingsScreen })));
const Statements = lazy(() => import('./screens/Statements').then((m) => ({ default: m.Statements })));
const Transactions = lazy(() => import('./screens/Transactions').then((m) => ({ default: m.Transactions })));
const Trends = lazy(() => import('./screens/Trends').then((m) => ({ default: m.Trends })));
const Wealth = lazy(() => import('./screens/Wealth').then((m) => ({ default: m.Wealth })));
const WhatIf = lazy(() => import('./screens/WhatIf').then((m) => ({ default: m.WhatIf })));

function Gate() {
  const { status, error, reload } = useStore();
  const where = useLocation().pathname;
  useLook();

  if (status === 'loading') return <div className="center-screen"><div className="loader" aria-label="Loading" /><p>Opening the family purse…</p></div>;
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
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/budget" element={<Budget />} />
        <Route path="/review" element={<Review />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/bills" element={<Bills />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/trends" element={<Trends />} />
        <Route path="/statements" element={<Statements />} />
        <Route path="/what-if" element={<WhatIf />} />
        <Route path="/wealth" element={<Wealth />} />
        <Route path="/property" element={<PropertyScreen />} />
        <Route path="/property/:id" element={<PropertyScreen />} />
        <Route path="/uni" element={<Uni />} />
        <Route path="/more" element={<More />} />
        <Route path="/import" element={<Import />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/accounts" element={<Accounts />} />
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
