// Mete standard templates. Used when the AI is unavailable or fails, so the
// owner can always finish CAP and OPS. Everything here is a starting point the
// owner reviews and edits; nothing is presented as a confirmed conclusion.
import type { Business, CategoryScore, DocContent, DocumentRow, Finding, Priority, Solution } from './types';

interface Lib {
  followup: string;
  action: string;
  document_type: 'none' | 'policy' | 'sop';
  document_title: string | null;
  role: string;
  phase: 30 | 60 | 90;
  kpi_name: string;
  kpi_target: number;
  kpi_unit: string;
}

export const ROOT_CAUSE_QUESTION =
  'What has kept this from being in place so far? (For example: no time, cost, not sure how, nobody assigned, never seemed important.)';

export const LIBRARY: Record<string, Lib> = {
  'STR-1': { followup: 'What results do you want 12 months from now, and how would you know you got there?', action: '1. Write three 12-month targets (revenue, customers, profit).\n2. Break each into monthly targets.\n3. Post them where you work and share with anyone who helps.', document_type: 'none', document_title: null, role: 'Owner', phase: 30, kpi_name: 'Monthly targets written', kpi_target: 3, kpi_unit: 'targets' },
  'STR-2': { followup: 'How do you currently find out whether a month was good or bad?', action: '1. Book a 60-minute monthly review on the calendar.\n2. Compare sales, profit and customer count to target.\n3. Record one decision from each review.', document_type: 'sop', document_title: 'Monthly Performance Review SOP', role: 'Owner', phase: 30, kpi_name: 'Monthly reviews held on time', kpi_target: 100, kpi_unit: '%' },
  'STR-3': { followup: 'Describe your best three customers. What do they have in common, and why did they pick you?', action: '1. List your 10 best customers and what they bought.\n2. Write a one-sentence ideal customer profile.\n3. Write a one-sentence reason to choose you and use it in all marketing.', document_type: 'none', document_title: null, role: 'Owner', phase: 30, kpi_name: 'Share of new customers matching ideal profile', kpi_target: 70, kpi_unit: '%' },
  'STR-4': { followup: 'How did you set your current prices, and when did you last change them?', action: '1. Cost out your top 5 products/services (materials, labor incl. your time, packaging, fees, overhead share).\n2. Set a target gross margin.\n3. Reprice items below target and set a yearly price review.', document_type: 'policy', document_title: 'Pricing Policy', role: 'Owner', phase: 30, kpi_name: 'Products priced at or above target margin', kpi_target: 100, kpi_unit: '%' },
  'CUS-1': { followup: 'Where do you think most new customers come from today, and how sure are you?', action: '1. Add a "How did you hear about us?" question to every order or intake.\n2. Log the answer in your sales records.\n3. Total sources monthly in the performance review.', document_type: 'sop', document_title: 'Customer Source Tracking SOP', role: 'Sales / Order intake', phase: 30, kpi_name: 'New customers with source recorded', kpi_target: 95, kpi_unit: '%' },
  'CUS-2': { followup: 'What happens today after someone asks for a price or quote but does not buy right away?', action: '1. Set a follow-up schedule (same day, day 3, day 7).\n2. Write short follow-up message templates.\n3. Track open leads in one list until won or lost.', document_type: 'sop', document_title: 'Lead and Quote Follow-Up SOP', role: 'Sales / Owner', phase: 30, kpi_name: 'Quote-to-sale conversion rate', kpi_target: 35, kpi_unit: '%' },
  'CUS-3': { followup: 'Where are your sales and customer records kept today (notebook, app, payment processor)?', action: '1. Choose one place to record leads, sales and repeat customers.\n2. Record every transaction there.\n3. Pull the three numbers each month.', document_type: 'sop', document_title: 'Sales Records SOP', role: 'Owner / Bookkeeper', phase: 30, kpi_name: 'Months with complete funnel numbers', kpi_target: 3, kpi_unit: 'months' },
  'CUS-4': { followup: 'When a customer is happy, what do you do next? How many reviews have you received in the last 90 days?', action: '1. Ask for a review within 48 hours of every completed sale.\n2. Offer a simple referral thank-you.\n3. Track reviews and referrals monthly.', document_type: 'sop', document_title: 'Review and Referral Request SOP', role: 'Owner / Customer service', phase: 60, kpi_name: 'New reviews per month', kpi_target: 8, kpi_unit: 'reviews' },
  'OPS-1': { followup: 'Which tasks would be hardest for someone new to do correctly without you explaining them?', action: '1. List the 5 tasks done most often.\n2. Write a step-by-step checklist for each.\n3. Test each checklist by having someone else follow it.', document_type: 'sop', document_title: 'Core Production / Service Delivery SOP', role: 'Owner / Operations lead', phase: 60, kpi_name: 'Core tasks with written SOPs', kpi_target: 5, kpi_unit: 'SOPs' },
  'OPS-2': { followup: 'If you were out for two weeks starting tomorrow, what would stop first?', action: '1. List decisions and tasks only the owner can do.\n2. Train a backup or document each one.\n3. Run a one-day "owner away" test.', document_type: 'policy', document_title: 'Owner Backup and Delegation Policy', role: 'Owner', phase: 90, kpi_name: 'Owner-only tasks with a trained backup', kpi_target: 80, kpi_unit: '%' },
  'OPS-3': { followup: 'What are the most common complaints or mistakes, and what happens when one occurs?', action: '1. Start a simple issue log (date, problem, cause, fix).\n2. Review the log weekly.\n3. Change the procedure behind any repeat issue.', document_type: 'sop', document_title: 'Quality Issue and Complaint Handling SOP', role: 'Operations lead', phase: 60, kpi_name: 'Complaints or rework per month', kpi_target: 2, kpi_unit: 'issues' },
  'OPS-4': { followup: 'What is the most you have delivered in one week, and what limited you (time, equipment, space, people)?', action: '1. Measure output per hour for your main product/service.\n2. Calculate weekly capacity at standard quality.\n3. Plan how to add 25% (schedule, equipment, help) before pushing more sales.', document_type: 'none', document_title: null, role: 'Owner / Operations lead', phase: 60, kpi_name: 'Capacity utilization', kpi_target: 80, kpi_unit: '%' },
  'FIN-1': { followup: 'Which accounts and cards are used for business purchases and deposits today?', action: '1. Open a business-only checking account.\n2. Route all business income and spending through it.\n3. Pay yourself by scheduled transfer, not ad-hoc spending.', document_type: 'policy', document_title: 'Business Funds Separation Policy', role: 'Owner', phase: 30, kpi_name: 'Business transactions through business account', kpi_target: 100, kpi_unit: '%' },
  'FIN-2': { followup: 'Who keeps the books today, and how far behind are they?', action: '1. Pick a bookkeeping tool or bookkeeper.\n2. Catch up the last 3 months.\n3. Close the books by the 10th of each month.', document_type: 'sop', document_title: 'Monthly Bookkeeping Close SOP', role: 'Owner / Bookkeeper', phase: 30, kpi_name: 'Books closed by the 10th', kpi_target: 100, kpi_unit: '%' },
  'FIN-3': { followup: 'Roughly what does it cost you to make or deliver your best-selling item, and what do you charge?', action: '1. Calculate gross margin for each main product/service.\n2. Total monthly fixed costs.\n3. Calculate break-even sales = fixed costs ÷ gross margin %.', document_type: 'none', document_title: null, role: 'Owner / Bookkeeper', phase: 30, kpi_name: 'Gross margin', kpi_target: 45, kpi_unit: '%' },
  'FIN-4': { followup: 'Have you ever been short of cash for bills, payroll or supplies? What caused it?', action: '1. Build a 13-week cash forecast (cash in, cash out, ending balance).\n2. Update it weekly.\n3. Set a minimum cash balance and act when the forecast dips below it.', document_type: 'sop', document_title: 'Weekly Cash Forecast SOP', role: 'Owner / Bookkeeper', phase: 60, kpi_name: 'Weeks forecast kept current', kpi_target: 13, kpi_unit: 'weeks' },
  'PPL-1': { followup: 'Which recurring tasks most often get missed or done late?', action: '1. List every recurring task (daily, weekly, monthly).\n2. Assign one owner and a due day to each.\n3. Review the list in the monthly review.', document_type: 'none', document_title: null, role: 'Owner', phase: 30, kpi_name: 'Recurring tasks with a named owner', kpi_target: 100, kpi_unit: '%' },
  'PPL-2': { followup: 'How do new helpers learn the job today, and how do you know they do it right?', action: '1. Write a one-page role card for each position.\n2. Create a first-week training checklist.\n3. Hold a 30-day check-in for each new person.', document_type: 'policy', document_title: 'Roles, Training and Onboarding Policy', role: 'Owner / Manager', phase: 90, kpi_name: 'Team members with role card and training sign-off', kpi_target: 100, kpi_unit: '%' },
  'PPL-3': { followup: 'Which licenses, permits, insurance policies and tax filings apply to you? Any missed deadlines before?', action: '1. List every license, permit, policy and filing with its due date.\n2. Put each date on a shared calendar with a 30-day reminder.\n3. Verify requirements with the proper authority or a qualified professional.', document_type: 'sop', document_title: 'Compliance Calendar SOP', role: 'Owner / Office manager', phase: 30, kpi_name: 'Compliance items filed on time', kpi_target: 100, kpi_unit: '%' },
  'PPL-4': { followup: 'What risk worries you most (refund disputes, injuries, data loss, cash shortages)? Has one happened?', action: '1. Pick the top 3 risks for this business.\n2. Write a short policy for each.\n3. Share with staff and post customer-facing ones.', document_type: 'policy', document_title: 'Key Risk Policies (Refunds, Safety, Data, Cash Handling)', role: 'Owner', phase: 60, kpi_name: 'Key risk policies approved', kpi_target: 3, kpi_unit: 'policies' },
};

