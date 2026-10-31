-- METE CAP/OPS™ schema. Applied to Supabase project "mete-cap-ops" (cpzhfefqvqjontyktwxr) on 2026-10-31.
create extension if not exists pgcrypto;

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  industry text,
  business_stage text check (business_stage in ('idea','startup','established','growing','struggling')),
  location text,
  years_operating numeric,
  employee_count int,
  annual_revenue_range text,
  products_services text,
  primary_goal text,
  biggest_challenge text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.businesses(owner_id);

-- Ownership check lives in a non-API schema so it cannot be called over REST.
create schema if not exists private;
create or replace function private.owns_business(bid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.businesses b where b.id = bid and b.owner_id = auth.uid());
$$;
revoke all on function private.owns_business(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.owns_business(uuid) to authenticated;

create table public.cap_questions (
  id text primary key,
  category text not null,
  category_order int not null,
  sort_order int not null,
  question text not null,
  guidance text,
  weakness_label text not null,
  active boolean not null default true
);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  version int not null,
  status text not null default 'in_progress' check (status in ('in_progress','scored','diagnosed','confirmed')),
  overall_pct numeric,
  category_scores jsonb,
  priorities jsonb,
  answered_count int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  scored_at timestamptz,
  confirmed_at timestamptz,
  unique (business_id, version)
);

create table public.assessment_answers (
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  question_id text not null references public.cap_questions(id),
  answer text check (answer in ('yes','partial','no','na')),
  note text,
  updated_at timestamptz not null default now(),
  primary key (assessment_id, question_id)
);

