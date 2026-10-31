import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../AppContext';
import { runAI } from '../lib/ai';
import { supabase, must } from '../lib/supabase';
import { templateFindings, templateFollowups } from '../lib/templates';
import type { DiagnosisQuestion, Finding } from '../lib/types';
import { profileOf } from '../lib/profile';
import { Chip, Empty, Field, Notice, PageHead, Spinner } from '../components/ui';


export default function Diagnosis() {
  const { business, latest, bundle, refresh } = useApp();
  const nav = useNavigate();
  const [qs, setQs] = useState<DiagnosisQuestion[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState('');
  const timers = useRef<Record<string, number>>({});
  const [newQ, setNewQ] = useState('');

  const findings = (bundle?.findings ?? []).filter((f) => f.assessment_id === latest?.id);
  const ready = latest && latest.status !== 'in_progress';

  useEffect(() => {
    if (!latest) return;
    supabase.from('diagnosis_questions').select('*').eq('assessment_id', latest.id).order('sort_order').order('created_at')
      .then((r) => { if (r.error) setErr(r.error.message); else setQs(r.data as DiagnosisQuestion[]); });
  }, [latest?.id]);

  if (!business) return <div className="page"><Empty title="No business yet"><Link className="btn" to="/profile">Create a business profile</Link></Empty></div>;
  if (!ready) return <div className="page"><PageHead eyebrow="Step 5" title="AI Diagnosis" /><Empty title="Score your CAP assessment first">The diagnosis starts from your lowest-scoring answers.<div style={{ marginTop: 12 }}><Link className="btn" to="/cap">Go to the questionnaire</Link></div></Empty></div>;
  if (qs === null) return <div className="page"><Spinner /></div>;

  const priorities = latest!.priorities ?? [];
  const locked = latest!.status === 'confirmed';

  async function genFollowups() {
    setBusy('followups'); setErr(null); setAiNote(null);
    try {
      let list: { cap_question_id: string; question: string; purpose?: string }[];
      let source: 'ai' | 'template' = 'ai';
      const r = await runAI<{ questions: typeof list }>('followups', business!.id, { profile: profileOf(business!), priorities });
      const valid = new Set(priorities.map((p) => p.question_id));
      if (r.ok && Array.isArray(r.result.questions) && r.result.questions.length) {
        list = r.result.questions.filter((q) => q.question).map((q) => ({ ...q, cap_question_id: valid.has(q.cap_question_id) ? q.cap_question_id : priorities[0]?.question_id }));
      } else {
        list = templateFollowups(priorities); source = 'template';
        setAiNote(`AI was not available (${r.ok ? 'empty response' : r.message}). These follow-up questions come from the Mete standard library.`);
      }
      await supabase.from('diagnosis_questions').delete().eq('assessment_id', latest!.id).neq('source', 'user');
      const rows = list.map((q, i) => ({ assessment_id: latest!.id, cap_question_id: q.cap_question_id ?? null, question: q.question, purpose: q.purpose ?? null, source, sort_order: i }));
      must(await supabase.from('diagnosis_questions').insert(rows).select());
      const r2 = must(await supabase.from('diagnosis_questions').select('*').eq('assessment_id', latest!.id).order('sort_order').order('created_at'));
      setQs(r2 as DiagnosisQuestion[]);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not create follow-up questions.'); } finally { setBusy(null); }
  }

  function answer(id: string, text: string) {
    setQs((list) => list!.map((q) => (q.id === id ? { ...q, answer: text } : q)));
    window.clearTimeout(timers.current[id]);
    setSaved('Saving…');
    timers.current[id] = window.setTimeout(async () => {
      const r = await supabase.from('diagnosis_questions').update({ answer: text }).eq('id', id);
      setSaved(r.error ? 'Not saved — check your connection' : 'All changes saved');
    }, 700);
  }

  async function addQuestion() {
    if (!newQ.trim()) return;
    const r = await supabase.from('diagnosis_questions').insert({ assessment_id: latest!.id, question: newQ.trim(), source: 'user', sort_order: 999 }).select().single();
    if (r.error) setErr(r.error.message); else { setQs([...(qs ?? []), r.data as DiagnosisQuestion]); setNewQ(''); }
  }

  async function genFindings() {
    setBusy('findings'); setErr(null); setAiNote(null);
    try {
      const followups = qs!.map((q) => ({ cap_question_id: q.cap_question_id, question: q.question, answer: q.answer }));
      const r = await runAI<{ findings: ReturnType<typeof templateFindings> }>('findings', business!.id, { profile: profileOf(business!), scores: latest!.category_scores, priorities, followups });
      let list = r.ok && Array.isArray(r.result.findings) && r.result.findings.length ? r.result.findings : null;
      let source: 'ai' | 'template' = 'ai';
      if (!list) {
        list = templateFindings(priorities, followups); source = 'template';
        setAiNote(`AI was not available (${r.ok ? 'empty response' : r.message}). Findings were drafted from your answers using Mete standard rules — review each one carefully.`);
      }
      await supabase.from('findings').delete().eq('assessment_id', latest!.id).eq('status', 'proposed');
      const norm = (v: string, ok: string[], d: string) => (ok.includes(v) ? v : d);
      const rows = list.map((f) => ({
        assessment_id: latest!.id, business_id: business!.id, title: f.title || 'Untitled weakness', category: f.category ?? null,
        cap_question_ids: Array.isArray(f.cap_question_ids) ? f.cap_question_ids : [], evidence: f.evidence ?? null, root_cause: f.root_cause ?? null,
        confidence: norm(f.confidence, ['low', 'medium', 'high'], 'medium'), severity: norm(f.severity, ['low', 'medium', 'high', 'critical'], 'medium'), source,
      }));
      must(await supabase.from('findings').insert(rows).select());
      if (latest!.status === 'scored') await supabase.from('assessments').update({ status: 'diagnosed' }).eq('id', latest!.id);
      await refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not create findings.'); } finally { setBusy(null); }
  }

  async function updateFinding(f: Finding, patch: Partial<Finding>) {
    const r = await supabase.from('findings').update(patch).eq('id', f.id);
    if (r.error) setErr(r.error.message); else await refresh();
  }

  async function addFinding() {
    const r = await supabase.from('findings').insert({ assessment_id: latest!.id, business_id: business!.id, title: 'New weakness', source: 'user' });
    if (r.error) setErr(r.error.message); else await refresh();
  }

  async function confirmAll() {
    setBusy('confirm');
    const r = await supabase.from('assessments').update({ status: 'confirmed', confirmed_at: new Date().toISOString() }).eq('id', latest!.id);
    setBusy(null);
    if (r.error) setErr(r.error.message); else { await refresh(); nav('/ops'); }
  }

  const answered = qs.filter((q) => q.answer?.trim()).length;
  const confirmed = findings.filter((f) => f.status === 'confirmed');
  const pending = findings.filter((f) => f.status === 'proposed');

  return (
    <div className="page">
      <PageHead eyebrow={`Step 5 · Assessment version ${latest!.version}`} title="AI Diagnosis"
        intro="A low score shows where to look; it does not prove why. Answer the follow-up questions so the real root causes can be identified, then confirm the findings you agree with." />
      {aiNote && <Notice kind="warn">{aiNote}</Notice>}
      {err && <Notice kind="danger">{err}</Notice>}
      {locked && <Notice kind="ok">Findings were confirmed on {new Date(latest!.confirmed_at!).toLocaleDateString()}. Continue to <Link to="/ops">OPS Solutions</Link>.</Notice>}

      {priorities.length === 0 ? (
        <div className="card stack"><Notice kind="ok">This assessment has no No or Partially answers, so there is nothing to diagnose.</Notice>{!locked && <button className="btn" onClick={confirmAll}>Mark CAP complete</button>}</div>
      ) : (<>
        <section className="card stack">
          <div className="row between">
            <div><div className="h2">1. Follow-up questions</div><div className="small muted">{qs.length ? `${answered} of ${qs.length} answered · ` : ''}<span aria-live="polite">{saved}</span></div></div>
            {!locked && <button className="btn secondary" onClick={genFollowups} disabled={!!busy}>{busy === 'followups' ? <Spinner label="Writing questions…" /> : qs.length ? 'Regenerate questions' : 'Generate follow-up questions'}</button>}
          </div>
          {qs.length === 0 && <p className="muted small">Generates 1–2 root-cause questions for each of your {priorities.length} investigation priorities.</p>}
          {qs.map((q, i) => {
            const p = priorities.find((x) => x.question_id === q.cap_question_id);
            return (
              <div key={q.id} className="stack" style={{ gap: 6, borderTop: i ? '1px solid var(--line)' : 0, paddingTop: i ? 12 : 0 }}>
                <div className="row"><span className="label">{p ? `${q.cap_question_id} · ${p.weakness_label}` : 'Owner observation'}</span><Chip value={q.source} label={q.source === 'ai' ? 'AI' : q.source === 'template' ? 'Standard' : 'Added by you'} /></div>
                <label htmlFor={`dq-${q.id}`} style={{ fontWeight: 600 }}>{q.question}</label>
                {q.purpose && <div className="small muted">Why we ask: {q.purpose}</div>}
                <textarea id={`dq-${q.id}`} disabled={locked} value={q.answer ?? ''} onChange={(e) => answer(q.id, e.target.value)} placeholder="Your answer (a few sentences is enough)" />
              </div>
            );
          })}
          {!locked && qs.length > 0 && (
            <div className="row"><input aria-label="Add your own observation" value={newQ} onChange={(e) => setNewQ(e.target.value)} placeholder="Add something else we should know (optional)" style={{ flex: 1, minWidth: 220 }} /><button className="btn secondary sm" onClick={addQuestion}>Add</button></div>
          )}
        </section>

        <section className="card stack">
          <div className="row between">
            <div><div className="h2">2. Findings</div><div className="small muted">{confirmed.length} confirmed · {pending.length} awaiting review</div></div>
            {!locked && <button className="btn secondary" onClick={genFindings} disabled={!!busy || qs.length === 0}>{busy === 'findings' ? <Spinner label="Analyzing…" /> : findings.length ? 'Re-analyze (replaces unreviewed)' : 'Analyze answers'}</button>}
          </div>
          {qs.length > 0 && answered < qs.length && !locked && <Notice kind="warn">{qs.length - answered} follow-up question(s) are unanswered. Findings will be marked lower confidence where answers are missing.</Notice>}
          {findings.map((f) => <FindingCard key={f.id} f={f} locked={locked} onChange={updateFinding} />)}
          {!locked && findings.length > 0 && <button className="btn ghost sm" onClick={addFinding}>+ Add a finding</button>}
        </section>

        {!locked && (
          <div className="card row between">
            <div className="small">{pending.length ? `Review the ${pending.length} remaining finding(s) — confirm or dismiss each — before continuing.` : confirmed.length ? 'All findings reviewed.' : 'Confirm at least one finding to continue.'}</div>
            <button className="btn brass" disabled={!!busy || pending.length > 0 || confirmed.length === 0} onClick={confirmAll}>Confirm CAP findings and go to OPS</button>
          </div>
        )}
      </>)}
    </div>
  );
}

function FindingCard({ f, locked, onChange }: { f: Finding; locked: boolean; onChange: (f: Finding, p: Partial<Finding>) => Promise<void> }) {
  const [edit, setEdit] = useState(false);
  const [d, setD] = useState(f);
  useEffect(() => setD(f), [f]);
  const border = f.status === 'confirmed' ? 'var(--ok)' : f.status === 'dismissed' ? 'var(--line)' : 'var(--brass)';
  return (
    <div className="card stack" style={{ borderLeft: `4px solid ${border}`, opacity: f.status === 'dismissed' ? 0.65 : 1 }}>
      <div className="row between">
        <div className="row"><strong>{f.title}</strong><Chip value={f.status} /><Chip value={f.severity} label={`${f.severity} severity`} /><span className="chip">{f.confidence} confidence</span>{f.source !== 'ai' && <Chip value={f.source} label={f.source === 'template' ? 'Standard rules' : 'Added by you'} />}</div>
        <span className="small muted">{f.category}</span>
      </div>
      {edit ? (
        <div className="stack">
          <Field label="Weakness"><input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></Field>
          <Field label="Category"><input value={d.category ?? ''} onChange={(e) => setD({ ...d, category: e.target.value })} /></Field>
          <Field label="Supporting evidence"><textarea value={d.evidence ?? ''} onChange={(e) => setD({ ...d, evidence: e.target.value })} /></Field>
          <Field label="Likely root cause"><textarea value={d.root_cause ?? ''} onChange={(e) => setD({ ...d, root_cause: e.target.value })} /></Field>
          <div className="grid g2">
            <Field label="Severity"><select value={d.severity} onChange={(e) => setD({ ...d, severity: e.target.value as Finding['severity'] })}>{['low', 'medium', 'high', 'critical'].map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Confidence"><select value={d.confidence} onChange={(e) => setD({ ...d, confidence: e.target.value as Finding['confidence'] })}>{['low', 'medium', 'high'].map((x) => <option key={x}>{x}</option>)}</select></Field>
          </div>
          <div className="row"><button className="btn sm" onClick={async () => { await onChange(f, { title: d.title, category: d.category, evidence: d.evidence, root_cause: d.root_cause, severity: d.severity, confidence: d.confidence }); setEdit(false); }}>Save</button><button className="btn secondary sm" onClick={() => { setD(f); setEdit(false); }}>Cancel</button></div>
        </div>
      ) : (
        <>
          <div><div className="label">Supporting evidence</div><div className="pre small">{f.evidence || '—'}</div></div>
          <div><div className="label">Likely root cause</div><div className="pre">{f.root_cause || '—'}</div></div>
          {!locked && (
            <div className="row">
              {f.status !== 'confirmed' && <button className="btn sm" onClick={() => onChange(f, { status: 'confirmed' })}>Confirm</button>}
              {f.status !== 'dismissed' && <button className="btn secondary sm" onClick={() => onChange(f, { status: 'dismissed' })}>Dismiss</button>}
              {f.status !== 'proposed' && <button className="btn ghost sm" onClick={() => onChange(f, { status: 'proposed' })}>Undo</button>}
              <button className="btn ghost sm" onClick={() => setEdit(true)}>Edit</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
