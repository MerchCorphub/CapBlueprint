# METE CAP/OPS™

AI-assisted business consulting web app for Mete, Benefits Corporation.
CAP (business assessment) finds performance weaknesses; OPS (Operational Performance System) builds the corrective actions, policies, SOPs, blueprint and 30/60/90-day plan, then tracks results.

- **Live data:** Supabase project `mete-cap-ops` (`cpzhfefqvqjontyktwxr`, us-east-1)
- **Built site:** `../cap-ops/` (served by GitHub Pages at `/capblueprint/cap-ops/`)
- **Source:** this folder (React + TypeScript + Vite)

## Screens

1. Welcome (sign in / register, journey overview)
2. Business Profile
3. CAP Questionnaire — 20 questions, 5 categories, autosaves every answer and note
4. CAP Results — overall and category scores, investigation priorities, CAP report (PDF/Word)
5. AI Diagnosis — root-cause follow-up questions, proposed findings, confirm/dismiss/edit
6. OPS Solutions — one corrective-action record per confirmed finding, edit/approve/reject
7. Business Blueprint — operating blueprint plus every required policy/SOP
8. Implementation Plan — 30/60/90 board, plan approval, task status
9. Performance Dashboard — progress, KPI entry and trend, reassessment comparison
10. Reports & Documents — consolidated report, CAP reports, every document as PDF/Word, AI activity log

Document editor (`#/documents/:id`): editable sections, save-as-new-version with change note, version history with view/restore, draft → in review → approved. Editing an approved document creates a new draft version; the approved version number is kept.

## Rules implemented

- Scoring: Yes = 2, Partially = 1, No = 0. Not applicable and unanswered are excluded from the denominator. Category % and overall %. Ratings: Strong 80+, Stable 60–79, At risk 40–59, Critical < 40.
- Every No/Partially answer becomes an investigation priority (No first, then weaker category). The app says plainly that a low score is a signal, not proof of cause; findings need owner confirmation.
- Each scored assessment version is locked. Reassessment creates a new version (previous answers shown as "Last time").
- Every confirmed finding produces a solution record with: problem, evidence, root cause, corrective action, policy/SOP required, responsible role, priority, target date, KPI (baseline/target/unit), approval status, progress status.

## Security

- Supabase Auth (email + password, PKCE). Row Level Security on every table; every row is tied to a business, and only the business owner can read or write it (`private.owns_business()`, not exposed over the API). Tested: a second user cannot read, insert into, or change another owner's data.
- The publishable key in `src/lib/supabase.ts` is public by design. No secret is in the browser.
- AI runs only in the `cap-ai` Edge Function (`supabase/functions/cap-ai`). It checks the signed-in user, loads the business through RLS, and logs every call to `ai_runs`.

## AI setup (one step)

AI is off until the key is set. Without it, every AI step falls back to the built-in Mete standard library (labelled "Standard" in the app and logged), so the whole journey still works.

In the Supabase dashboard → Edge Functions → Secrets, add:

- `ANTHROPIC_API_KEY` = your Anthropic API key
- optional `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`)

## Auth settings to check (Supabase dashboard → Authentication → URL Configuration)

- **Site URL:** the address where the app is hosted, e.g. `https://merchcorphub.github.io/capblueprint/cap-ops/`
- **Redirect URLs:** add the same address (needed for email confirmation and password-reset links)
- Supabase's built-in email sender is rate-limited; for real customers, set up custom SMTP (Authentication → Emails).

## Develop

```
npm install
npm run dev        # local dev server
npm test           # scoring, template and export tests
npm run build      # type-check and build into ../cap-ops
```

`e2e/` holds a Playwright click-through of the full 10-screen journey against an in-memory stand-in for the Supabase API (`node e2e/journey.cjs http://localhost:4173/` after `npx vite preview`).

## Database

`supabase/migrations/20261031000000_cap_ops_schema.sql` recreates the full schema, policies and the 20-question bank. Questions live in `cap_questions`; edit wording there without a code change.
