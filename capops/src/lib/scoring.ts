import type { Answer, CapQuestion, CategoryScore, Priority } from './types';

export const ANSWER_POINTS: Record<Exclude<Answer, 'na'>, number> = { yes: 2, partial: 1, no: 0 };
export const ANSWER_LABEL: Record<Answer, string> = { yes: 'Yes', partial: 'Partially', no: 'No', na: 'Not applicable' };

export function rating(pct: number | null): string {
  if (pct === null) return 'Not scored';
  if (pct >= 80) return 'Strong';
  if (pct >= 60) return 'Stable';
  if (pct >= 40) return 'At risk';
  return 'Critical';
}

export interface ScoreResult {
  overallPct: number | null;
  overallRating: string;
  points: number;
  possible: number;
  categories: CategoryScore[];
  priorities: Priority[];
  answered: number;
  total: number;
  complete: boolean;
  missing: string[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * CAP scoring: Yes = 2, Partially = 1, No = 0.
 * "Not applicable" and unanswered questions are left out of the denominator.
 * Every No or Partially answer becomes an investigation priority — a signal to
 * look into, not proof of a root cause.
 */
export function scoreAssessment(
  questions: CapQuestion[],
  answers: Record<string, { answer: Answer | null; note?: string | null }>,
): ScoreResult {
  const qs = [...questions].sort((a, b) => a.category_order - b.category_order || a.sort_order - b.sort_order);
  const catMap = new Map<string, CategoryScore>();
  let points = 0;
  let possible = 0;
  let answered = 0;
  const missing: string[] = [];

  for (const q of qs) {
    if (!catMap.has(q.category)) {
      catMap.set(q.category, { category: q.category, order: q.category_order, points: 0, possible: 0, pct: null, rating: '', answered: 0, na: 0, total: 0 });
    }
    const c = catMap.get(q.category)!;
    c.total += 1;
    const a = answers[q.id]?.answer ?? null;
    if (!a) { missing.push(q.id); continue; }
    answered += 1;
    c.answered += 1;
    if (a === 'na') { c.na += 1; continue; }
    const p = ANSWER_POINTS[a];
    c.points += p; c.possible += 2;
    points += p; possible += 2;
  }

  const categories = [...catMap.values()].map((c) => {
    const pct = c.possible > 0 ? round1((c.points / c.possible) * 100) : null;
    return { ...c, pct, rating: rating(pct) };
  });
  const catPct = new Map(categories.map((c) => [c.category, c.pct ?? 100]));

  const priorities: Priority[] = qs
    .filter((q) => {
      const a = answers[q.id]?.answer;
      return a === 'no' || a === 'partial';
    })
    .map((q) => {
      const a = answers[q.id]!.answer as Answer;
      return {
        question_id: q.id,
        category: q.category,
        question: q.question,
        weakness_label: q.weakness_label,
        answer: a,
        score: ANSWER_POINTS[a as 'no' | 'partial'],
        note: answers[q.id]?.note ?? null,
        rank: 0,
      };
    })
    .sort((x, y) => x.score - y.score || (catPct.get(x.category)! - catPct.get(y.category)!))
    .map((p, i) => ({ ...p, rank: i + 1 }));

  const overallPct = possible > 0 ? round1((points / possible) * 100) : null;
  return {
    overallPct,
    overallRating: rating(overallPct),
    points,
    possible,
    categories,
    priorities,
    answered,
    total: qs.length,
    complete: missing.length === 0,
    missing,
  };
}
