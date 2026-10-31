import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../AppContext';
import { createAssessment, loadAnswers, saveAnswer, scoreAndSave } from '../lib/data';
import { supabase } from '../lib/supabase';
import { ANSWER_LABEL } from '../lib/scoring';
import type { Answer, AnswerRow } from '../lib/types';
import { Empty, Notice, PageHead, Progress, Spinner } from '../components/ui';

type Local = Record<string, { answer: Answer | null; note: string }>;

export default function Questionnaire() {
  const { business, bundle, latest, questions, refresh } = useApp();
  const nav = useNavigate();
  const [answers, setAnswers] = useState<Local>({});
  const [prev, setPrev] = useState<Record<string, AnswerRow>>({});
  const [loaded, setLoaded] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timers = useRef<Record<string, number>>({});

  // Make sure there is an assessment to answer.
  useEffect(() => {
    if (business && bundle && bundle.assessments.length === 0 && !busy) {
      setBusy(true);
      createAssessment(business.id, 1).then(refresh).catch((e) => setErr(e.message)).finally(() => setBusy(false));
    }
  }, [business?.id, bundle]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!latest || loaded === latest.id) return;
    (async () => {
      try {
        const rows = await loadAnswers(latest.id);
        setAnswers(Object.fromEntries(rows.map((r) => [r.question_id, { answer: r.answer, note: r.note ?? '' }])));
        const before = bundle?.assessments.find((a) => a.version === latest.version - 1);
        if (before) setPrev(Object.fromEntries((await loadAnswers(before.id)).map((r) => [r.question_id, r])));
        setLoaded(latest.id);
      } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load answers.'); }
    })();
  }, [latest?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const answeredCount = useMemo(() => questions.filter((q) => answers[q.id]?.answer).length, [answers, questions]);
  const categories = useMemo(() => [...new Set(questions.map((q) => q.category))], [questions]);
  const readOnly = latest ? latest.status !== 'in_progress' : false;

  if (!business) return <div className="page"><Empty title="No business yet"><Link className="btn" to="/profile">Create a business profile</Link></Empty></div>;
  if (!latest || loaded !== latest.id) return <div className="page">{err ? <Notice kind="danger">{err}</Notice> : <Spinner label="Preparing your assessment…" />}</div>;

  async function persist(qid: string, patch: { answer?: Answer | null; note?: string }, count?: number) {
    setSaveState('saving');
    try {
      await saveAnswer(latest!.id, qid, patch);
      if (count !== undefined) await supabase.from('assessments').update({ answered_count: count }).eq('id', latest!.id);
      setSaveState('saved');
    } catch (e) { setSaveState('error'); setErr(e instanceof Error ? e.message : 'Save failed'); }
  }

  function choose(qid: string, a: Answer) {
    const next = { ...answers, [qid]: { answer: a, note: answers[qid]?.note ?? '' } };
    setAnswers(next);
    persist(qid, { answer: a }, questions.filter((q) => next[q.id]?.answer).length);
  }

  function note(qid: string, text: string) {
    setAnswers((s) => ({ ...s, [qid]: { answer: s[qid]?.answer ?? null, note: text } }));
    window.clearTimeout(timers.current[qid]);
    timers.current[qid] = window.setTimeout(() => persist(qid, { note: text }), 700);
  }

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const s = await scoreAndSave(latest!, questions);
      if (!s.complete) { setErr(`${s.missing.length} question(s) still need an answer.`); return; }
      await refresh();
      nav('/results');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not score.'); } finally { setBusy(false); }
  }

  async function reassess() {
    setBusy(true);
    try { await createAssessment(business!.id, latest!.version + 1); setLoaded(null); await refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not start a reassessment.'); }
    finally { setBusy(false); }
  }

  const firstOpen = questions.find((q) => !answers[q.id]?.answer);

  return (
    <div className="page">
      <PageHead
        eyebrow={`CAP assessment · version ${latest.version}`}
        title="CAP Questionnaire"
        intro="Answer each question honestly: Yes, Partially, No, or Not applicable. Your answers save automatically, so you can stop and come back."
        actions={readOnly
          ? <><Link className="btn secondary" to="/results">View results</Link><button className="btn" onClick={reassess} disabled={busy}>Start reassessment</button></>
          : firstOpen ? <a className="btn secondary" href={`#q-${firstOpen.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`q-${firstOpen.id}`)?.scrollIntoView({ behavior: 'smooth' }); }}>Jump to next unanswered</a> : null}
      />
      {readOnly && <Notice>This assessment version has been scored and is locked so results stay traceable. Start a reassessment to answer again as a new version.</Notice>}
      <div className="card" style={{ position: 'sticky', top: 0, zIndex: 5 }}>
        <Progress value={(answeredCount / Math.max(1, questions.length)) * 100} label={`${answeredCount} of ${questions.length} answered`} />
        <div className="row between" style={{ marginTop: 8 }}>
          <span className="save-state" aria-live="polite">{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'All changes saved' : saveState === 'error' ? 'Not saved — check your connection' : ''}</span>
          {!readOnly && <button className="btn brass" onClick={submit} disabled={busy || answeredCount < questions.length}>{busy ? 'Scoring…' : 'Score my assessment'}</button>}
        </div>
      </div>
      {err && <Notice kind="danger">{err}</Notice>}
      {categories.map((cat, ci) => (
        <section key={cat} className="stack" aria-labelledby={`cat-${ci}`}>
          <h2 id={`cat-${ci}`} className="h2">{ci + 1}. {cat}</h2>
          {questions.filter((q) => q.category === cat).map((q, i) => {
            const a = answers[q.id]?.answer ?? null;
            const p = prev[q.id];
            return (
              <fieldset key={q.id} id={`q-${q.id}`} className={`card q-card stack ${a ? 'answered' : ''}`} disabled={readOnly} style={{ margin: 0 }}>
                <legend className="sr-only" style={{ position: 'absolute', left: -9999 }}>{q.question}</legend>
                <div className="row between"><span className="label">{q.id} · Question {ci * 4 + i + 1}</span>{p?.answer && <span className="chip">Last time: {ANSWER_LABEL[p.answer]}</span>}</div>
                <div style={{ fontWeight: 600 }}>{q.question}</div>
                {q.guidance && <div className="small muted">{q.guidance}</div>}
                <div className="answers" role="radiogroup" aria-label={q.question}>
                  {(['yes', 'partial', 'no', 'na'] as Answer[]).map((opt) => (
                    <label key={opt}>
                      <input type="radio" name={q.id} checked={a === opt} onChange={() => choose(q.id, opt)} />
                      <span>{ANSWER_LABEL[opt]}</span>
                    </label>
                  ))}
                </div>
                <details open={!!answers[q.id]?.note}>
                  <summary className="small">Add a note (optional — helps the diagnosis)</summary>
                  <textarea style={{ marginTop: 8 }} aria-label={`Note for ${q.id}`} value={answers[q.id]?.note ?? ''} onChange={(e) => note(q.id, e.target.value)} placeholder="Anything that explains your answer" />
                </details>
              </fieldset>
            );
          })}
        </section>
      ))}
      {!readOnly && <div className="row"><button className="btn brass" onClick={submit} disabled={busy || answeredCount < questions.length}>{busy ? 'Scoring…' : 'Score my assessment'}</button>{answeredCount < questions.length && <span className="small muted">{questions.length - answeredCount} left to answer</span>}</div>}
    </div>
  );
}
