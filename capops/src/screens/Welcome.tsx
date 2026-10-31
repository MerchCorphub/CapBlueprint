import { Link } from 'react-router-dom';
import { useApp } from '../AppContext';
import { STEPS, useJourney } from '../components/Layout';
import { PageHead, Progress } from '../components/ui';

const WHAT: Record<string, string> = {
  '/profile': 'Tell us about the business so findings and documents fit it.',
  '/cap': 'Answer 20 Yes / Partially / No questions. Saves as you go.',
  '/results': 'See category scores and where to look first.',
  '/diagnosis': 'Answer follow-up questions; confirm the real weaknesses.',
  '/ops': 'Review and approve a corrective action for each weakness.',
  '/blueprint': 'Generate editable policies, SOPs and your operating blueprint.',
  '/plan': 'Approve the 30/60/90-day implementation plan.',
  '/dashboard': 'Log KPIs, track progress and reassess.',
  '/reports': 'Download PDF and Word reports and documents.',
};

export default function Welcome() {
  const { business, session } = useApp();
  const done = useJourney();
  const steps = STEPS.slice(1);
  const complete = steps.filter((s) => done[s.path]).length;
  const next = steps.find((s) => !done[s.path]) ?? STEPS[STEPS.length - 1];

  return (
    <div className="page">
      <PageHead
        eyebrow="Welcome"
        title={business ? `${business.name}` : `Welcome, ${session?.user.email?.split('@')[0]}`}
        intro={business ? 'Here is where this business stands in the CAP/OPS journey.' : 'Start by creating a business profile. Each business keeps its own assessments, plans and documents.'}
        actions={<Link className="btn brass" to={business ? next.path : '/profile'}>{business ? `Continue: ${next.label}` : 'Create business profile'}</Link>}
      />
      {business && <div className="card"><Progress value={(complete / steps.length) * 100} label={`${complete} of ${steps.length} steps complete`} /></div>}
      <div className="grid g3">
        {steps.map((s, i) => (
          <Link key={s.path} to={s.path} className="card" style={{ textDecoration: 'none', color: 'inherit', borderColor: s.path === next.path && business ? 'var(--brass)' : undefined }}>
            <div className="row between">
              <span className="label">{s.phase}</span>
              {done[s.path] ? <span className="chip ok">Done</span> : s.path === next.path && business ? <span className="chip brass">Next</span> : null}
            </div>
            <div className="h2" style={{ marginTop: 8 }}>{i + 1}. {s.label}</div>
            <p className="small muted" style={{ margin: '6px 0 0' }}>{WHAT[s.path]}</p>
          </Link>
        ))}
      </div>
      <p className="small muted">Results are guidance, not legal, tax or financial advice. Verify licensing, tax and legal items with the proper authority or a qualified professional.</p>
    </div>
  );
}
