import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../AppContext';
import { runAI } from '../lib/ai';
import { generateSolutionDoc } from '../lib/docgen';
import { supabase, must } from '../lib/supabase';
import { templateSolutions } from '../lib/templates';
import type { Solution } from '../lib/types';
import { Chip, Empty, Field, Notice, PageHead, Spinner, fmtDate } from '../components/ui';
import { profileOf } from '../lib/profile';

const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const pick = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d);
const num = (v: unknown) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

export default function Solutions() {
  const { business, latest, bundle, refresh } = useApp();
  const nav = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);

  if (!business) return <div className="page"><Empty title="No business yet"><Link className="btn" to="/profile">Create a business profile</Link></Empty></div>;
  if (!latest || latest.status !== 'confirmed') return <div className="page"><PageHead eyebrow="Step 6" title="OPS Solutions" /><Empty title="Confirm your CAP findings first">OPS builds one corrective action for each confirmed weakness.<div style={{ marginTop: 12 }}><Link className="btn" to="/diagnosis">Go to AI Diagnosis</Link></div></Empty></div>;

  const findings = (bundle?.findings ?? []).filter((f) => f.assessment_id === latest.id && f.status === 'confirmed');
  const sols = (bundle?.solutions ?? []).filter((s) => s.assessment_id === latest.id);
  const docs = bundle?.documents ?? [];
  const uncovered = findings.filter((f) => !sols.some((s) => s.finding_id === f.id));

  async function generate() {
    setBusy('gen'); setErr(null); setAiNote(null);
    try {
      const r = await runAI<{ solutions: ReturnType<typeof templateSolutions> }>('solutions', business!.id, {
        profile: profileOf(business!),
        findings: uncovered.map((f) => ({ id: f.id, title: f.title, category: f.category, evidence: f.evidence, root_cause: f.root_cause, severity: f.severity })),
      });
      let list = r.ok && Array.isArray(r.result.solutions) && r.result.solutions.length ? r.result.solutions : null;
      let source: 'ai' | 'template' = 'ai';
      if (!list) {
        list = templateSolutions(uncovered); source = 'template';
        setAiNote(`AI was not available (${r.ok ? 'empty response' : r.message}). Corrective actions were drafted from the Mete standard library — edit them to fit the business.`);
      }
      const ids = new Set(uncovered.map((f) => f.id));
      const rows = list.map((s, i) => {
        const phase = [30, 60, 90].includes(Number(s.phase)) ? Number(s.phase) : 60;
        const fid = ids.has(s.finding_id as string) ? s.finding_id : uncovered[i]?.id ?? null;
        const f = uncovered.find((x) => x.id === fid);
        return {
          business_id: business!.id, assessment_id: latest!.id, finding_id: fid,
          problem: s.problem || f?.title || 'Corrective action', evidence: s.evidence ?? f?.evidence ?? null, root_cause: s.root_cause ?? f?.root_cause ?? null,
          corrective_action: s.corrective_action ?? null, document_type: pick(s.document_type, ['none', 'policy', 'sop'] as const, 'none'),
          document_title: s.document_title ?? null, responsible_role: s.responsible_role ?? 'Owner', priority: pick(s.priority, ['high', 'medium', 'low'] as const, 'medium'),
          phase, target_date: addDays(phase), kpi_name: s.kpi_name ?? null, kpi_baseline: num(s.kpi_baseline), kpi_target: num(s.kpi_target), kpi_unit: s.kpi_unit ?? null, source,
        };
      });
      must(await supabase.from('solutions').insert(rows).select());
      await refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not create solutions.'); } finally { setBusy(null); }
  }

  async function update(s: Solution, patch: Partial<Solution>) {
    if (patch.approval_status === 'approved') patch.approved_at = new Date().toISOString();
    const r = await supabase.from('solutions').update(patch).eq('id', s.id);
    if (r.error) setErr(r.error.message); else await refresh();
  }

  async function approveAll() {
    setBusy('approve');
    const r = await supabase.from('solutions').update({ approval_status: 'approved', approved_at: new Date().toISOString() }).eq('assessment_id', latest!.id).eq('approval_status', 'draft');
    setBusy(null);
    if (r.error) setErr(r.error.message); else await refresh();
  }

  async function addManual() {
    const r = await supabase.from('solutions').insert({ business_id: business!.id, assessment_id: latest!.id, problem: 'New corrective action', source: 'user', phase: 60, target_date: addDays(60) });
    if (r.error) setErr(r.error.message); else await refresh();
  }

  async function makeDoc(s: Solution) {
    setBusy(`doc-${s.id}`); setErr(null);
    try {
      const { doc, fallback } = await generateSolutionDoc(business!, s);
      await refresh();
      nav(`/documents/${doc.id}${fallback ? `?fallback=${encodeURIComponent(fallback)}` : ''}`);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not create the document.'); } finally { setBusy(null); }
  }

  const drafts = sols.filter((s) => s.approval_status === 'draft').length;
  const approved = sols.filter((s) => s.approval_status === 'approved').length;

  return (
    <div className="page">
      <PageHead eyebrow="Step 6 · OPS" title="OPS Solutions"
        intro="Each confirmed weakness gets one corrective-action record. Edit anything that does not fit, then approve the actions you will commit to."
        actions={<>
          {uncovered.length > 0 && <button className="btn brass" onClick={generate} disabled={!!busy}>{busy === 'gen' ? <Spinner label="Building actions…" /> : `Generate actions for ${uncovered.length} finding(s)`}</button>}
          {drafts > 0 && <button className="btn secondary" onClick={approveAll} disabled={!!busy}>Approve all {drafts} drafts</button>}
          {approved > 0 && <Link className="btn" to="/blueprint">Next: Blueprint</Link>}
        </>}
      />
      {aiNote && <Notice kind="warn">{aiNote}</Notice>}
      {err && <Notice kind="danger">{err}</Notice>}
      <div className="row small muted">{sols.length} actions · {approved} approved · {drafts} draft · {sols.filter((s) => s.approval_status === 'rejected').length} rejected</div>
      {sols.length === 0 && uncovered.length > 0 && <Empty title={`${findings.length} confirmed finding(s) ready`}>Generate corrective actions to begin.</Empty>}
      {sols.map((s) => <SolutionCard key={s.id} s={s} busy={busy} hasDoc={docs.find((d) => d.solution_id === s.id)?.id} onUpdate={update} onDoc={makeDoc} />)}
      <button className="btn ghost sm" onClick={addManual} style={{ justifySelf: 'start' }}>+ Add a corrective action</button>
    </div>
  );
}

function SolutionCard({ s, busy, hasDoc, onUpdate, onDoc }: { s: Solution; busy: string | null; hasDoc?: string; onUpdate: (s: Solution, p: Partial<Solution>) => Promise<void>; onDoc: (s: Solution) => void }) {
  const [edit, setEdit] = useState(s.problem === 'New corrective action');
  const [d, setD] = useState(s);
  useEffect(() => setD(s), [s]);
  const set = (k: keyof Solution) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value });
  const border = s.approval_status === 'approved' ? 'var(--ok)' : s.approval_status === 'rejected' ? 'var(--line)' : 'var(--brass)';

  if (edit) return (
    <div className="card stack" style={{ borderLeft: `4px solid ${border}` }}>
      <Field label="Identified problem"><input value={d.problem} onChange={set('problem')} /></Field>
      <div className="grid g2">
        <Field label="Supporting evidence"><textarea value={d.evidence ?? ''} onChange={set('evidence')} /></Field>
        <Field label="Likely root cause"><textarea value={d.root_cause ?? ''} onChange={set('root_cause')} /></Field>
      </div>
      <Field label="Recommended corrective action"><textarea rows={5} value={d.corrective_action ?? ''} onChange={set('corrective_action')} /></Field>
      <div className="grid g3">
        <Field label="Policy or SOP required"><select value={d.document_type} onChange={set('document_type')}><option value="none">None</option><option value="policy">Policy</option><option value="sop">SOP</option></select></Field>
        <Field label="Document title"><input value={d.document_title ?? ''} onChange={set('document_title')} disabled={d.document_type === 'none'} /></Field>
        <Field label="Responsible role"><input value={d.responsible_role ?? ''} onChange={set('responsible_role')} /></Field>
        <Field label="Priority"><select value={d.priority} onChange={set('priority')}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></Field>
        <Field label="Plan phase"><select value={d.phase} onChange={(e) => setD({ ...d, phase: Number(e.target.value) as Solution['phase'] })}><option value={30}>First 30 days</option><option value={60}>Days 31–60</option><option value={90}>Days 61–90</option></select></Field>
        <Field label="Target completion date"><input type="date" value={d.target_date ?? ''} onChange={set('target_date')} /></Field>
        <Field label="Performance measure (KPI)"><input value={d.kpi_name ?? ''} onChange={set('kpi_name')} /></Field>
        <Field label="Baseline" hint="Leave blank if unknown"><input type="number" value={d.kpi_baseline ?? ''} onChange={(e) => setD({ ...d, kpi_baseline: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
        <div className="grid g2">
          <Field label="Target"><input type="number" value={d.kpi_target ?? ''} onChange={(e) => setD({ ...d, kpi_target: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
          <Field label="Unit"><input value={d.kpi_unit ?? ''} onChange={set('kpi_unit')} /></Field>
        </div>
      </div>
      <div className="row">
        <button className="btn sm" onClick={async () => {
          const { id, business_id, assessment_id, finding_id, created_at, approved_at, approval_status, progress_status, source, ...patch } = d; // eslint-disable-line @typescript-eslint/no-unused-vars
          await onUpdate(s, { ...patch, target_date: patch.target_date || null }); setEdit(false);
        }}>Save</button>
        <button className="btn secondary sm" onClick={() => { setD(s); setEdit(false); }}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div className="card stack" style={{ borderLeft: `4px solid ${border}`, opacity: s.approval_status === 'rejected' ? 0.65 : 1 }}>
      <div className="row between">
        <div className="row"><strong style={{ fontSize: 16 }}>{s.problem}</strong><Chip value={s.approval_status} /><Chip value={s.priority} label={`${s.priority} priority`} />{s.source === 'template' && <Chip value="template" label="Standard library" />}</div>
        <span className="small muted">{s.phase}-day phase · due {fmtDate(s.target_date)}</span>
      </div>
      <div className="grid g2">
        <div><div className="label">Supporting evidence</div><div className="pre small">{s.evidence || '—'}</div></div>
        <div><div className="label">Likely root cause</div><div className="pre small">{s.root_cause || '—'}</div></div>
      </div>
      <div><div className="label">Corrective action</div><div className="pre">{s.corrective_action || '—'}</div></div>
      <div className="grid g4 small">
        <div><div className="label">Responsible</div>{s.responsible_role || '—'}</div>
        <div><div className="label">Policy / SOP</div>{s.document_type === 'none' ? 'None required' : `${s.document_type.toUpperCase()}: ${s.document_title ?? ''}`}</div>
        <div><div className="label">Measure</div>{s.kpi_name || '—'}</div>
        <div><div className="label">Baseline → target</div>{s.kpi_baseline ?? '?'} → {s.kpi_target ?? '?'} {s.kpi_unit ?? ''}</div>
      </div>
      <div className="row">
        {s.approval_status !== 'approved' && <button className="btn sm" onClick={() => onUpdate(s, { approval_status: 'approved' })}>Approve</button>}
        {s.approval_status !== 'rejected' && <button className="btn secondary sm" onClick={() => onUpdate(s, { approval_status: 'rejected' })}>Reject</button>}
        {s.approval_status !== 'draft' && <button className="btn ghost sm" onClick={() => onUpdate(s, { approval_status: 'draft' })}>Back to draft</button>}
        <button className="btn ghost sm" onClick={() => setEdit(true)}>Edit</button>
        {s.document_type !== 'none' && (hasDoc
          ? <Link className="btn ghost sm" to={`/documents/${hasDoc}`}>Open {s.document_type.toUpperCase()}</Link>
          : <button className="btn secondary sm" disabled={!!busy} onClick={() => onDoc(s)}>{busy === `doc-${s.id}` ? <Spinner label="Drafting…" /> : `Draft ${s.document_type.toUpperCase()}`}</button>)}
      </div>
    </div>
  );
}
