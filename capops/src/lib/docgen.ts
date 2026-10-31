import { runAI } from './ai';
import { createDocument } from './data';
import { templateBlueprint, templateDocument } from './templates';
import type { Business, CategoryScore, DocContent, DocumentRow, Finding, Solution } from './types';
import { profileOf } from './profile';

function validContent(x: unknown): x is DocContent & { title?: string } {
  const c = x as DocContent;
  return !!c && Array.isArray(c.sections) && c.sections.length > 0 && c.sections.every((s) => typeof s.heading === 'string' && typeof s.body === 'string');
}

/** Draft a policy or SOP for a solution. Returns the new document and a note if the template fallback was used. */
export async function generateSolutionDoc(biz: Business, s: Solution): Promise<{ doc: DocumentRow; fallback: string | null }> {
  const docType = s.document_type === 'sop' ? 'sop' : 'policy';
  const title = s.document_title || `${s.problem} ${docType === 'sop' ? 'SOP' : 'Policy'}`;
  const r = await runAI<DocContent & { title?: string }>('document', biz.id, { profile: profileOf(biz), solution: s, doc_type: docType, title });
  if (r.ok && validContent(r.result)) {
    return { doc: await createDocument(biz.id, docType, r.result.title || title, { sections: r.result.sections }, s.id, 'First draft (AI)'), fallback: null };
  }
  const content = templateDocument(biz, s, docType, title);
  return { doc: await createDocument(biz.id, docType, title, content, s.id, 'First draft (Mete standard template)'), fallback: r.ok ? 'AI returned an unreadable document' : r.message };
}

export async function generateBlueprintContent(biz: Business, overall: number | null, cats: CategoryScore[], findings: Finding[], sols: Solution[], docs: DocumentRow[]): Promise<{ title: string; content: DocContent; fallback: string | null }> {
  const r = await runAI<DocContent & { title?: string }>('blueprint', biz.id, {
    profile: profileOf(biz),
    scores: { overall_pct: overall, categories: cats.map((c) => ({ category: c.category, pct: c.pct, rating: c.rating })) },
    findings: findings.map((f) => ({ title: f.title, category: f.category, evidence: f.evidence, root_cause: f.root_cause, severity: f.severity })),
    solutions: sols.map((s) => ({ problem: s.problem, action: s.corrective_action, role: s.responsible_role, priority: s.priority, phase: s.phase, document: s.document_title, kpi: s.kpi_name, target: s.kpi_target, unit: s.kpi_unit })),
  });
  if (r.ok && validContent(r.result)) return { title: r.result.title || 'Business Operating Blueprint', content: { sections: r.result.sections }, fallback: null };
  return { title: 'Business Operating Blueprint', content: templateBlueprint(biz, overall, cats, findings, sols, docs), fallback: r.ok ? 'AI returned an unreadable document' : r.message };
}
