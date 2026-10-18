import { useState } from 'react';
import { useStore } from '../data/store';

export function Login() {
  const { signIn } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="login">
      <form className="login-card" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError(null);
        const err = await signIn(email, password);
        setBusy(false);
        if (err) setError(err);
      }}>
        <svg viewBox="0 0 32 32" width="44" height="44" aria-hidden className="mark">
          <path d="M9 9c0-3 3-5 7-5s7 2 7 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <rect x="4" y="9" width="24" height="19" rx="7" fill="currentColor" />
          <circle cx="16" cy="18.5" r="3.4" fill="var(--brass)" />
        </svg>
        <h1>Family Purse</h1>
        <p className="lead">Sign in with the email and password set up for you in Supabase.</p>
        <label>Email<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn primary wide" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="fine">Forgot your password? In Supabase, open Authentication → Users, click your email and choose “Send password recovery”.</p>
      </form>
    </div>
  );
}
