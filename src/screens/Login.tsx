import { useEffect, useState } from 'react';
import { acceptInvite, codeFrom, createHousehold, inviteDetails, PENDING_INVITE } from '../data/adapters/households';
import { useStore } from '../data/store';

export function Login() {
  const { signIn, signUp, resetPassword } = useStore();
  const [mode, setMode] = useState<'in' | 'up'>(() => (location.hash.includes('signup') ? 'up' : 'in'));
  const [forgot, setForgot] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const up = mode === 'up';
  const invited = (() => { try { return !!localStorage.getItem(PENDING_INVITE); } catch { return false; } })();

  return (
    <div className="login">
      <form className="login-card" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError(null);
        if (up) {
          if (password.length < 8) { setBusy(false); return setError('Use at least 8 characters for the password.'); }
          const r = await signUp(email, password);
          setBusy(false);
          if (r.error) setError(r.error);
          else if (r.confirm) setDone(`Nearly there. We've emailed ${email.trim()} a link: open it to confirm your email, then sign in here.`);
          return;
        }
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
        <p className="lead">{up ? 'Create a login. Next you start your household, or join the one that invited you.' : 'Sign in to your household.'}</p>
        {invited && !done && <p className="ok">You've been invited to a household. {up ? 'Create your login' : 'Sign in, or create a login,'} and you'll be asked to join.</p>}
        {done ? <p className="ok" role="status">{done}</p> : <>
          <label>Email<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Password<input type="password" autoComplete={up ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={up ? 8 : undefined} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn primary wide" disabled={busy}>{busy ? (up ? 'Creating…' : 'Signing in…') : up ? 'Create my login' : 'Sign in'}</button>
        </>}
        <p className="login-switch">{up
          ? <>Already have a login? <button type="button" className="link" onClick={() => { setMode('in'); setError(null); setDone(null); }}>Sign in</button></>
          : <>New here? <button type="button" className="link" onClick={() => { setMode('up'); setError(null); setForgot(false); }}>Create a login</button></>}</p>
        {!up && (forgot ? (
          <div className="forgot">
            <p className="fine">Type your email above, then send the link. It lets you set a new password.</p>
            <button type="button" className="btn wide" disabled={!email} onClick={async () => { const err = await resetPassword(email); setSent(err ? `Couldn't send it: ${err}` : `Sent. Check ${email} for a link to set a new password.`); }}>Email me a link</button>
            {sent && <p role="status" className="fine">{sent}</p>}
          </div>
        ) : <button type="button" className="link" onClick={() => setForgot(true)}>Forgot your password?</button>)}
      </form>
    </div>
  );
}

/** Signed in but not in a household yet: join with an invitation link, or start your own. */
export function Welcome() {
  const { email, enterHousehold, signOut } = useStore();
  const pending = (() => { try { return localStorage.getItem(PENDING_INVITE); } catch { return null; } })();
  const [code, setCode] = useState<string | null>(pending);
  const [pasted, setPasted] = useState('');
  const [invite, setInvite] = useState<Awaited<ReturnType<typeof inviteDetails>> | undefined>(pending ? undefined : null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!code) { setInvite(null); return; }
    setInvite(undefined);
    inviteDetails(code).then((d) => { setInvite(d); if (!d) setError("That invitation link doesn't work any more (used, cancelled or older than 14 days). Ask for a new one."); }, () => setInvite(null));
  }, [code]);
  const forget = () => { try { localStorage.removeItem(PENDING_INVITE); } catch { /* storage off */ } };
  const go = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); forget(); await enterHousehold(); } catch (e: any) { setError(e?.message ?? String(e)); setBusy(false); }
  };
  return (
    <div className="login">
      <div className="login-card">
        <h1>Welcome to Family Purse</h1>
        <p className="lead">Signed in as <b>{email}</b>.</p>
        {invite === undefined ? <p className="muted">Checking the invitation…</p> : invite ? (
          <section className="welcome-choice">
            <h2>Join {invite.name}</h2>
            <p>{invite.by ? `${invite.by} invited you.` : 'You were invited.'} You'll see and share the same budget, payments and plans.</p>
            <button className="btn primary wide" disabled={busy} onClick={() => go(() => acceptInvite(code!))}>Join {invite.name}</button>
          </section>
        ) : (
          <form className="welcome-choice" onSubmit={(e) => { e.preventDefault(); const c = codeFrom(pasted); if (c) { setError(null); setCode(c); } else setError("That doesn't look like an invitation link. Copy the whole link from the message you were sent."); }}>
            <h2>Been invited?</h2>
            <label>Paste the invitation link<input value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="https://…#/join?code=…" /></label>
            <button className="btn wide" disabled={!pasted.trim()}>Use this link</button>
          </form>
        )}
        <form className="welcome-choice" onSubmit={(e) => { e.preventDefault(); go(() => createHousehold(name || 'Our household')); }}>
          <h2>{invite ? 'Or start your own household' : 'Start your household'}</h2>
          <p className="fine">Your partner can join it later: you send them an invitation link from Settings.</p>
          <label>Household name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Smith family" /></label>
          <button className={`btn wide ${invite ? '' : 'primary'}`} disabled={busy}>Start the household</button>
        </form>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="button" className="link" onClick={() => { forget(); signOut(); }}>Sign out</button>
      </div>
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
