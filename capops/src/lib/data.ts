import { supabase, must } from './supabase';
import type { Assessment, Business, CapQuestion, DocContent, DocumentRow, DocVersion, Finding, KpiEntry, Plan, Solution, AnswerRow } from './types';
import { scoreAssessment } from './scoring';
import type { Block, ReportModel } from './export';
import { ANSWER_LABEL } from './scoring';

export async function loadQuestions(): Promise<CapQuestion[]> {
  return must(await supabase.from('cap_questions').select('*').eq('active', true).order('category_order').order('sort_order')) as CapQuestion[];
}

export async function loadAnswers(assessmentId: string): Promise<AnswerRow[]> {
  return must(await supabase.from('assessment_answers').select('*').eq('assessment_id', assessmentId)) as AnswerRow[];
}

export async function createAssessment(businessId: string, version: number): Promise<Assessment> {
  return must(await supabase.from('assessments').insert({ business_id: businessId, version }).select().single()) as Assessment;
}

export async function saveAnswer(assessmentId: string, questionId: string, patch: { answer?: string | null; note?: string | null }) {
  must(await supabase.from('assessment_answers').upsert({ assessment_id: assessmentId, question_id: questionId, ...patch }, { onConflict: 'assessment_id,question_id' }).select());
}

/** Score and store results on the assessment record. */
export async function scoreAndSave(a: Assessment, questions: CapQuestion[]) {
  const rows = await loadAnswers(a.id);
  const map = Object.fromEntries(rows.map((r) => [r.question_id, { answer: r.answer, note: r.note }]));
  const s = scoreAssessment(questions, map);
  const patch: Partial<Assessment> = {
    overall_pct: s.overallPct,
    category_scores: s.categories,
    priorities: s.priorities,
    answered_count: s.answered,
  };
  if (s.complete && a.status === 'in_progress') { patch.status = 'scored'; patch.scored_at = new Date().toISOString(); }
  must(await supabase.from('assessments').update(patch).eq('id', a.id).select());
  return s;
}

export async function createDocument(businessId: string, docType: DocumentRow['doc_type'], title: string, content: DocContent, solutionId: string | null, note: string) {
  const doc = must(await supabase.from('documents').insert({ business_id: businessId, doc_type: docType, title, solution_id: solutionId }).select().single()) as DocumentRow;
  must(await supabase.from('document_versions').insert({ document_id: doc.id, version: 1, content, change_note: note }).select());
  return doc;
}

export async function saveDocVersion(doc: DocumentRow, title: string, content: DocContent, note: string) {
  const next = doc.current_version + 1;
  must(await supabase.from('document_versions').insert({ document_id: doc.id, version: next, content, change_note: note || 'Edited' }).select());
  return must(await supabase.from('documents').update({ current_version: next, title, status: 'draft' }).eq('id', doc.id).select().single()) as DocumentRow;
}

export async function loadVersions(docId: string): Promise<DocVersion[]> {
  return must(await supabase.from('document_versions').select('*').eq('document_id', docId).order('version', { ascending: false })) as DocVersion[];
}

export async function loadCurrentContent(doc: DocumentRow): Promise<DocContent> {
  const v = must(await supabase.from('document_versions').select('content').eq('document_id', doc.id).eq('version', doc.current_version).single()) as { content: DocContent };
  return v.content;
}

export interface BusinessBundle {
  assessments: Assessment[];
  findings: Finding[];
  solutions: Solution[];
  documents: DocumentRow[];
  plans: Plan[];
  kpis: KpiEntry[];
}

export async function loadBundle(businessId: string): Promise<BusinessBundle> {
  const [a, f, s, d, p, k] = await Promise.all([
    supabase.from('assessments').select('*').eq('business_id', businessId).order('version'),
    supabase.from('findings').select('*').eq('business_id', businessId).order('created_at'),
    supabase.from('solutions').select('*').eq('business_id', businessId).order('phase').order('created_at'),
    supabase.from('documents').select('*').eq('business_id', businessId).order('created_at'),
    supabase.from('implementation_plans').select('*').eq('business_id', businessId).order('created_at'),
    supabase.from('kpi_entries').select('*').eq('business_id', businessId).order('recorded_on'),
  ]);
  return {
    assessments: must(a) as Assessment[],
    findings: must(f) as Finding[],
    solutions: must(s) as Solution[],
    documents: must(d) as DocumentRow[],
    plans: must(p) as Plan[],
    kpis: must(k) as KpiEntry[],
  };
}

/** The assessment whose OPS plan is being worked: the newest one with approved actions, else the newest confirmed, else the newest. */
export function activeCycle(b: BusinessBundle): Assessment | undefined {
  const rev = [...b.assessments].reverse();
  return rev.find((a) => b.solutions.some((s) => s.assessment_id === a.id && s.approval_status === 'approved'))
    ?? rev.find((a) => a.status === 'confirmed') ?? rev[0];
}

const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString() : '—');

