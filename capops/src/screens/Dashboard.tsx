import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../AppContext';
import { activeCycle, createAssessment } from '../lib/data';
import { supabase } from '../lib/supabase';
import type { KpiEntry, Solution } from '../lib/types';
import { AXIS, Chip, Empty, Field, Notice, PageHead, Progress, SERIES, fmtDate } from '../components/ui';

export function lowerIsBetter(s: Solution) {
  if (s.kpi_baseline !== null && s.kpi_target !== null && s.kpi_target !== s.kpi_baseline) return s.kpi_target < s.kpi_baseline;
  return /complaint|rework|defect|overdue|late|error|days to|cost|missed/i.test(s.kpi_name ?? '');
}
export function kpiMet(s: Solution, v: number | undefined) {
  if (v === undefined || s.kpi_target === null) return null;
  return lowerIsBetter(s) ? v <= s.kpi_target : v >= s.kpi_target;
}

export default function Dashboard() {
  const { business, bundle, latest, refresh } = useApp();
  const nav = useNavigate();
  const [sel, setSel] = useState<string>('');
  const [form, setForm] = useState({ value: '', date: new Date().toISOString().slice(0, 10), note: '' });
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!business || !bundle) return <div className="page"><Empty title="No business yet"><Link className="btn" to="/profile">Create a business profile</Link></Empty></div>;

  const scored = bundle.assessments.filter((a) => a.overall_pct !== null && a.status !== 'in_progress');
  const cur = scored[scored.length - 1];
  const prev = scored[scored.length - 2];
  // Track the plan of the most recent assessment that has approved actions.
  const planAssess = activeCycle(bundle);
  const sols = bundle.solutions.filter((s) => s.assessment_id === planAssess?.id && s.approval_status === 'approved');
  const plan = bundle.plans.find((p) => p.assessment_id === planAssess?.id);
  const done = sols.filter((s) => s.progress_status === 'done').length;
  const overdue = sols.filter((s) => s.progress_status !== 'done' && s.target_date && new Date(`${s.target_date}T23:59:59`) < new Date()).length;
  const kpiSols = sols.filter((s) => s.kpi_name);
  const entriesFor = (id: string) => bundle.kpis.filter((k) => k.solution_id === id);
  const lastVal = (id: string) => { const e = entriesFor(id); return e.length ? e[e.length - 1].value : undefined; };
  const met = kpiSols.filter((s) => kpiMet(s, lastVal(s.id)) === true).length;
  const selected = kpiSols.find((s) => s.id === sel) ?? kpiSols[0];

  async function addEntry(e: FormEvent) {
    e.preventDefault(); setErr(null); setOk(null);
    if (!selected) return;
    const v = Number(form.value);
    if (form.value === '' || Number.isNaN(v)) { setErr('Enter a number for the KPI value.'); return; }
    const r = await supabase.from('kpi_entries').insert({ business_id: business!.id, solution_id: selected.id, kpi_name: selected.kpi_name, value: v, recorded_on: form.date, note: form.note || null });
    if (r.error) setErr(r.error.message); else { setForm({ ...form, value: '', note: '' }); setOk('Measurement saved.'); await refresh(); }
  }
  async function delEntry(k: KpiEntry) {
    const r = await supabase.from('kpi_entries').delete().eq('id', k.id);
    if (r.error) setErr(r.error.message); else await refresh();
  }
  async function reassess() {
    if (!latest) return;
    if (latest.status === 'in_progress') { nav('/cap'); return; }
    setBusy(true);
    try { await createAssessment(business!.id, latest.version + 1); await refresh(); nav('/cap'); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not start a reassessment.'); } finally { setBusy(false); }
  }

  const compare = cur?.category_scores?.map((c) => ({ name: c.category, current: c.pct ?? 0, previous: prev?.category_scores?.find((p) => p.category === c.category)?.pct ?? null })) ?? [];
  const kpiData = selected ? entriesFor(selected.id).map((k) => ({ date: k.recorded_on, value: Number(k.value) })) : [];

  return (
    <div className="page">
      <PageHead eyebrow="Step 9 · Monitor" title="Performance Dashboard" intro="Track implementation, record KPI results, and reassess to see whether scores improve."
        actions={<button className="btn brass" onClick={reassess} disabled={busy || !latest}>{latest?.status === 'in_progress' && latest.version > 1 ? 'Continue reassessment' : 'Start reassessment'}</button>} />
      {err && <Notice kind="danger">{err}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

      <div className="grid g4">
        <div className="card stack"><span className="label">CAP score</span><span className="figure">{cur ? `${cur.overall_pct}%` : '—'}</span><span className="small muted">{cur ? (prev ? `${(cur.overall_pct! - prev.overall_pct!) >= 0 ? '▲' : '▼'} ${Math.abs(Math.round((cur.overall_pct! - prev.overall_pct!) * 10) / 10)} pts vs version ${prev.version}` : `Version ${cur.version} · first score`) : 'Not scored yet'}</span></div>
        <div className="card stack"><span className="label">Plan progress</span><span className="figure">{sols.length ? `${Math.round((done / sols.length) * 100)}%` : '—'}</span><span className="small muted">{done} of {sols.length} actions done · plan {plan?.status ?? 'not created'}</span></div>
        <div className="card stack"><span className="label">Overdue actions</span><span className="figure" style={{ color: overdue ? 'var(--danger)' : undefined }}>{overdue}</span><span className="small muted">{overdue ? 'Past their target date' : 'Nothing overdue'}</span></div>
        <div className="card stack"><span className="label">KPIs at target</span><span className="figure">{kpiSols.length ? `${met}/${kpiSols.length}` : '—'}</span><span className="small muted">Based on latest measurement</span></div>
      </div>

      {sols.length > 0 && (
        <div className="card stack">
          <div className="h2">Implementation progress by phase</div>
          {[30, 60, 90].map((p) => { const xs = sols.filter((s) => s.phase === p); return xs.length ? <Progress key={p} value={(xs.filter((s) => s.progress_status === 'done').length / xs.length) * 100} label={`${p === 30 ? 'Days 1–30' : p === 60 ? 'Days 31–60' : 'Days 61–90'} · ${xs.filter((s) => s.progress_status === 'done').length}/${xs.length}`} /> : null; })}
          {plan?.status === 'draft' && <Notice kind="warn">The plan has not been approved yet. <Link to="/plan">Approve it</Link> to start tracking status.</Notice>}
        </div>
      )}

      <div className="card stack">
        <div className="h2">KPI tracking</div>
        {kpiSols.length === 0 ? <p className="muted small">KPIs come from approved OPS actions. <Link to="/ops">Add measures to your actions</Link>.</p> : (<>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Measure</th><th>Action owner</th><th>Baseline</th><th>Target</th><th>Latest</th><th>Status</th></tr></thead>
              <tbody>{kpiSols.map((s) => { const v = lastVal(s.id); const m = kpiMet(s, v); return (
                <tr key={s.id} style={{ cursor: 'pointer', background: selected?.id === s.id ? 'var(--navy-tint)' : undefined }} onClick={() => setSel(s.id)}>
                  <td><button className="btn ghost sm" style={{ padding: 0 }} onClick={() => setSel(s.id)}>{s.kpi_name}</button><div className="small muted">{s.problem}</div></td>
                  <td>{s.responsible_role}</td><td>{s.kpi_baseline ?? '—'}</td><td>{s.kpi_target ?? '—'} {s.kpi_unit}</td><td>{v ?? '—'}</td>
                  <td>{m === null ? <span className="chip">No data</span> : m ? <Chip value="done" label="At target" /> : <Chip value="medium" label="Below target" />}</td>
                </tr>); })}</tbody>
            </table>
          </div>
          {selected && (
            <div className="grid g2" style={{ alignItems: 'start' }}>
              <div>
                <div className="label" style={{ marginBottom: 8 }}>{selected.kpi_name} {selected.kpi_unit ? `(${selected.kpi_unit})` : ''}</div>
                {kpiData.length === 0 ? <div className="empty small">No measurements yet. Record the first one to start the trend.</div> : (
                  <div style={{ height: 240 }}>
                    <ResponsiveContainer>
                      <LineChart data={kpiData} margin={{ top: 10, right: 40, left: 0, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="#e2dccf" />
                        <XAxis dataKey="date" tick={AXIS} stroke={AXIS.stroke} tickFormatter={(d) => fmtDate(d)} />
                        <YAxis tick={AXIS} stroke={AXIS.stroke} />
                        <Tooltip labelFormatter={(d) => fmtDate(String(d))} formatter={(v: number) => [`${v} ${selected.kpi_unit ?? ''}`, selected.kpi_name]} />
                        {selected.kpi_target !== null && <ReferenceLine y={selected.kpi_target} stroke="#566172" strokeDasharray="4 4" label={{ value: `Target ${selected.kpi_target}`, position: 'right', fill: '#566172', fontSize: 11 }} />}
                        <Line isAnimationActive={false} type="monotone" dataKey="value" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 4, fill: SERIES[0], stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
              <form className="stack" onSubmit={addEntry}>
                <div className="grid g2">
                  <Field label="Value"><input type="number" step="any" required value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></Field>
                  <Field label="Date"><input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
                </div>
                <Field label="Note (optional)"><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
                <button className="btn">Record measurement</button>
                {entriesFor(selected.id).slice(-5).reverse().map((k) => (
                  <div key={k.id} className="row between small" style={{ borderTop: '1px solid var(--line)', paddingTop: 6 }}><span>{fmtDate(k.recorded_on)} · <strong>{k.value}</strong>{k.note ? ` · ${k.note}` : ''}</span><button type="button" className="btn ghost sm" onClick={() => delEntry(k)}>Remove</button></div>
                ))}
              </form>
            </div>
          )}
        </>)}
      </div>

      <div className="card stack">
        <div className="h2">Assessment history</div>
        {scored.length === 0 ? <p className="muted small">No scored assessments yet.</p> : (
          <div className="grid g2">
            <div>
              <div className="label" style={{ marginBottom: 8 }}>Overall CAP score by version</div>
              <div style={{ height: 240 }}>
                <ResponsiveContainer>
                  <LineChart data={scored.map((a) => ({ v: `v${a.version}`, pct: a.overall_pct, date: fmtDate(a.scored_at) }))} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e2dccf" />
                    <XAxis dataKey="v" tick={AXIS} stroke={AXIS.stroke} />
                    <YAxis domain={[0, 100]} unit="%" tick={AXIS} stroke={AXIS.stroke} />
                    <Tooltip formatter={(v: number) => [`${v}%`, 'Overall']} labelFormatter={(l, p) => `${l} · ${p?.[0]?.payload?.date ?? ''}`} />
                    <Line isAnimationActive={false} dataKey="pct" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 4, fill: SERIES[0], stroke: '#fff', strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <div className="label" style={{ marginBottom: 8 }}>{prev ? `Category scores: version ${prev.version} vs ${cur.version}` : `Category scores: version ${cur.version}`}</div>
              <div style={{ height: 240 }}>
                <ResponsiveContainer>
                  <BarChart data={compare} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barGap={2}>
                    <CartesianGrid vertical={false} stroke="#e2dccf" />
                    <XAxis dataKey="name" tick={{ ...AXIS, fontSize: 10 }} stroke={AXIS.stroke} interval={0} tickFormatter={(n: string) => n.split(' ')[0]} />
                    <YAxis domain={[0, 100]} unit="%" tick={AXIS} stroke={AXIS.stroke} />
                    <Tooltip cursor={{ fill: '#e6eaf2' }} formatter={(v, n) => [v === null || v === undefined ? '—' : `${v}%`, n]} />
                    {prev && <Legend wrapperStyle={{ fontSize: 12, color: '#232c3a' }} />}
                    {prev && <Bar isAnimationActive={false} dataKey="previous" name={`Version ${prev.version}`} fill={SERIES[1]} radius={[4, 4, 0, 0]} />}
                    <Bar isAnimationActive={false} dataKey="current" name={`Version ${cur.version}`} fill={SERIES[0]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
