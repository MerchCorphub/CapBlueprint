const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { install, makeDb } = require('./fake-supabase.cjs');

const BASE = process.argv[2] || 'http://localhost:4173/';
const OUT = path.join(__dirname, 'shots');  // git-ignored
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|net::/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
  const db = makeDb(JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'))));
  await install(page, { db });
  const shot = async (n) => { await sleep(400); await page.screenshot({ path: path.join(OUT, `${n}.png`), fullPage: true }); };
  const step = (s) => console.log('STEP', s);
  try {

  step('auth');
  await page.goto(BASE);
  await shot('01-auth');
  await page.getByLabel('Email').fill('pete@test.local');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Create business profile').first().waitFor();
  await shot('02-welcome-empty');

  step('profile');
  await page.getByRole('link', { name: 'Create business profile' }).click();
  await page.getByLabel('Business name *').fill('Sweet Rise Bakery');
  await page.getByLabel('Industry').fill('Cottage food bakery');
  await page.getByLabel('Location').fill('Tucker, GA');
  await page.getByLabel('People working in the business').fill('2');
  await page.getByLabel('Primary goal for the next 12 months').fill('Reach $8,000 in monthly sales');
  await shot('03-profile');
  await page.getByRole('button', { name: 'Save and start CAP' }).click();

  step('questionnaire');
  await page.getByText('of 20 answered').waitFor();
  const plan = { 'STR-1': 'partial', 'STR-2': 'no', 'STR-4': 'no', 'CUS-1': 'no', 'CUS-2': 'partial', 'OPS-1': 'no', 'OPS-3': 'partial', 'FIN-1': 'no', 'FIN-4': 'no', 'PPL-2': 'na', 'PPL-3': 'partial' };
  const label = { yes: 'Yes', partial: 'Partially', no: 'No', na: 'Not applicable' };
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'))).map((q) => q.id);
  for (const id of ids) {
    const a = plan[id] ?? 'yes';
    await page.locator(`#q-${id} .answers label`).filter({ hasText: new RegExp(`^${label[a]}$`) }).click();
  }
  await page.locator('#q-FIN-1 details summary').click();
  await page.getByLabel('Note for FIN-1').fill('Use my personal checking for supplies');
  await sleep(1200);
  await shot('04-questionnaire');
  const stored = db.assessment_answers.length;
  console.log('answers stored', stored, 'FIN-1 note', db.assessment_answers.find((r) => r.question_id === 'FIN-1')?.note);
  await page.getByRole('button', { name: 'Score my assessment' }).first().click();

  step('results');
  await page.getByText('Score by category').waitFor();
  const a = db.assessments[0];
  console.log('overall', a.overall_pct, 'status', a.status, 'cats', a.category_scores.map((c) => `${c.category}:${c.pct}`).join(' | '), 'priorities', a.priorities.length);
  await shot('05-results');
  const [dl1] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CAP report (PDF)' }).click()]);
  await dl1.saveAs(path.join(OUT, dl1.suggestedFilename()));
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CAP report (Word)' }).click()]);
  await dl2.saveAs(path.join(OUT, dl2.suggestedFilename()));

  step('diagnosis');
  await page.getByRole('link', { name: 'Start AI Diagnosis' }).click();
  await page.getByRole('button', { name: 'Generate follow-up questions' }).click();
  await page.getByText('Mete standard library').waitFor();
  await page.locator('textarea[id^="dq-"]').first().waitFor();
  const boxes = page.locator('textarea[id^="dq-"]');
  const n = await boxes.count();
  for (let i = 0; i < n; i++) await boxes.nth(i).fill(i % 2 ? 'Honestly no time to set it up — I am busy baking.' : 'It happens most weeks.');
  await sleep(1200);
  await shot('06-diagnosis-questions');
  console.log('followups', n, 'answered in db', db.diagnosis_questions.filter((q) => q.answer).length);
  await page.getByRole('button', { name: 'Analyze answers' }).click();
  await page.getByText('awaiting review').waitFor();
  await page.locator('.card').filter({ hasText: 'Business and personal money mixed' }).last().waitFor();
  // Confirm all but one; dismiss one.
  const cb = () => page.getByRole('button', { name: 'Confirm', exact: true });
  await cb().first().waitFor();
  console.log('confirm buttons', await cb().count());
  while ((await cb().count()) > 1) { const before = await cb().count(); await cb().first().click(); await page.waitForFunction((n) => document.querySelectorAll('button').length && [...document.querySelectorAll('button')].filter((b) => b.textContent === 'Confirm').length < n, before, { timeout: 5000 }); }
  await page.getByRole('button', { name: 'Dismiss', exact: true }).last().click();
  await sleep(500);
  await shot('07-diagnosis-findings');
  console.log('findings', db.findings.map((f) => `${f.status}`).join(','));
  await page.getByRole('button', { name: 'Confirm CAP findings and go to OPS' }).click();

  step('ops');
  await page.getByRole('button', { name: /Generate actions for/ }).click();
  await page.getByRole('button', { name: /Approve all/ }).waitFor();
  await page.getByRole('button', { name: /Approve all/ }).click();
  await sleep(600);
  await shot('08-ops');
  console.log('solutions', db.solutions.length, 'approved', db.solutions.filter((s) => s.approval_status === 'approved').length, 'with target dates', db.solutions.filter((s) => s.target_date).length);

  step('doc editor');
  await page.getByRole('button', { name: /Draft (POLICY|SOP)/ }).first().click();
  await page.getByText('Version history').waitFor();
  await page.getByLabel('Section 2 text').fill('Applies to all money coming into and going out of Sweet Rise Bakery.\n- Owner\n- Any helper who takes payments');
  await page.getByLabel('What changed?').fill('Filled in scope');
  await page.getByRole('button', { name: 'Save new version' }).click();
  await page.getByText('Saved as a new version').waitFor();
  await page.getByRole('button', { name: /Approve version 2/ }).click();
  await page.getByText('Version 2 approved').waitFor();
  await shot('09-doc-editor');
  const [dl3] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Word', exact: true }).click()]);
  await dl3.saveAs(path.join(OUT, dl3.suggestedFilename()));
  console.log('docs', db.documents.map((d) => `${d.title}:${d.status}:v${d.current_version}/appr${d.approved_version}`).join(' ; '), 'versions', db.document_versions.length);

  step('blueprint');
  await page.getByRole('link', { name: 'Business Blueprint' }).click();
  await page.getByRole('button', { name: /Draft all \d+ missing/ }).click();
  await page.getByText(/used the standard template/).first().waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'Generate blueprint' }).click();
  await page.getByText('Version history').waitFor();
  await shot('10-blueprint-doc');
  await page.getByRole('link', { name: 'Business Blueprint' }).click();
  await shot('11-blueprint');

  step('plan');
  await page.getByRole('link', { name: 'Implementation Plan' }).first().click();
  await page.getByRole('button', { name: 'Approve plan' }).click();
  await page.getByText('Plan approved').waitFor();
  const sel = page.getByLabel('Status').first();
  await sel.selectOption('done');
  await sleep(600);
  await page.getByLabel('Status').nth(1).selectOption('in_progress');
  await sleep(600);
  await shot('12-plan');
  console.log('plan', db.implementation_plans.map((p) => p.status).join(','), 'done', db.solutions.filter((s) => s.progress_status === 'done').length);

  step('dashboard');
  await page.getByRole('link', { name: 'Performance Dashboard' }).click();
  await page.getByLabel('Value').fill('60');
  await page.getByLabel('Date').fill('2026-10-01');
  await page.getByRole('button', { name: 'Record measurement' }).click();
  await page.getByText('Measurement saved').waitFor();
  await page.getByLabel('Value').fill('85');
  await page.getByLabel('Date').fill('2026-10-31');
  await page.getByRole('button', { name: 'Record measurement' }).click();
  await sleep(800);
  await shot('13-dashboard');

  step('reassess');
  await page.getByRole('button', { name: 'Start reassessment' }).click();
  await page.getByText('Last time:').first().waitFor();
  for (const id of ids) {
    const a2 = plan[id] === 'no' ? 'partial' : plan[id] === 'partial' ? 'yes' : plan[id] ?? 'yes';
    await page.locator(`#q-${id} .answers label`).filter({ hasText: new RegExp(`^${label[a2]}$`) }).click();
  }
  await page.getByRole('button', { name: 'Score my assessment' }).first().click();
  await page.getByText('Score by category').waitFor();
  console.log('v2 overall', db.assessments[1].overall_pct);
  await page.getByRole('link', { name: 'Performance Dashboard' }).click();
  await page.getByText('Assessment history').waitFor();
  await shot('14-dashboard-after-reassess');

  step('reports');
  await page.getByRole('link', { name: 'Reports & Documents' }).click();
  await page.getByText('Consolidated business report').waitFor();
  await shot('15-reports');
  const cons = page.locator('.card').filter({ hasText: 'Consolidated business report' });
  const [dl4] = await Promise.all([page.waitForEvent('download'), cons.getByRole('button', { name: 'PDF' }).click()]);
  await dl4.saveAs(path.join(OUT, dl4.suggestedFilename()));
  const [dl5] = await Promise.all([page.waitForEvent('download'), cons.getByRole('button', { name: 'Word' }).click()]);
  await dl5.saveAs(path.join(OUT, dl5.suggestedFilename()));

  step('welcome + mobile');
  await page.getByRole('link', { name: 'Welcome' }).click();
  await shot('16-welcome');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: /Continue/ }).click().catch(() => {});
  await page.goto(BASE + '#/cap');
  await shot('17-mobile-cap');
  await page.getByRole('button', { name: '☰ Menu' }).click();
  await shot('18-mobile-menu');

  console.log('ERRORS', errors.length ? errors : 'none');
  await browser.close();
  } catch (e) { console.error('FAILED', e.message.split('\n')[0]); await page.screenshot({ path: path.join(OUT, 'FAIL.png'), fullPage: true }); console.log('ERRORS', errors); console.log('db', JSON.stringify({ b: db.businesses.length, a: db.assessments })); process.exit(1); }
})();