export function capReport(biz: Business, a: Assessment, questions: CapQuestion[], answers: AnswerRow[], findings: Finding[]): ReportModel {
  const amap = new Map(answers.map((r) => [r.question_id, r]));
  const blocks: Block[] = [
    { type: 'h1', text: 'Summary' },
    { type: 'p', text: `Overall CAP score: ${a.overall_pct ?? '—'}% (${a.answered_count} of ${questions.length} questions answered). Scoring: Yes = 2, Partially = 1, No = 0; "Not applicable" answers are left out of the total.` },
    { type: 'table', head: ['Category', 'Score', 'Rating', 'Answered', 'N/A'], rows: (a.category_scores ?? []).map((c) => [c.category, c.pct === null ? '—' : `${c.pct}%`, c.rating, `${c.answered}/${c.total}`, c.na]) },
    { type: 'h1', text: 'Investigation Priorities' },
    { type: 'p', text: 'These low-scoring answers are where to look first. A low score shows where a gap may be; it does not by itself prove the cause.' },
    { type: 'table', head: ['#', 'Category', 'Weakness signal', 'Answer'], rows: (a.priorities ?? []).map((p) => [p.rank, p.category, p.weakness_label, ANSWER_LABEL[p.answer]]) },
  ];
  const confirmed = findings.filter((f) => f.assessment_id === a.id && f.status === 'confirmed');
  if (confirmed.length) {
    blocks.push({ type: 'h1', text: 'Confirmed Findings' });
    for (const f of confirmed) {
      blocks.push({ type: 'h2', text: f.title });
      blocks.push({ type: 'p', text: `Category: ${f.category ?? '—'} · Severity: ${f.severity} · Confidence: ${f.confidence}` });
      if (f.evidence) blocks.push({ type: 'p', text: `Evidence: ${f.evidence.replace(/\n+/g, ' ')}` });
      if (f.root_cause) blocks.push({ type: 'p', text: `Likely root cause: ${f.root_cause}` });
    }
  }
  blocks.push({ type: 'h1', text: 'All Answers' });
  blocks.push({ type: 'table', head: ['ID', 'Question', 'Answer', 'Note'], rows: questions.map((q) => [q.id, q.question, amap.get(q.id)?.answer ? ANSWER_LABEL[amap.get(q.id)!.answer!] : 'Unanswered', amap.get(q.id)?.note ?? '']) });
  return { title: 'CAP Assessment Report', subtitle: biz.name, meta: `Assessment version ${a.version} · ${fmtDate(a.scored_at ?? a.updated_at)}`, blocks };
}

export function consolidatedReport(biz: Business, b: BusinessBundle): ReportModel {
  const latest = activeCycle(b);
  const sols = latest ? b.solutions.filter((s) => s.assessment_id === latest.id) : b.solutions;
  const plan = latest ? b.plans.find((p) => p.assessment_id === latest.id) : undefined;
  const done = sols.filter((s) => s.approval_status === 'approved' && s.progress_status === 'done').length;
  const approved = sols.filter((s) => s.approval_status === 'approved').length;
  const blocks: Block[] = [
    { type: 'h1', text: 'Business Profile' },
    { type: 'table', head: ['Item', 'Detail'], rows: [
      ['Industry', biz.industry], ['Stage', biz.business_stage], ['Location', biz.location], ['Years operating', biz.years_operating],
      ['Employees', biz.employee_count], ['Annual revenue', biz.annual_revenue_range], ['Primary goal', biz.primary_goal],
    ] },
    { type: 'h1', text: 'CAP Assessment History' },
    { type: 'table', head: ['Version', 'Date', 'Overall', ...(b.assessments[b.assessments.length - 1]?.category_scores ?? latest?.category_scores ?? []).map((c) => c.category)], rows: b.assessments.filter((a) => a.overall_pct !== null).map((a) => [a.version, fmtDate(a.scored_at ?? a.updated_at), `${a.overall_pct}%`, ...(a.category_scores ?? []).map((c) => (c.pct === null ? '—' : `${c.pct}%`))]) },
    { type: 'h1', text: `Confirmed Findings${latest ? ` (assessment version ${latest.version})` : ''}` },
    { type: 'table', head: ['Weakness', 'Category', 'Likely root cause', 'Severity'], rows: b.findings.filter((f) => f.status === 'confirmed' && (!latest || f.assessment_id === latest.id)).map((f) => [f.title, f.category, f.root_cause, f.severity]) },
    { type: 'h1', text: 'OPS Corrective Actions' },
    { type: 'table', head: ['Problem', 'Action owner', 'Priority', 'Phase', 'Target date', 'Approval', 'Progress'], rows: sols.map((s) => [s.problem, s.responsible_role, s.priority, `${s.phase} days`, s.target_date, s.approval_status, s.progress_status.replace('_', ' ')]) },
    { type: 'h1', text: 'Implementation Status' },
    { type: 'p', text: `Plan status: ${plan?.status ?? 'not created'}${plan?.approved_at ? ` (approved ${fmtDate(plan.approved_at)})` : ''}. ${done} of ${approved} approved actions complete.` },
    { type: 'h1', text: 'KPI Results' },
    { type: 'table', head: ['KPI', 'Baseline', 'Target', 'Latest', 'Date'], rows: sols.filter((s) => s.kpi_name).map((s) => {
      const entries = b.kpis.filter((k) => k.solution_id === s.id);
      const last = entries[entries.length - 1];
      return [`${s.kpi_name}${s.kpi_unit ? ` (${s.kpi_unit})` : ''}`, s.kpi_baseline, s.kpi_target, last?.value ?? null, last?.recorded_on ?? null];
    }) },
    { type: 'h1', text: 'Policies, SOPs and Blueprint' },
    { type: 'table', head: ['Document', 'Type', 'Status', 'Version', 'Approved version'], rows: b.documents.map((d) => [d.title, d.doc_type.toUpperCase(), d.status.replace('_', ' '), d.current_version, d.approved_version]) },
  ];
  return { title: 'Consolidated Business Report', subtitle: biz.name, meta: `Generated ${new Date().toLocaleDateString()}`, blocks };
}
