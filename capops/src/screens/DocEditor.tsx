import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../AppContext';
import { loadVersions, saveDocVersion } from '../lib/data';
import { docToReport, downloadDocx, downloadPdf, slug } from '../lib/export';
import { supabase, must } from '../lib/supabase';
import type { DocContent, DocSection, DocVersion, DocumentRow } from '../lib/types';
import { Chip, Field, Notice, PageHead, Spinner, fmtDate } from '../components/ui';

const TYPE_LABEL = { policy: 'Policy', sop: 'Standard Operating Procedure', blueprint: 'Business Operating Blueprint' };

export default function DocEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { business, refresh } = useApp();
  const [doc, setDoc] = useState<DocumentRow | null>(null);
  const [versions, setVersions] = useState<DocVersion[]>([]);
  const [title, setTitle] = useState('');
  const [sections, setSections] = useState<DocSection[]>([]);
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<DocVersion | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'danger' | 'warn'; text: string } | null>(() => {
    const f = params.get('fallback');
    return f ? { kind: 'warn', text: `AI was not available (${f}). This first draft uses the Mete standard template — fill in every [FILL IN] item.` } : null;
  });

  async function load() {
    try {
      const d = must(await supabase.from('documents').select('*').eq('id', id!).single()) as DocumentRow;
      const vs = await loadVersions(d.id);
      setDoc(d); setVersions(vs); setTitle(d.title);
      setSections((vs.find((v) => v.version === d.current_version)?.content ?? { sections: [] }).sections.map((s) => ({ ...s })));
      setDirty(false); setPreview(null);
    } catch (e) { setMsg({ kind: 'danger', text: e instanceof Error ? e.message : 'Document not found.' }); }
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  if (!doc) return <div className="page">{msg ? <Notice kind="danger">{msg.text}</Notice> : <Spinner />}</div>;

  const change = (i: number, patch: Partial<DocSection>) => { setSections((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x))); setDirty(true); };
  const move = (i: number, dir: -1 | 1) => { setSections((s) => { const c = [...s]; const [x] = c.splice(i, 1); c.splice(i + dir, 0, x); return c; }); setDirty(true); };

  async function save() {
    if (!title.trim()) { setMsg({ kind: 'danger', text: 'Title is required.' }); return; }
    setBusy(true);
    try {
      await saveDocVersion(doc!, title.trim(), { sections }, note.trim() || 'Edited');
      setNote(''); await load(); await refresh();
      setMsg({ kind: 'ok', text: 'Saved as a new version. Approval was reset to draft — approve again when ready.' });
    } catch (e) { setMsg({ kind: 'danger', text: e instanceof Error ? e.message : 'Save failed.' }); } finally { setBusy(false); }
  }

  async function setStatus(status: DocumentRow['status']) {
    if (dirty) { setMsg({ kind: 'warn', text: 'Save your edits first.' }); return; }
    const patch: Partial<DocumentRow> = { status };
    if (status === 'approved') { patch.approved_version = doc!.current_version; patch.approved_at = new Date().toISOString(); }
    const r = await supabase.from('documents').update(patch).eq('id', doc!.id);
    if (r.error) setMsg({ kind: 'danger', text: r.error.message }); else { await load(); await refresh(); setMsg({ kind: 'ok', text: status === 'approved' ? `Version ${doc!.current_version} approved.` : `Status changed to ${status.replace('_', ' ')}.` }); }
  }

  async function restore(v: DocVersion) {
    setBusy(true);
    try { await saveDocVersion(doc!, doc!.title, v.content, `Restored from version ${v.version}`); await load(); await refresh(); setMsg({ kind: 'ok', text: `Version ${v.version} restored as a new version.` }); }
    catch (e) { setMsg({ kind: 'danger', text: e instanceof Error ? e.message : 'Restore failed.' }); } finally { setBusy(false); }
  }

  function download(kind: 'pdf' | 'docx', content: DocContent, version: number) {
    const model = docToReport(title, content, business?.name, `${TYPE_LABEL[doc!.doc_type]} · Version ${version} · ${doc!.approved_version === version ? 'Approved' : 'Not approved'}`);
    const name = `${slug(title)}-v${version}`;
    if (kind === 'pdf') downloadPdf(model, name); else downloadDocx(model, name);
  }

  return (
    <div className="page">
      <PageHead eyebrow={TYPE_LABEL[doc.doc_type]} title={doc.title}
        intro={<span className="row"><Chip value={doc.status} /> Version {doc.current_version}{doc.approved_version ? ` · approved version ${doc.approved_version} on ${fmtDate(doc.approved_at)}` : ''}{dirty && <strong style={{ color: 'var(--warn)' }}>· unsaved changes</strong>}</span>}
        actions={<>
          <Link className="btn ghost" to={doc.doc_type === 'blueprint' ? '/blueprint' : '/reports'}>Back</Link>
          <button className="btn secondary" onClick={() => download('pdf', { sections }, doc.current_version)} disabled={dirty}>PDF</button>
          <button className="btn secondary" onClick={() => download('docx', { sections }, doc.current_version)} disabled={dirty}>Word</button>
        </>} />
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      <div className="grid editor-grid">
        <div className="stack">
          <div className="card stack">
            <Field label="Document title"><input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} /></Field>
            {sections.map((s, i) => (
              <div key={i} className="stack" style={{ borderTop: '1px solid var(--line)', paddingTop: 12, gap: 6 }}>
                <div className="row">
                  <input aria-label={`Section ${i + 1} heading`} value={s.heading} onChange={(e) => change(i, { heading: e.target.value })} style={{ fontWeight: 600, flex: 1, minWidth: 180 }} />
                  <button className="btn ghost sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move section up">↑</button>
                  <button className="btn ghost sm" disabled={i === sections.length - 1} onClick={() => move(i, 1)} aria-label="Move section down">↓</button>
                  <button className="btn ghost sm" onClick={() => { setSections(sections.filter((_, j) => j !== i)); setDirty(true); }} aria-label="Delete section">Delete</button>
                </div>
                <textarea aria-label={`Section ${i + 1} text`} rows={Math.min(16, Math.max(4, s.body.split('\n').length + 1))} value={s.body} onChange={(e) => change(i, { body: e.target.value })}
                  style={s.body.includes('[FILL IN') ? { borderColor: 'var(--warn)' } : undefined} />
                {s.body.includes('[FILL IN') && <span className="small" style={{ color: 'var(--warn)' }}>Contains items to fill in.</span>}
              </div>
            ))}
            <button className="btn ghost sm" style={{ justifySelf: 'start' }} onClick={() => { setSections([...sections, { heading: 'New section', body: '' }]); setDirty(true); }}>+ Add section</button>
            <p className="small muted">Tip: start a line with "- " for a bullet. Exports keep your headings and bullets.</p>
          </div>
        </div>
        <aside className="stack editor-aside">
          <div className="card stack">
            <div className="h2">Save</div>
            <Field label="What changed?"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Added refund time limits" /></Field>
            <button className="btn" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save new version'}</button>
            {dirty && <button className="btn ghost sm" onClick={load}>Discard changes</button>}
          </div>
          <div className="card stack">
            <div className="h2">Approval</div>
            {doc.status === 'draft' && <button className="btn secondary" onClick={() => setStatus('in_review')}>Submit for review</button>}
            {doc.status !== 'approved' && <button className="btn brass" onClick={() => setStatus('approved')}>Approve version {doc.current_version}</button>}
            {doc.status !== 'draft' && <button className="btn ghost sm" onClick={() => setStatus('draft')}>Return to draft</button>}
          </div>
          <div className="card stack">
            <div className="h2">Version history</div>
            {versions.map((v) => (
              <div key={v.id} className="stack" style={{ gap: 2, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                <div className="row between"><strong>v{v.version}</strong>{doc.approved_version === v.version && <Chip value="approved" />}{v.version === doc.current_version && <span className="chip navy">current</span>}</div>
                <span className="small muted">{v.change_note} · {new Date(v.created_at).toLocaleString()}</span>
                <div className="row"><button className="btn ghost sm" onClick={() => setPreview(v)}>View</button>{v.version !== doc.current_version && <button className="btn ghost sm" disabled={busy} onClick={() => restore(v)}>Restore</button>}</div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {preview && (
        <div role="dialog" aria-modal="true" aria-label={`Version ${preview.version}`} style={{ position: 'fixed', inset: 0, background: '#0008', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16 }} onClick={() => setPreview(null)}>
          <div className="card stack" style={{ maxWidth: 760, width: '100%', maxHeight: '85vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div className="row between"><div className="h2">Version {preview.version}</div><div className="row"><button className="btn secondary sm" onClick={() => download('pdf', preview.content, preview.version)}>PDF</button><button className="btn secondary sm" onClick={() => download('docx', preview.content, preview.version)}>Word</button><button className="btn sm" onClick={() => setPreview(null)}>Close</button></div></div>
            {preview.content.sections.map((s, i) => <div key={i}><div className="h2" style={{ fontSize: 15 }}>{s.heading}</div><div className="pre small">{s.body}</div></div>)}
          </div>
        </div>
      )}
    </div>
  );
}
