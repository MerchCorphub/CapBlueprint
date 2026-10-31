import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../AppContext';
import { supabase } from '../lib/supabase';
import { activeCycle } from '../lib/data';
import type { Plan as PlanT, Solution } from '../lib/types';
import { Chip, Empty, Field, Notice, PageHead, Progress, Spinner, fmtDate } from '../components/ui';

const PHASES = [{ n: 30, label: 'Days 1–30' }, { n: 60, label: 'Days 31–60' }, { n: 90, label: 'Days 61–90' }] as const;
const plusDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export default function Plan() {
  const { business, bundle, refresh } = useApp();
  const latest = bundle ? activeCycle(bundle) ?? null : null;
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const plan = bundle?.plans.find((p) => p.assessment_id === latest?.id);
  const sols = (bundle?.solutions ?? []).filter((s) => s.assessment_id === latest?.id && s.approval_status === 'approved');

  useEffect(() => {
    if (business && latest && sols.length && bundle && !plan && !busy) {
      setBusy(true);
      (async () => {
        const r = await supabase.from('implementation_plans').insert({ business_id: business.id, assessment_id: latest.id });
        if (r.error) setErr(r.error.message);
        await refresh();
        setBusy(false);
      })();
    }
  }, [business?.id, latest?.id, sols.length, !!plan]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!business) return <div className="page"><Empty title="No business yet"><Link className="btn" to="/profile">Create a business profile</Link></Empty></div>;
  if (!latest || !sols.length) return <div className="page"><PageHead eyebrow="Step 8" title="Implementation Plan" /><Empty title="Approve OPS actions first">The plan is made from approved corrective actions.<div style={{ marginTop: 12 }}><Link className="btn" to="/ops">Go to OPS Solutions</Link></div></Empty></div>;
  if (!plan) return <div className="page">{err ? <Notice kind="danger">{err}</Notice> : <Spinner label="Preparing plan…" />}</div>;

  const draft = plan.status === 'draft';
  const done = sols.filter((s) => s.progress_status === 'done').length;
  const docs = bundle?.documents ?? [];

  async function upPlan(patch: Partial<PlanT>) {
    const r = await supabase.from('implementation_plans').update(patch).eq('id', plan!.id);
    if (r.error) setErr(r.error.message); else await refresh();
  }
  async function upSol(s: Solution, patch: Partial<Solution>) {
    const r = await supabase.from('solutions').update(patch).eq('id', s.id);
    if (r.error) setErr(r.error.message); else await refresh();
  }
  async function resetDates() {
    setBusy(true);
    try {
      for (const s of sols) { const r = await supabase.from('solutions').update({ target_date: plusDays(plan!.start_date, s.phase) }).eq('id', s.id); if (r.error) throw new Error(r.error.message); }
      await refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }
  }

  return (
    <div className="page">
      <PageHead eyebrow={`Step 8 · Plan for assessment version ${latest.version}`} title="30/60/90-Day Implementation Plan"
        intro={draft ? 'Arrange approved actions into phases and set dates, then approve the plan to start tracking.' : 'Update each action as work moves forward. Progress feeds the Performance Dashboard.'}
        actions={<>
          <Chip value={plan.status === 'draft' ? 'draft' : plan.status === 'approved' ? 'approved' : 'done'} label={`Plan ${plan.status}`} />
          {draft && <button className="btn brass" onClick={() => upPlan({ status: 'approved', approved_at: new Date().toISOString() })}>Approve plan</button>}
          {plan.status === 'approved' && <button className="btn ghost sm" onClick={() => upPlan({ status: 'draft', approved_at: null })}>Reopen for changes</button>}
          {plan.status === 'approved' && done === sols.length && <button className="btn" onClick={() => upPlan({ status: 'completed' })}>Mark plan complete</button>}
          {!draft && <Link className="btn secondary" to="/dashboard">Dashboard</Link>}
        </>} />
      {err && <Notice kind="danger">{err}</Notice>}
      <div className="card grid g3" style={{ alignItems: 'end' }}>
        <Field label="Plan start date"><input type="date" disabled={!draft} value={plan.start_date} onChange={(e) => e.target.value && upPlan({ start_date: e.target.value })} /></Field>
        <div>{draft && <button className="btn secondary" disabled={busy} onClick={resetDates}>Set due dates from start date</button>}</div>
        <Progress value={(done / sols.length) * 100} label={`${done} of ${sols.length} actions done`} />
        <Field label="Plan notes"><textarea defaultValue={plan.notes ?? ''} onBlur={(e) => e.target.value !== (plan.notes ?? '') && upPlan({ notes: e.target.value })} placeholder="Weekly check-in day, who reviews progress…" /></Field>
      </div>
      <div className="kanban">
        {PHASES.map((ph) => {
          const items = sols.filter((s) => s.phase === ph.n);
          return (
            <section key={ph.n} className="stack" aria-label={ph.label}>
              <div className="row between"><div className="h2">{ph.label}</div><span className="small muted">{items.filter((s) => s.progress_status === 'done').length}/{items.length} done</span></div>
              {items.length === 0 && <div className="task small muted">No actions in this phase.</div>}
              {items.map((s) => {
                const overdue = s.target_date && s.progress_status !== 'done' && new Date(`${s.target_date}T23:59:59`) < new Date();
                const doc = docs.find((d) => d.solution_id === s.id);
                return (
                  <div key={s.id} className="task" style={{ borderLeft: `4px solid ${s.progress_status === 'done' ? 'var(--ok)' : s.progress_status === 'blocked' ? 'var(--danger)' : s.priority === 'high' ? 'var(--brass)' : 'var(--line)'}` }}>
                    <strong>{s.problem}</strong>
                    <div className="row small"><Chip value={s.priority} label={`${s.priority}`} /><span className="muted">{s.responsible_role ?? 'Owner'}</span></div>
                    <div className="small">Due {fmtDate(s.target_date)} {overdue && <span className="chip danger">Overdue</span>}</div>
                    {s.kpi_name && <div className="small muted">Measure: {s.kpi_name} → {s.kpi_target} {s.kpi_unit}</div>}
                    {doc && <Link className="small" to={`/documents/${doc.id}`}>{doc.title} ({doc.status.replace('_', ' ')})</Link>}
                    {draft ? (
                      <div className="grid g2">
                        <Field label="Phase"><select value={s.phase} onChange={(e) => upSol(s, { phase: Number(e.target.value) as Solution['phase'], target_date: plusDays(plan.start_date, Number(e.target.value)) })}>{PHASES.map((p) => <option key={p.n} value={p.n}>{p.label}</option>)}</select></Field>
                        <Field label="Due"><input type="date" value={s.target_date ?? ''} onChange={(e) => upSol(s, { target_date: e.target.value || null })} /></Field>
                      </div>
                    ) : (
                      <>
                        <Field label="Status">
                          <select value={s.progress_status} onChange={(e) => upSol(s, { progress_status: e.target.value as Solution['progress_status'] })}>
                            <option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="done">Done</option>
                          </select>
                        </Field>
                        <textarea aria-label="Progress note" rows={2} defaultValue={s.progress_note ?? ''} placeholder="Progress note" onBlur={(e) => e.target.value !== (s.progress_note ?? '') && upSol(s, { progress_note: e.target.value })} />
                      </>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
