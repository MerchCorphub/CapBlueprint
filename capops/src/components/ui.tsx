import type { ReactNode } from 'react';

export function PageHead({ eyebrow, title, intro, actions }: { eyebrow?: string; title: string; intro?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="h1">{title}</h1>
        {intro && <p className="muted">{intro}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Progress({ value, label }: { value: number; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="stack" style={{ gap: 4 }}>
      {label && <div className="row between small"><span>{label}</span><strong>{Math.round(v)}%</strong></div>}
      <div className="progress" role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? 'Progress'}>
        <div style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

const CHIP: Record<string, string> = {
  Strong: 'ok', Stable: 'navy', 'At risk': 'warn', Critical: 'danger',
  draft: '', in_review: 'brass', approved: 'ok', rejected: 'danger',
  proposed: 'brass', confirmed: 'ok', dismissed: '',
  not_started: '', in_progress: 'navy', blocked: 'danger', done: 'ok',
  high: 'danger', medium: 'warn', low: '', critical: 'danger',
  ai: 'navy', template: 'brass', user: '',
};
export function Chip({ value, label }: { value: string; label?: string }) {
  return <span className={`chip ${CHIP[value] ?? ''}`}>{label ?? value.replace(/_/g, ' ')}</span>;
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'danger' | 'ok'; children: ReactNode }) {
  return <div className={`notice ${kind === 'info' ? '' : kind}`} role={kind === 'danger' ? 'alert' : 'status'}>{children}</div>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="card empty"><div className="h2" style={{ color: 'var(--ink)' }}>{title}</div><div style={{ marginTop: 8 }}>{children}</div></div>;
}

export function Spinner({ label }: { label?: string }) {
  return <span className="row small muted"><span className="spinner" aria-hidden /> {label ?? 'Loading…'}</span>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function scoreColor(pct: number | null) {
  if (pct === null) return 'var(--border)';
  if (pct >= 80) return 'var(--ok)';
  if (pct >= 60) return 'var(--navy)';
  if (pct >= 40) return 'var(--warn)';
  return 'var(--danger)';
}

export function ScoreRing({ pct, label }: { pct: number | null; label: string }) {
  const v = pct ?? 0;
  return (
    <div className="score-ring" style={{ background: `conic-gradient(${scoreColor(pct)} ${v * 3.6}deg, var(--surface-2) 0)` }} aria-label={`${label}: ${pct ?? 'not scored'}%`}>
      <div><div><div className="figure">{pct === null ? '—' : `${pct}%`}</div><div className="small muted">{label}</div></div></div>
    </div>
  );
}

export const fmtDate = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString() : '—');

/** Chart series colors, validated for lightness, chroma, CVD separation and 3:1 contrast on light surfaces. */
export const SERIES = ['#3a5a9b', '#b08a1a'];
export const AXIS = { stroke: '#808894', fontSize: 12, fill: '#566172' };
