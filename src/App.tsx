import { useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { StoreProvider, useStore } from './data/store';
import { Budget } from './screens/Budget';
import { Goals } from './screens/Goals';
import { HomeScreen } from './screens/Home';
import { Import } from './screens/Import';
import { Login } from './screens/Login';
import { Review } from './screens/Review';
import { SettingsScreen } from './screens/Settings';
import { Transactions } from './screens/Transactions';

function Gate() {
  const { status, error, data, reload } = useStore();
  const theme = data.settings.theme;
  useEffect(() => {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

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
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/budget" element={<Budget />} />
        <Route path="/review" element={<Review />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/import" element={<Import />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="*" element={<HomeScreen />} />
      </Routes>
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
