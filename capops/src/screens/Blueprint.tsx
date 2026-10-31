import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../AppContext';
import { createDocument, saveDocVersion } from '../lib/data';
import { generateBlueprintContent, generateSolutionDoc } from '../lib/docgen';
import { Chip, Empty, Notice, PageHead, Spinner, fmtDate } from '../components/ui';

export default function Blueprint() {
  const { business, latest, bundle, refresh } = useApp();
  const nav = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);

  if (!business) return <div className="page"><Empty title="No business yet"><Link className="btn" to="/profile">Create a business profile</Link></Empty></div>;
  const sols = (bundle?.solutions ?? []).filter((s) => s.assessment_id === latest?.id && s.approval_status === 'approved');
  if (!latest || sols.length === 0) return <div className="page"><PageHead eyebrow="Step 7" title="Business Blueprint" /><Empty title="Approve OPS actions first">The blueprint and documents are built from approved corrective actions.<div style={{ marginTop: 12 }}><Link className="btn" to="/ops">Go to OPS Solutions</Link></div></Empty></div>;

  const docs = bundle?.documents ?? [];
  const blueprint = [...docs].reverse().find((d) => d.doc_type === 'blueprint');
  const needDocs = sols.filter((s) => s.document_type !== 'none');
  const missing = needDocs.filter((s) => !docs.some((d) => d.solution_id === s.id));
  const findings = (bundle?.findings ?? []).filter((f) => f.assessment_id === latest.id && f.status === 'confirmed');

  async function genBlueprint() {
    setBusy('bp'); setErr(null); setNotes([]);
    try {
      const { title, content, fallback } = await generateBlueprintContent(business!, latest!.overall_pct, latest!.category_scores ?? [], findings, sols, docs);
      if (fallback) setNotes([`AI was not available (${fallback}). The blueprint was assembled from your confirmed findings and approved actions using the Mete standard outline.`]);
      if (blueprint) { await saveDocVersion(blueprint, title, content, fallback ? 'Regenerated (standard outline)' : 'Regenerated (AI)'); await refresh(); nav(`/documents/${blueprint.id}`); }
      else { const d = await createDocument(business!.id, 'blueprint', title, content, null, fallback ? 'First draft (standard outline)' : 'First draft (AI)'); await refresh(); nav(`/documents/${d.id}`); }
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not build the blueprint.'); } finally { setBusy(null); }
  }

  async function draftMissing() {
    setBusy('docs'); setErr(null);
    const out: string[] = [];
    try {
      for (const s of missing) {
        const { fallback } = await generateSolutionDoc(business!, s);
        if (fallback) out.push(`${s.document_title ?? s.problem}: used the standard template (${fallback}).`);
      }
      setNotes(out);
      await refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not draft documents.'); await refresh(); } finally { setBusy(null); }
  }

  return (
    <div className="page">
      <PageHead eyebrow="Step 7 · OPS" title="Business Blueprint"
        intro="Your operating blueprint plus the policies and SOPs your approved actions call for. Every document is editable, versioned and needs your approval."
        actions={<Link className="btn" to="/plan">Next: Implementation Plan</Link>} />
      {notes.map((n, i) => <Notice key={i} kind="warn">{n}</Notice>)}
      {err && <Notice kind="danger">{err}</Notice>}

      <div className="card stack">
        <div className="row between">
          <div>
            <div className="h2">Business Operating Blueprint</div>
            <div className="small muted">How the business should run once the corrections are in place — roles, weekly rhythm, systems, measures.</div>
          </div>
          <div className="row">
            {blueprint && <Link className="btn secondary" to={`/documents/${blueprint.id}`}>Open and edit</Link>}
            <button className="btn brass" onClick={genBlueprint} disabled={!!busy}>{busy === 'bp' ? <Spinner label="Writing blueprint…" /> : blueprint ? 'Regenerate as new version' : 'Generate blueprint'}</button>
          </div>
        </div>
        {blueprint && <div className="row small"><Chip value={blueprint.status} /><span className="muted">Version {blueprint.current_version} · updated {fmtDate(blueprint.updated_at)}{blueprint.approved_version ? ` · approved version ${blueprint.approved_version}` : ''}</span></div>}
      </div>

      <div className="card stack">
        <div className="row between">
          <div><div className="h2">Policies and SOPs</div><div className="small muted">{needDocs.length} required by approved actions · {needDocs.length - missing.length} drafted · {docs.filter((d) => d.doc_type !== 'blueprint' && d.status === 'approved').length} approved</div></div>
          {missing.length > 0 && <button className="btn secondary" onClick={draftMissing} disabled={!!busy}>{busy === 'docs' ? <Spinner label={`Drafting ${missing.length}…`} /> : `Draft all ${missing.length} missing`}</button>}
        </div>
        {needDocs.length === 0 ? <p className="muted small">None of the approved actions require a policy or SOP.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Document</th><th>Type</th><th>For action</th><th>Status</th><th>Version</th><th /></tr></thead>
              <tbody>{needDocs.map((s) => {
                const d = docs.find((x) => x.solution_id === s.id);
                return (
                  <tr key={s.id}>
                    <td>{d?.title ?? s.document_title ?? '—'}</td>
                    <td>{s.document_type.toUpperCase()}</td>
                    <td className="small">{s.problem}</td>
                    <td>{d ? <Chip value={d.status} /> : <span className="chip">not drafted</span>}</td>
                    <td>{d ? `v${d.current_version}` : '—'}</td>
                    <td>{d ? <Link className="btn ghost sm" to={`/documents/${d.id}`}>Open</Link>
                      : <button className="btn secondary sm" disabled={!!busy} onClick={async () => { setBusy(`one-${s.id}`); try { const r = await generateSolutionDoc(business!, s); await refresh(); nav(`/documents/${r.doc.id}${r.fallback ? `?fallback=${encodeURIComponent(r.fallback)}` : ''}`); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(null); } }}>{busy === `one-${s.id}` ? <Spinner label="Drafting…" /> : 'Draft'}</button>}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