create table public.diagnosis_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  cap_question_id text references public.cap_questions(id),
  question text not null,
  purpose text,
  answer text,
  source text not null default 'ai' check (source in ('ai','template','user')),
  sort_order int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.findings (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  category text,
  cap_question_ids text[] default '{}',
  title text not null,
  evidence text,
  root_cause text,
  confidence text default 'medium' check (confidence in ('low','medium','high')),
  severity text default 'medium' check (severity in ('low','medium','high','critical')),
  status text not null default 'proposed' check (status in ('proposed','confirmed','dismissed')),
  source text default 'ai' check (source in ('ai','template','user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.solutions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  assessment_id uuid references public.assessments(id) on delete set null,
  finding_id uuid references public.findings(id) on delete set null,
  problem text not null,
  evidence text,
  root_cause text,
  corrective_action text,
  document_type text default 'none' check (document_type in ('none','policy','sop')),
  document_title text,
  responsible_role text,
  priority text default 'medium' check (priority in ('high','medium','low')),
  phase int default 30 check (phase in (30,60,90)),
  target_date date,
  kpi_name text,
  kpi_baseline numeric,
  kpi_target numeric,
  kpi_unit text,
  approval_status text not null default 'draft' check (approval_status in ('draft','approved','rejected')),
  progress_status text not null default 'not_started' check (progress_status in ('not_started','in_progress','blocked','done')),
  progress_note text,
  source text default 'ai' check (source in ('ai','template','user')),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  solution_id uuid references public.solutions(id) on delete set null,
  doc_type text not null check (doc_type in ('policy','sop','blueprint')),
  title text not null,
  status text not null default 'draft' check (status in ('draft','in_review','approved')),
  current_version int not null default 1,
  approved_version int,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version int not null,
  content jsonb not null,
  change_note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (document_id, version)
);

create table public.implementation_plans (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  assessment_id uuid references public.assessments(id) on delete set null,
  start_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft','approved','completed')),
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.kpi_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  solution_id uuid references public.solutions(id) on delete cascade,
  kpi_name text not null,
  value numeric not null,
  recorded_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  action text not null,
  status text not null check (status in ('ok','error','fallback')),
  message text,
  created_at timestamptz not null default now()
);

create index on public.assessments(business_id);
create index on public.assessment_answers(question_id);
create index on public.diagnosis_questions(assessment_id);
create index on public.diagnosis_questions(cap_question_id);
create index on public.findings(assessment_id);
create index on public.findings(business_id);
create index on public.solutions(business_id);
create index on public.solutions(finding_id);
create index on public.solutions(assessment_id);
create index on public.documents(business_id);
create index on public.documents(solution_id);
create index on public.document_versions(document_id);
create index on public.implementation_plans(business_id);
create index on public.implementation_plans(assessment_id);
create index on public.kpi_entries(business_id);
create index on public.kpi_entries(solution_id);
create index on public.ai_runs(business_id);

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
do $$ declare t text; begin
  foreach t in array array['businesses','assessments','assessment_answers','diagnosis_questions','findings','solutions','documents','implementation_plans'] loop
    execute format('create trigger trg_touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

alter table public.businesses enable row level security;
alter table public.cap_questions enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_answers enable row level security;
alter table public.diagnosis_questions enable row level security;
alter table public.findings enable row level security;
alter table public.solutions enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.implementation_plans enable row level security;
alter table public.kpi_entries enable row level security;
alter table public.ai_runs enable row level security;

create policy "owner all" on public.businesses for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "read questions" on public.cap_questions for select to authenticated using (true);
do $$ declare t text; begin
  foreach t in array array['assessments','findings','solutions','documents','implementation_plans','kpi_entries','ai_runs'] loop
    execute format('create policy "business owner" on public.%I for all to authenticated using (private.owns_business(business_id)) with check (private.owns_business(business_id))', t);
  end loop;
end $$;
create policy "business owner" on public.assessment_answers for all to authenticated
  using (exists (select 1 from public.assessments a where a.id = assessment_id and private.owns_business(a.business_id)))
  with check (exists (select 1 from public.assessments a where a.id = assessment_id and private.owns_business(a.business_id)));
create policy "business owner" on public.diagnosis_questions for all to authenticated
  using (exists (select 1 from public.assessments a where a.id = assessment_id and private.owns_business(a.business_id)))
  with check (exists (select 1 from public.assessments a where a.id = assessment_id and private.owns_business(a.business_id)));
create policy "business owner" on public.document_versions for all to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id and private.owns_business(d.business_id)))
  with check (exists (select 1 from public.documents d where d.id = document_id and private.owns_business(d.business_id)));

insert into public.cap_questions (id, category, category_order, sort_order, question, guidance, weakness_label) values
('STR-1','Strategy & Planning',1,1,'Do you have written goals for the next 12 months with number targets (revenue, customers or profit)?','Goals in your head count as Partially. Written goals with numbers count as Yes.','No measurable 12-month goals'),
('STR-2','Strategy & Planning',1,2,'Do you compare actual results against those goals at least monthly?','A monthly look at sales or profit versus target counts as Yes.','Results not reviewed against goals'),
('STR-3','Strategy & Planning',1,3,'Can you name your ideal customer and the main reason they choose you over a competitor?','Answer Yes only if you could write both in one sentence each.','Unclear ideal customer and value proposition'),
('STR-4','Strategy & Planning',1,4,'Are your prices set from your full costs and a target margin, not only from competitor prices?','Full costs include materials, labor (including your own time), packaging, fees and overhead.','Pricing not tied to costs and margin'),
('CUS-1','Customers & Sales',2,1,'Do you track where each new customer came from (referral, social media, walk-in, etc.)?','A simple tally or a field in your sales records counts.','Customer sources not tracked'),
('CUS-2','Customers & Sales',2,2,'Do you have a repeatable process for following up on leads and quotes?','Yes means every lead gets the same follow-up steps on a set timeline.','No lead and quote follow-up process'),
('CUS-3','Customers & Sales',2,3,'Do you know how many leads, sales and repeat customers you had last month?','You should be able to give numbers, not estimates.','Sales funnel numbers unknown'),
('CUS-4','Customers & Sales',2,4,'Do you ask satisfied customers for reviews or referrals on a regular schedule?','Occasional asking counts as Partially.','No review or referral system'),
('OPS-1','Operations & Quality',3,1,'Are your core daily tasks (making/delivering the product or service, handling orders) written as step-by-step procedures?','Written checklists or SOPs someone else could follow count as Yes.','Core work not documented as procedures'),
('OPS-2','Operations & Quality',3,2,'Could the business deliver to standard for two weeks if the owner were unavailable?','Think about orders, customer contact, payments and quality.','Business depends on the owner'),
('OPS-3','Operations & Quality',3,3,'Do you track complaints, defects or rework and fix their causes?','Logging issues and changing how work is done counts as Yes.','Quality problems not tracked or corrected'),
('OPS-4','Operations & Quality',3,4,'Do you know your weekly capacity, and whether you could handle 25% more orders?','Capacity = the most you can deliver per week to standard.','Capacity unknown or maxed out'),
('FIN-1','Financial Control',4,1,'Are business and personal money fully separated (own bank account and bookkeeping)?','A separate account used only for the business counts as Yes.','Business and personal money mixed'),
('FIN-2','Financial Control',4,2,'Are your books updated at least monthly so you can see profit and loss?','Bookkeeping software or a kept-up spreadsheet counts.','Books not current'),
('FIN-3','Financial Control',4,3,'Do you know your gross margin and break-even sales level?','Gross margin = (sales − direct costs) ÷ sales.','Margin and break-even unknown'),
('FIN-4','Financial Control',4,4,'Do you forecast cash for at least the next 90 days?','A week-by-week or month-by-month cash plan counts.','No cash forecast'),
('PPL-1','People & Compliance',5,1,'Does every recurring task have a named person responsible for it?','For a solo owner, Yes means tasks are listed and scheduled.','Unclear responsibility for recurring tasks'),
('PPL-2','People & Compliance',5,2,'Do employees or contractors have written role expectations and training?','Mark Not applicable if you have no one else working in the business.','No written roles or training'),
('PPL-3','People & Compliance',5,3,'Are licenses, permits, insurance and tax filings tracked with renewal dates?','A calendar or list with due dates counts as Yes.','Compliance deadlines not tracked'),
('PPL-4','People & Compliance',5,4,'Do you have written policies for key risks (refunds, safety, customer data, cash handling)?','Policies you could hand to a customer or employee count as Yes.','Key risk policies missing');