export function templateFollowups(priorities: Priority[]) {
  const out: { cap_question_id: string; question: string; purpose: string }[] = [];
  for (const p of priorities) {
    const lib = LIBRARY[p.question_id];
    if (lib) out.push({ cap_question_id: p.question_id, question: lib.followup, purpose: 'Shows how the gap shows up day to day.' });
    out.push({ cap_question_id: p.question_id, question: `${p.weakness_label}: ${ROOT_CAUSE_QUESTION}`, purpose: 'Points to the likely root cause.' });
  }
  return out;
}

function guessRootCause(text: string): { cause: string; confidence: 'low' | 'medium' } {
  const t = text.toLowerCase();
  if (!t.trim()) return { cause: 'Not yet confirmed. Answer the follow-up questions or add what you know.', confidence: 'low' };
  const rules: [RegExp, string][] = [
    [/time|busy|no bandwidth|overwhelm/, 'Owner time is fully used on daily work, so this has not been set up.'],
    [/cost|money|afford|expensive|budget/, 'Cost or cash constraints have delayed this.'],
    [/how|know|unsure|not sure|learn|understand/, 'The owner has not had a clear method or know-how for this.'],
    [/nobody|no one|assigned|responsib|staff/, 'No one has been assigned responsibility for this.'],
    [/important|priority|didn.?t think|never needed/, 'It has not been treated as a priority so far.'],
  ];
  for (const [re, cause] of rules) if (re.test(t)) return { cause, confidence: 'medium' };
  return { cause: `Owner explanation: "${text.trim().slice(0, 240)}" — confirm the cause before acting.`, confidence: 'low' };
}

