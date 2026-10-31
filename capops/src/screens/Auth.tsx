import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useApp } from '../AppContext';
import { Field, Notice } from '../components/ui';

type Mode = 'signin' | 'register' | 'reset';

const redirectUrl = () => window.location.href.split('#')[0].split('?')[0];

export default function Auth() {
  const { recovery, setRecovery } = useApp();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'danger'; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      if (recovery) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setRecovery(false);
        return;
      }
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'register') {
        if (password.length < 8) throw new Error('Use at least 8 characters for your password.');
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectUrl() } });
        if (error) throw error;
        if (!data.session) setMsg({ kind: 'ok', text: 'Account created. Check your email for a confirmation link, then sign in.' });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
        if (error) throw error;
        setMsg({ kind: 'ok', text: 'If that email has an account, a reset link is on its way.' });
      }
    } catch (err) {
      setMsg({ kind: 'danger', text: err instanceof Error ? err.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="hero">
        <div className="eyebrow" style={{ color: 'var(--brass)' }}>Mete, Benefits Corporation</div>
        <h1 className="display">METE CAP/OPS™</h1>
        <div className="rule" />
        <p style={{ fontSize: 17, lineHeight: '26px', margin: 0, maxWidth: 520 }}>
          Find what is holding your business back, fix the root causes, and track the results — without waiting on a consultant to write every document.
        </p>
        <ol>
          <li><strong>CAP</strong> — a 20-question business assessment, scored by category.</li>
          <li><strong>Diagnosis</strong> — follow-up questions to find root causes.</li>
          <li><strong>OPS</strong> — corrective actions, policies, SOPs and a business blueprint.</li>
          <li><strong>Plan &amp; monitor</strong> — a 30/60/90-day plan, KPIs and reassessment.</li>
        </ol>
      </section>
      <section className="panel">
        <form onSubmit={submit} aria-label="Account">
          <h2 className="h1">{recovery ? 'Set a new password' : mode === 'signin' ? 'Sign in' : mode === 'register' ? 'Create your account' : 'Reset password'}</h2>
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
          {!recovery && (
            <Field label="Email">
              <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          )}
          {mode !== 'reset' && (
            <Field label={recovery ? 'New password' : 'Password'} hint={mode === 'register' || recovery ? 'At least 8 characters.' : undefined}>
              <input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required minLength={recovery || mode === 'register' ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          )}
          <button className="btn" disabled={busy} type="submit">{busy ? 'Please wait…' : recovery ? 'Save password' : mode === 'signin' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link'}</button>
          {!recovery && (
            <div className="row small" style={{ justifyContent: 'space-between' }}>
              {mode !== 'signin' ? <button type="button" className="btn ghost sm" onClick={() => { setMode('signin'); setMsg(null); }}>Have an account? Sign in</button>
                : <button type="button" className="btn ghost sm" onClick={() => { setMode('register'); setMsg(null); }}>New here? Create an account</button>}
              {mode === 'signin' && <button type="button" className="btn ghost sm" onClick={() => { setMode('reset'); setMsg(null); }}>Forgot password?</button>}
            </div>
          )}
        </form>
      </section>
    </div>
  );
}
