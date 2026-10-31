import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../AppContext';
import { supabase } from '../lib/supabase';
import { Notice, Spinner } from './ui';

export const STEPS = [
  { path: '/welcome', label: 'Welcome', phase: 'Start' },
  { path: '/profile', label: 'Business Profile', phase: 'Start' },
  { path: '/cap', label: 'CAP Questionnaire', phase: 'CAP · Assess' },
  { path: '/results', label: 'CAP Results', phase: 'CAP · Assess' },
  { path: '/diagnosis', label: 'AI Diagnosis', phase: 'CAP · Assess' },
  { path: '/ops', label: 'OPS Solutions', phase: 'OPS · Correct' },
  { path: '/blueprint', label: 'Business Blueprint', phase: 'OPS · Correct' },
  { path: '/plan', label: 'Implementation Plan', phase: 'OPS · Correct' },
  { path: '/dashboard', label: 'Performance Dashboard', phase: 'Monitor' },
  { path: '/reports', label: 'Reports & Documents', phase: 'Monitor' },
] as const;

export function useJourney() {
  const { business, bundle, latest } = useApp();
  const sols = latest && bundle ? bundle.solutions.filter((s) => s.assessment_id === latest.id) : [];
  const plan = latest && bundle ? bundle.plans.find((p) => p.assessment_id === latest.id) : undefined;
  const done: Record<string, boolean> = {
    '/welcome': true,
    '/profile': !!business,
    '/cap': !!latest && latest.status !== 'in_progress',
    '/results': !!latest && latest.status !== 'in_progress',
    '/diagnosis': latest?.status === 'confirmed',
    '/ops': sols.some((s) => s.approval_status === 'approved'),
    '/blueprint': !!bundle?.documents.some((d) => d.doc_type === 'blueprint'),
    '/plan': plan?.status === 'approved' || plan?.status === 'completed',
    '/dashboard': !!bundle?.kpis.length,
    '/reports': !!bundle?.documents.some((d) => d.status === 'approved'),
  };
  return done;
}

export default function Layout() {
  const { business, businesses, selectBusiness, session, loading, error, refresh } = useApp();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  const done = useJourney();
  let lastPhase = '';

  return (
    <div className="shell">
      <header className="topbar">
        <button className="btn ghost sm menu-btn" aria-expanded={open} aria-controls="sidebar" onClick={() => setOpen(!open)}>☰ Menu</button>
        <div className="brand">METE <span>CAP/OPS</span>™</div>
        <div className="spacer" />
        {loading && <span className="spinner" aria-label="Loading" />}
        {businesses.length > 0 && (
          <select aria-label="Current business" value={business?.id ?? ''} onChange={(e) => {
            if (e.target.value === '__new') { nav('/profile?new=1'); return; }
            selectBusiness(e.target.value);
          }}>
            {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            <option value="__new">+ Add a business</option>
          </select>
        )}
        <span className="small" style={{ opacity: .85 }} title={session?.user.email}>{session?.user.email?.split('@')[0]}</span>
        <button className="btn ghost sm" onClick={async () => { await supabase.auth.signOut(); selectBusiness(null); nav('/welcome'); }}>Sign out</button>
      </header>
      <nav id="sidebar" className={`sidebar ${open ? 'open' : ''}`} aria-label="Journey">
        <ol>
          {STEPS.map((s, i) => {
            const head = s.phase !== lastPhase ? <div className="label phase">{s.phase}</div> : null;
            lastPhase = s.phase;
            return (
              <li key={s.path}>
                {head}
                <NavLink to={s.path} onClick={() => setOpen(false)} className={({ isActive }) => (isActive || (s.path === '/reports' && loc.pathname.startsWith('/documents')) ? 'active' : '')}>
                  <span className={`step-dot ${done[s.path] ? 'done' : ''}`} aria-hidden>{done[s.path] ? '✓' : i + 1}</span>
                  <span>{s.label}<span className="sr-only" style={{ position: 'absolute', left: -9999 }}>{done[s.path] ? ' (complete)' : ''}</span></span>
                </NavLink>
              </li>
            );
          })}
        </ol>
      </nav>
      <main className="main">
        {error && <div className="page" style={{ marginBottom: 16 }}><Notice kind="danger">Could not load data: {error} <button className="btn sm secondary" onClick={refresh}>Try again</button></Notice></div>}
        {loading && !business && businesses.length === 0 ? <div className="page"><Spinner /></div> : <Outlet />}
      </main>
    </div>
  );
}