export function templateFindings(
  priorities: Priority[],
  followups: { cap_question_id: string | null; question: string; answer: string | null }[],
) {
  return priorities.map((p) => {
    const mine = followups.filter((f) => f.cap_question_id === p.question_id);
    const answeredLines = mine.filter((f) => f.answer?.trim()).map((f) => `- ${f.question}\n  Owner: ${f.answer!.trim()}`);
    const evidence = [
      `CAP answer: "${p.answer === 'no' ? 'No' : 'Partially'}" to "${p.question}"`,
      p.note ? `Owner note: ${p.note}` : '',
      ...answeredLines,
    ].filter(Boolean).join('\n');
    const rc = guessRootCause(mine.map((f) => f.answer ?? '').join(' '));
    return {
      title: p.weakness_label,
      category: p.category,
      cap_question_ids: [p.question_id],
      evidence,
      root_cause: rc.cause,
      confidence: rc.confidence,
      severity: (p.score === 0 ? 'high' : 'medium') as 'high' | 'medium',
    };
  });
}

export function templateSolutions(findings: Finding[]) {
  return findings.map((f) => {
    const lib = LIBRARY[f.cap_question_ids?.[0] ?? ''];
    return {
      finding_id: f.id,
      problem: f.title,
      evidence: f.evidence,
      root_cause: f.root_cause,
      corrective_action: lib?.action ?? '1. Define the standard.\n2. Assign an owner.\n3. Review results monthly.',
      document_type: lib?.document_type ?? 'none',
      document_title: lib?.document_title ?? null,
      responsible_role: lib?.role ?? 'Owner',
      priority: f.severity === 'high' || f.severity === 'critical' ? 'high' : 'medium',
      phase: lib?.phase ?? 60,
      kpi_name: lib?.kpi_name ?? 'Completion of corrective action',
      kpi_baseline: null,
      kpi_target: lib?.kpi_target ?? 100,
      kpi_unit: lib?.kpi_unit ?? '%',
    };
  });
}

