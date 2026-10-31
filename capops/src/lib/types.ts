export type Answer = 'yes' | 'partial' | 'no' | 'na';

export interface Business {
  id: string;
  owner_id: string;
  name: string;
  industry: string | null;
  business_stage: string | null;
  location: string | null;
  years_operating: number | null;
  employee_count: number | null;
  annual_revenue_range: string | null;
  products_services: string | null;
  primary_goal: string | null;
  biggest_challenge: string | null;
  created_at: string;
  updated_at: string;
}

export interface CapQuestion {
  id: string;
  category: string;
  category_order: number;
  sort_order: number;
  question: string;
  guidance: string | null;
  weakness_label: string;
}

export interface CategoryScore {
  category: string;
  order: number;
  points: number;
  possible: number;
  pct: number | null;
  rating: string;
  answered: number;
  na: number;
  total: number;
}

export interface Priority {
  question_id: string;
  category: string;
  question: string;
  weakness_label: string;
  answer: Answer;
  score: number;
  note: string | null;
  rank: number;
}

export interface Assessment {
  id: string;
  business_id: string;
  version: number;
  status: 'in_progress' | 'scored' | 'diagnosed' | 'confirmed';
  overall_pct: number | null;
  category_scores: CategoryScore[] | null;
  priorities: Priority[] | null;
  answered_count: number;
  created_at: string;
  updated_at: string;
  scored_at: string | null;
  confirmed_at: string | null;
}

export interface AnswerRow {
  assessment_id: string;
  question_id: string;
  answer: Answer | null;
  note: string | null;
}

export interface DiagnosisQuestion {
  id: string;
  assessment_id: string;
  cap_question_id: string | null;
  question: string;
  purpose: string | null;
  answer: string | null;
  source: 'ai' | 'template' | 'user';
  sort_order: number;
}

export interface Finding {
  id: string;
  assessment_id: string;
  business_id: string;
  category: string | null;
  cap_question_ids: string[];
  title: string;
  evidence: string | null;
  root_cause: string | null;
  confidence: 'low' | 'medium' | 'high';
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'proposed' | 'confirmed' | 'dismissed';
  source: 'ai' | 'template' | 'user';
}

export interface Solution {
  id: string;
  business_id: string;
  assessment_id: string | null;
  finding_id: string | null;
  problem: string;
  evidence: string | null;
  root_cause: string | null;
  corrective_action: string | null;
  document_type: 'none' | 'policy' | 'sop';
  document_title: string | null;
  responsible_role: string | null;
  priority: 'high' | 'medium' | 'low';
  phase: 30 | 60 | 90;
  target_date: string | null;
  kpi_name: string | null;
  kpi_baseline: number | null;
  kpi_target: number | null;
  kpi_unit: string | null;
  approval_status: 'draft' | 'approved' | 'rejected';
  progress_status: 'not_started' | 'in_progress' | 'blocked' | 'done';
  progress_note: string | null;
  source: 'ai' | 'template' | 'user';
  approved_at: string | null;
  created_at: string;
}

export interface DocSection { heading: string; body: string }
export interface DocContent { sections: DocSection[] }

export interface DocumentRow {
  id: string;
  business_id: string;
  solution_id: string | null;
  doc_type: 'policy' | 'sop' | 'blueprint';
  title: string;
  status: 'draft' | 'in_review' | 'approved';
  current_version: number;
  approved_version: number | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocVersion {
  id: string;
  document_id: string;
  version: number;
  content: DocContent;
  change_note: string | null;
  created_at: string;
}

export interface Plan {
  id: string;
  business_id: string;
  assessment_id: string | null;
  start_date: string;
  status: 'draft' | 'approved' | 'completed';
  approved_at: string | null;
  notes: string | null;
}

export interface KpiEntry {
  id: string;
  business_id: string;
  solution_id: string | null;
  kpi_name: string;
  value: number;
  recorded_on: string;
  note: string | null;
}
