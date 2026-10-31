import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../AppContext';
import { capReport, consolidatedReport, loadAnswers, loadCurrentContent } from '../lib/data';
import { docToReport, downloadDocx, downloadPdf, slug, type ReportModel } from '../lib/export';
import { supabase } from '../lib/supabase';
import type { DocumentRow } from '../lib/types';
import { Chip, Empty, Notice, PageHead, fmtDate } from '../components/ui';

const TYPE = { policy: 'Policy', sop: 'SOP', blueprint: 'Blueprint' };

export default function Reports() {
  const { business, bundle, questions } = useApp();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [runs, setRuns] = useState<{ id: string; action: string; status: string; message: string | null; created_at: string }[]>([]);

  useEffect(() => {
    if (!business) return;
    supabase.from('ai_runs').select('*').eq('business_id', business.id).order('created_at', { ascending: false }).limit(8).then((r) => setRuns(r.data ?? []));
  }, [business?.id, bundle]);

  if (!business || !bundle) return <div className="page"><Empty title="No business yet"><Link className="btn" to="/profile">Create a business profile</Link></Empty></div>;

  async function go(key: string, build: () => Promise<ReportModel>, name: string, kind: 'pdf' | 'docx') {
    setBusy(key + kind); setErr(null);
    try { const m = await build(); if (kind === 'pdf') downloadPdf(m, name); else await downloadDocx(m, name); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Download failed.'); } finally { setBusy(null); }
  }
  const btns = (key: string, build: () => Promise<ReportModel>, name: string) => (
    <div className="row">
      <button className="btn secondary sm" disabled={!!busy} onClick={() => go(key, build, name, 'pdf')}>{busy === key + 'pdf' ? '…' : 'PDF'}</button>
      <button className="btn secondary sm" disabled={!!busy} onClick={() => go(key, build, name, 'docx')}>{busy === key + 'docx' ? '…' : 'Word'}</button>
    </div>
  );
  const docModel = async (d: DocumentRow) => docToReport(d.title, await loadCurrentContent(d), business.name, `${TYPE[d.doc_type]} · Version ${d.current_version} · ${d.approved_version === d.current_version ? 'Approved' : d.approved_version ? `Approved version is ${d.approved_version}` : 'Not approved'}`);
  const scored = bundle.assessments.filter((a) => a.status !== 'in_progress');

  return (
    <div className="page">
      <PageHead eyebrow="Step 10 · Monitor" title="Reports & Documents" intro="Download reports and every policy, SOP and blueprint as PDF or Word. Documents always export their latest saved version." />
      {err && <Notice kind="danger">{err}</Notice>}

      <div className="grid g2">
        <div className="card stack">
          <div className="h2">Consolidated business report</div>
          <p className="small muted" style={{ margin: 0 }}>Profile, assessment history, confirmed findings, corrective actions, plan status, KPI results and document register.</p>
          {btns('cons', async () => consolidatedReport(business, bundle), `${slug(business.name)}-consolidated-report`)}
        </div>
        <div className="card stack">
          <div className="h2">CAP assessment reports</div>
          {scored.length === 0 ? <p className="small muted" style={{ margin: 0 }}>Available after the first assessment is scored.</p> : scored.slice().reverse().map((a) => (
            <div key={a.id} className="row between"><span>Version {a.version} · {a.overall_pct}% · {fmtDate(a.scored_at)}</span>
              {btns(`cap-${a.id}`, async () => capReport(business, a, questions, await loadAnswers(a.id), bundle.findings), `${slug(business.name)}-cap-report-v${a.version}`)}</div>
          ))}
        </div>
      </div>

      <div className="card stack">
        <div className="h2">Documents</div>
        {bundle.documents.length === 0 ? <p className="small muted">No documents yet. Draft policies, SOPs and the blueprint from <Link to="/blueprint">Business Blueprint</Link>.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Version</th><th>Approved</th><th>Updated</th><th /></tr></thead>
              <tbody>{bundle.documents.map((d) => (
                <tr key={d.id}>
                  <td><Link to={`/documents/${d.id}`}>{d.title}</Link></td><td>{TYPE[d.doc_type]}</td><td><Chip value={d.status} /></td>
                  <td>v{d.current_version}</td><td>{d.approved_version ? `v${d.approved_version} · ${fmtDate(d.approved_at)}` : '—'}</td><td>{fmtDate(d.updated_at)}</td>
                  <td>{btns(`doc-${d.id}`, () => docModel(d), `${slug(d.title)}-v${d.current_version}`)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card stack">
        <div className="h2">AI activity</div>
        <p className="small muted" style={{ margin: 0 }}>Every AI request is logged. When AI is unavailable the app uses Mete standard templates and labels the result.</p>
        {runs.length === 0 ? <p className="small muted">No AI requests yet.</p> : (
          <div className="table-wrap"><table><thead><tr><th>When</th><th>Task</th><th>Result</th><th>Detail</th></tr></thead>
            <tbody>{runs.map((r) => <tr key={r.id}><td className="small">{new Date(r.created_at).toLocaleString()}</td><td>{r.action}</td><td><Chip value={r.status === 'ok' ? 'done' : r.status === 'fallback' ? 'medium' : 'blocked'} label={r.status === 'ok' ? 'AI' : r.status === 'fallback' ? 'Template' : 'Error'} /></td><td className="small">{r.message}</td></tr>)}</tbody></table></div>
        )}
      </div>
    </div>
  );
}
