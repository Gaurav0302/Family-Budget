import { useState } from 'react';
import { useStore } from '../data/store';

export function Login() {
  const { signIn, resetPassword } = useStore();
  const [forgot, setForgot] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
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
        {forgot ? (
          <div className="forgot">
            <p className="fine">Type your email above, then send the link. It lets you set a new password.</p>
            <button type="button" className="btn wide" disabled={!email} onClick={async () => { const err = await resetPassword(email); setSent(err ? `Couldn't send it: ${err}` : `Sent. Check ${email} for a link to set a new password.`); }}>Email me a link</button>
            {sent && <p role="status" className="fine">{sent}</p>}
          </div>
        ) : <button type="button" className="link" onClick={() => setForgot(true)}>Forgot your password?</button>}
      </form>
    </div>
  );
}

/** After following a "set a new password" email: choose the new password, then carry on into the app. */
export function SetPassword() {
  const { changePassword, finishRecovery } = useStore();
  const [a, setA] = useState(''), [b, setB] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="login">
      <form className="login-card" onSubmit={async (e) => {
        e.preventDefault();
        if (a.length < 8) return setMsg('Use at least 8 characters.');
        if (a !== b) return setMsg("The two passwords don't match.");
        const err = await changePassword(a);
        if (err) setMsg(`Not changed: ${err}`); else finishRecovery();
      }}>
        <h1>Set a new password</h1>
        <label>New password<input type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} required /></label>
        <label>Type it again<input type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} required /></label>
        {msg && <p className="form-error" role="alert">{msg}</p>}
        <button className="btn primary wide">Save and open the app</button>
      </form>
    </div>
  );
}
