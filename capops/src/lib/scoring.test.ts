import { describe, expect, it } from 'vitest';
import { scoreAssessment, rating } from './scoring';
import { templateFindings, templateFollowups, templateSolutions, LIBRARY } from './templates';
import { bodyToBlocks } from './export';
import type { Answer, CapQuestion, Finding } from './types';

const cats = ['Strategy & Planning', 'Customers & Sales', 'Operations & Quality', 'Financial Control', 'People & Compliance'];
const pre = ['STR', 'CUS', 'OPS', 'FIN', 'PPL'];
const Q: CapQuestion[] = cats.flatMap((c, ci) => [1, 2, 3, 4].map((i) => ({
  id: `${pre[ci]}-${i}`, category: c, category_order: ci + 1, sort_order: i, question: `Q ${pre[ci]}-${i}?`, guidance: null, weakness_label: `Weak ${pre[ci]}-${i}`,
})));
const all = (a: Answer) => Object.fromEntries(Q.map((q) => [q.id, { answer: a }]));

describe('CAP scoring', () => {
  it('all Yes = 100%, all No = 0%', () => {
    expect(scoreAssessment(Q, all('yes')).overallPct).toBe(100);
    expect(scoreAssessment(Q, all('no')).overallPct).toBe(0);
    expect(scoreAssessment(Q, all('partial')).overallPct).toBe(50);
  });

  it('excludes Not applicable from the denominator', () => {
    const ans = all('yes');
    ans['PPL-2'] = { answer: 'na' };
    ans['PPL-1'] = { answer: 'no' };
    const s = scoreAssessment(Q, ans);
    // 19 scorable questions, 18 Yes → 36/38
    expect(s.possible).toBe(38);
    expect(s.points).toBe(36);
    expect(s.overallPct).toBe(94.7);
    const ppl = s.categories.find((c) => c.category === 'People & Compliance')!;
    expect(ppl.possible).toBe(6);
    expect(ppl.pct).toBe(66.7);
    expect(ppl.na).toBe(1);
    expect(s.complete).toBe(true);
  });

  it('category of all N/A is not scored rather than 0 or 100', () => {
    const ans = all('yes');
    ['FIN-1', 'FIN-2', 'FIN-3', 'FIN-4'].forEach((id) => (ans[id] = { answer: 'na' }));
    const s = scoreAssessment(Q, ans);
    expect(s.categories.find((c) => c.category === 'Financial Control')!.pct).toBeNull();
    expect(s.overallPct).toBe(100);
  });

  it('flags incomplete assessments and lists missing questions', () => {
    const ans = all('yes');
    delete ans['OPS-3'];
    const s = scoreAssessment(Q, ans);
    expect(s.complete).toBe(false);
    expect(s.missing).toEqual(['OPS-3']);
    expect(s.answered).toBe(19);
  });

  it('ranks No before Partially, then weaker category first', () => {
    const ans = all('yes');
    ans['STR-1'] = { answer: 'partial' };
    ans['FIN-1'] = { answer: 'no' };
    ans['CUS-2'] = { answer: 'no' };
    ans['CUS-3'] = { answer: 'no' };
    const s = scoreAssessment(Q, ans);
    expect(s.priorities.map((p) => p.question_id)).toEqual(['CUS-2', 'CUS-3', 'FIN-1', 'STR-1']);
    expect(s.priorities.map((p) => p.rank)).toEqual([1, 2, 3, 4]);
  });

  it('rating bands', () => {
    expect([rating(85), rating(60), rating(59.9), rating(10), rating(null)]).toEqual(['Strong', 'Stable', 'At risk', 'Critical', 'Not scored']);
  });
});

describe('fallback templates', () => {
  it('library covers every question', () => {
    Q.forEach((q) => expect(LIBRARY[q.id]).toBeTruthy());
  });
  it('builds follow-ups, findings and solutions without AI', () => {
    const ans = all('yes');
    ans['FIN-1'] = { answer: 'no' };
    const s = scoreAssessment(Q, ans);
    const fu = templateFollowups(s.priorities);
    expect(fu).toHaveLength(2);
    const f = templateFindings(s.priorities, fu.map((x, i) => ({ ...x, answer: i === 1 ? 'Honestly no time to set it up' : '' })));
    expect(f[0].root_cause).toMatch(/time/i);
    expect(f[0].confidence).toBe('medium');
    const empty = templateFindings(s.priorities, fu.map((x) => ({ ...x, answer: null })));
    expect(empty[0].confidence).toBe('low');
    const sol = templateSolutions([{ ...(f[0] as unknown as Finding), id: 'f1', severity: 'high' }]);
    expect(sol[0].document_type).toBe('policy');
    expect(sol[0].phase).toBe(30);
    expect(sol[0].priority).toBe('high');
  });
});

describe('export body parsing', () => {
  it('turns "- " lines into bullets and others into paragraphs', () => {
    expect(bodyToBlocks('Intro\n- a\n- b\n\nAfter')).toEqual([
      { type: 'p', text: 'Intro' }, { type: 'bullets', items: ['a', 'b'] }, { type: 'p', text: 'After' },
    ]);
  });
});