export function templateDocument(biz: Business, s: Solution, docType: 'policy' | 'sop', title: string): DocContent {
  const steps = s.corrective_action ?? '';
  if (docType === 'sop') {
    return { sections: [
      { heading: 'Purpose', body: `This procedure fixes the following problem at ${biz.name}: ${s.problem}.` },
      { heading: 'Scope', body: '[FILL IN: who and which work this procedure covers]' },
      { heading: 'Responsibilities', body: `- Procedure owner: ${s.responsible_role ?? 'Owner'}\n- [FILL IN: anyone else who performs or checks this work]` },
      { heading: 'Materials and Tools', body: '- [FILL IN: forms, software, equipment needed]' },
      { heading: 'Procedure', body: steps || '1. [FILL IN: step]' },
      { heading: 'Quality Checks', body: `- Measure: ${s.kpi_name ?? '[FILL IN]'} — target ${s.kpi_target ?? '[FILL IN]'} ${s.kpi_unit ?? ''}\n- [FILL IN: what "done right" looks like]` },
      { heading: 'Records', body: '- [FILL IN: what is recorded, where, and for how long]' },
      { heading: 'Review Schedule', body: 'Review this procedure every 6 months or after any repeat problem.' },
    ] };
  }
  return { sections: [
    { heading: 'Purpose', body: `This policy sets the standard at ${biz.name} to address: ${s.problem}.` },
    { heading: 'Scope', body: '[FILL IN: who this policy applies to]' },
    { heading: 'Policy Statement', body: `[FILL IN: the rule in one or two sentences]\nBackground: ${s.root_cause ?? ''}` },
    { heading: 'Responsibilities', body: `- Policy owner: ${s.responsible_role ?? 'Owner'}\n- All team members follow this policy.` },
    { heading: 'Procedures', body: steps || '- [FILL IN]' },
    { heading: 'Exceptions', body: 'Exceptions must be approved by the owner and recorded.' },
    { heading: 'Compliance and Records', body: `- Measure: ${s.kpi_name ?? '[FILL IN]'}\n- Legal, tax or licensing items: verify with the proper authority or a qualified professional.` },
    { heading: 'Review Schedule', body: 'Review this policy once a year or when the business changes.' },
  ] };
}

export function templateBlueprint(
  biz: Business,
  overall: number | null,
  cats: CategoryScore[],
  findings: Finding[],
  sols: Solution[],
  docs: DocumentRow[],
): DocContent {
  const bul = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : '- None recorded yet.');
  const byPhase = (n: number) => sols.filter((s) => s.phase === n && s.approval_status !== 'rejected');
  return { sections: [
    { heading: 'Executive Summary', body: `${biz.name}${biz.industry ? ` (${biz.industry})` : ''} scored ${overall ?? '—'}% on the CAP assessment. ${findings.length} confirmed weakness${findings.length === 1 ? '' : 'es'} drive ${sols.length} corrective action${sols.length === 1 ? '' : 's'} in a 30/60/90-day plan.${biz.primary_goal ? ` Primary goal: ${biz.primary_goal}.` : ''}` },
    { heading: 'Where the Business Stands (CAP)', body: bul(cats.map((c) => `${c.category}: ${c.pct ?? '—'}% (${c.rating})`)) },
    { heading: 'Principal Weaknesses and Root Causes', body: bul(findings.map((f) => `${f.title} — likely cause: ${f.root_cause ?? 'to be confirmed'}`)) },
    { heading: 'Operating Model', body: bul([...new Set(sols.map((s) => s.responsible_role).filter(Boolean) as string[])].map((r) => `${r}: ${sols.filter((s) => s.responsible_role === r).map((s) => s.problem).join('; ')}`)) + '\n- Weekly: check open actions and KPIs (30 minutes).\n- Monthly: performance review against targets.' },
    { heading: 'Required Policies and SOPs', body: bul(docs.filter((d) => d.doc_type !== 'blueprint').map((d) => `${d.title} (${d.doc_type.toUpperCase()}, ${d.status.replace('_', ' ')})`).concat(sols.filter((s) => s.document_type !== 'none' && !docs.some((d) => d.solution_id === s.id)).map((s) => `${s.document_title ?? s.problem} (${s.document_type.toUpperCase()}, not yet drafted)`))) },
    { heading: '30-Day Priorities', body: bul(byPhase(30).map((s) => `${s.problem} — ${s.responsible_role ?? 'Owner'}`)) },
    { heading: '60-Day Priorities', body: bul(byPhase(60).map((s) => `${s.problem} — ${s.responsible_role ?? 'Owner'}`)) },
    { heading: '90-Day Priorities', body: bul(byPhase(90).map((s) => `${s.problem} — ${s.responsible_role ?? 'Owner'}`)) },
    { heading: 'Measures of Success', body: bul(sols.filter((s) => s.kpi_name).map((s) => `${s.kpi_name}: target ${s.kpi_target ?? '—'} ${s.kpi_unit ?? ''}`)) },
    { heading: 'Review Cadence', body: '- Weekly action check.\n- Monthly KPI review.\n- Full CAP reassessment at 90 days.' },
  ] };
}
