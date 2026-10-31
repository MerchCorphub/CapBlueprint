import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../AppContext';
import { capReport, loadAnswers } from '../lib/data';
import { downloadDocx, downloadPdf, slug } from '../lib/export';
import { ANSWER_LABEL } from '../lib/scoring';
import type { Assessment } from '../lib/types';
import { AXIS, Chip, Empty, Notice, PageHead, ScoreRing, SERIES, fmtDate } from '../components/ui';

export default function Results() {
  const { business, bundle, latest, questions } = useApp();
  const scored = (bundle?.assessments ?? []).filter((a) => a.status !== 'in_progress');
  const [selId, setSelId] = useState<string | null>(null);
  const a: Assessment | undefined = scored.find((x) => x.id === selId) ?? scored[scored.length - 1];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setSelId(null); }, [business?.id]);

  if (!business) return <div className="page"><Empty title="No business yet"><Link className="btn" to="/profile">Create a business profile</Link></Empty></div>;
  if (!a) return <div className="page"><PageHead eyebrow="Step 4" title="CAP Results" /><Empty title="No scored assessment yet">Finish all 20 questions, then choose Score my assessment.<div style={{ marginTop: 12 }}><Link className="btn" to="/cap">Go to the questionnaire</Link></div></Empty></div>;

  const cats = a.category_scores ?? [];
  const pri = a.priorities ?? [];
  const overallRating = cats.length ? (a.overall_pct === null ? 'Not scored' : a.overall_pct >= 80 ? 'Strong' : a.overall_pct >= 60 ? 'Stable' : a.overall_pct >= 40 ? 'At risk' : 'Critical') : '';
  const weakest = [...cats].filter((c) => c.pct !== null).sort((x, y) => x.pct! - y.pct!)[0];

  async function download(kind: 'pdf' | 'docx') {
    setBusy(true); setErr(null);
    try {
      const answers = await loadAnswers(a!.id);
      const model = capReport(business!, a!, questions, answers, bundle?.findings ?? []);
      const name = `${slug(business!.name)}-cap-report-v${a!.version}`;
      if (kind === 'pdf') downloadPdf(model, name); else await downloadDocx(model, name);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Download failed'); } finally { setBusy(false); }
  }

  return (
    <div className="page">
      <PageHead
        eyebrow={`Step 4 · Assessment version ${a.version} · ${fmtDate(a.scored_at)}`}
        title="CAP Results"
        intro="Scores show where the business is weakest. They are signals to investigate — the diagnosis step confirms the real causes before anything is fixed."
        actions={<>
          {scored.length > 1 && (
            <select aria-label="Assessment version" value={a.id} onChange={(e) => setSelId(e.target.value)} style={{ width: 'auto' }}>
              {scored.map((x) => <option key={x.id} value={x.id}>Version {x.version} · {x.overall_pct}%</option>)}
            </select>
          )}
          <button className="btn secondary" disabled={busy} onClick={() => download('pdf')}>CAP report (PDF)</button>
          <button className="btn secondary" disabled={busy} onClick={() => download('docx')}>CAP report (Word)</button>
          {a.id === latest?.id && <Link className="btn brass" to="/diagnosis">Start AI Diagnosis</Link>}
        </>}
      />
      {err && <Notice kind="danger">{err}</Notice>}
      <div className="grid g3">
        <div className="card row" style={{ gap: 20 }}>
          <ScoreRing pct={a.overall_pct} label="Overall" />
          <div className="stack" style={{ gap: 6 }}>
            <Chip value={overallRating} />
            <div className="small muted">{a.answered_count} of {questions.length} answered</div>
            <div className="small muted">{cats.reduce((n, c) => n + c.na, 0)} marked not applicable (excluded)</div>
          </div>
        </div>
        <div className="card stack">
          <span className="label">Weakest category</span>
          <div className="h2">{weakest?.category ?? '—'}</div>
          <div className="figure">{weakest?.pct ?? '—'}%</div>
        </div>
        <div className="card stack">
          <span className="label">Investigation priorities</span>
          <div className="figure">{pri.length}</div>
          <div className="small muted">{pri.filter((p) => p.answer === 'no').length} answered No · {pri.filter((p) => p.answer === 'partial').length} Partially</div>
        </div>
      </div>

      <div className="card">
        <div className="h2">Score by category</div>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={cats.map((c) => ({ name: c.category, pct: c.pct ?? 0, rating: c.rating }))} layout="vertical" margin={{ left: 20, right: 60, top: 8, bottom: 8 }}>
              <CartesianGrid horizontal={false} stroke="#e2dccf" />
              <XAxis type="number" domain={[0, 100]} tick={AXIS} stroke={AXIS.stroke} unit="%" />
              <YAxis type="category" dataKey="name" width={150} tick={AXIS} stroke={AXIS.stroke} />
              <Tooltip cursor={{ fill: '#e6eaf2' }} formatter={(v: number, _n, p) => [`${v}% · ${p.payload.rating}`, 'Score']} />
              <Bar isAnimationActive={false} dataKey="pct" fill={SERIES[0]} radius={[0, 4, 4, 0]} barSize={22}>
                <LabelList dataKey="pct" position="right" formatter={(v: number) => `${v}%`} style={{ fill: '#232c3a', fontSize: 12, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Category</th><th>Score</th><th>Rating</th><th>Points</th><th>Answered</th><th>N/A</th></tr></thead>
            <tbody>{cats.map((c) => <tr key={c.category}><td>{c.category}</td><td>{c.pct ?? '—'}%</td><td><Chip value={c.rating} /></td><td>{c.points}/{c.possible}</td><td>{c.answered}/{c.total}</td><td>{c.na}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="small muted">Ratings: Strong 80%+, Stable 60–79%, At risk 40–59%, Critical below 40%. Yes = 2, Partially = 1, No = 0. Not applicable answers are excluded from the total.</p>
      </div>

      <div className="card">
        <div className="h2">Preliminary weakness findings — where to investigate</div>
        {pri.length === 0 ? <Notice kind="ok">No No or Partially answers. Keep monitoring and reassess in 90 days.</Notice> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Signal</th><th>Category</th><th>Answer</th><th>Owner note</th></tr></thead>
              <tbody>{pri.map((p) => (
                <tr key={p.question_id}><td>{p.rank}</td><td><strong>{p.weakness_label}</strong><div className="small muted">{p.question}</div></td><td>{p.category}</td><td><Chip value={p.answer === 'no' ? 'high' : 'medium'} label={ANSWER_LABEL[p.answer]} /></td><td className="small">{p.note ?? '—'}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
