// Minimal in-memory stand-in for Supabase Auth + PostgREST + Functions, for UI end-to-end tests.
const crypto = require('crypto');
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const USER = { id: '99999999-9999-4999-8999-999999999999', email: 'pete@test.local', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: now() };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;

const DEFAULTS = {
  businesses: () => ({ owner_id: USER.id }),
  assessments: () => ({ status: 'in_progress', overall_pct: null, category_scores: null, priorities: null, answered_count: 0, scored_at: null, confirmed_at: null }),
  diagnosis_questions: () => ({ source: 'ai', sort_order: 0, answer: null, purpose: null, cap_question_id: null }),
  findings: () => ({ status: 'proposed', confidence: 'medium', severity: 'medium', source: 'ai', cap_question_ids: [], evidence: null, root_cause: null, category: null }),
  solutions: () => ({ approval_status: 'draft', progress_status: 'not_started', priority: 'medium', phase: 30, document_type: 'none', source: 'ai', approved_at: null, kpi_baseline: null, kpi_target: null, kpi_name: null, kpi_unit: null, progress_note: null, target_date: null, finding_id: null, evidence: null, root_cause: null, corrective_action: null, document_title: null, responsible_role: null }),
  documents: () => ({ status: 'draft', current_version: 1, approved_version: null, approved_at: null, solution_id: null }),
  document_versions: () => ({ change_note: null }),
  implementation_plans: () => ({ status: 'draft', start_date: new Date().toISOString().slice(0, 10), approved_at: null, notes: null }),
  kpi_entries: () => ({ recorded_on: new Date().toISOString().slice(0, 10), note: null }),
  ai_runs: () => ({}),
  assessment_answers: () => ({ answer: null, note: null }),
};

function makeDb(questions) {
  const db = { cap_questions: questions };
  for (const t of Object.keys(DEFAULTS)) db[t] = [];
  return db;
}

function parseVal(v) {
  if (v === 'null') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}
const eq = (a, b) => (a === null || b === null ? a === b : String(a) === String(b));

function applyFilters(rows, params) {
  let out = rows;
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'on_conflict', 'offset', 'columns'].includes(k)) continue;
    const i = v.indexOf('.');
    const op = v.slice(0, i), val = parseVal(v.slice(i + 1));
    if (op === 'eq') out = out.filter((r) => eq(r[k], val));
    else if (op === 'neq') out = out.filter((r) => !eq(r[k], val));
    else if (op === 'is') out = out.filter((r) => r[k] === val);
    else if (op === 'in') { const set = String(val).replace(/^\(|\)$/g, '').split(','); out = out.filter((r) => set.includes(String(r[k]))); }
  }
  const order = params.get('order');
  if (order) {
    const keys = order.split(',').map((o) => { const [c, dir] = o.split('.'); return { c, desc: dir === 'desc' }; });
    out = [...out].sort((a, b) => {
      for (const { c, desc } of keys) { if (a[c] === b[c]) continue; const r = a[c] > b[c] ? 1 : -1; return desc ? -r : r; }
      return 0;
    });
  }
  if (params.get('limit')) out = out.slice(0, Number(params.get('limit')));
  return out;
}

const PK = { assessment_answers: ['assessment_id', 'question_id'] };

async function install(page, opts = {}) {
  const db = opts.db;
  const log = opts.log ?? [];
  await page.route('https://cpzhfefqvqjontyktwxr.supabase.co/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const json = (status, body, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: body === undefined ? '' : JSON.stringify(body) });
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });

    if (path.startsWith('/auth/v1/')) {
      if (path === '/auth/v1/token') return json(200, { access_token: JWT, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: USER });
      if (path === '/auth/v1/user') return json(200, USER);
      if (path === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
      return json(200, {});
    }
    if (path.startsWith('/functions/v1/')) {
      log.push(`fn ${path}`);
      const body = JSON.parse(req.postData() || '{}');
      db.ai_runs.push({ id: uid(), business_id: body.business_id, action: body.action, status: 'fallback', message: 'AI key not configured', created_at: now() });
      return json(200, { ok: false, error: 'ai_not_configured', message: 'AI is not configured on the server yet.' });
    }
    const m = path.match(/^\/rest\/v1\/(\w+)$/);
    if (!m) return json(404, { message: 'not found' });
    const table = m[1];
    const rows = db[table];
    if (!rows) return json(404, { message: `no table ${table}` });
    const params = url.searchParams;
    const wantsObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const prefer = req.headers()['prefer'] || '';
    const ret = (status, data) => {
      if (wantsObject) {
        if (data.length !== 1) return json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `${data.length} rows` });
        return json(status, data[0]);
      }
      return prefer.includes('return=representation') || method === 'GET' ? json(status, data) : route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    };
    log.push(`${method} ${table}`);

    if (method === 'GET' || method === 'HEAD') return ret(200, applyFilters(rows, params));
    if (method === 'POST') {
      let body = JSON.parse(req.postData() || '[]');
      if (!Array.isArray(body)) body = [body];
      const out = [];
      for (const b of body) {
        const keys = PK[table] || (params.get('on_conflict') ? params.get('on_conflict').split(',') : null);
        const existing = prefer.includes('merge-duplicates') && keys ? rows.find((r) => keys.every((k) => eq(r[k], b[k]))) : null;
        if (existing) { Object.assign(existing, b, { updated_at: now() }); out.push(existing); continue; }
        if (table === 'assessments' && rows.some((r) => r.business_id === b.business_id && r.version === b.version)) return json(409, { code: '23505', message: 'duplicate key value violates unique constraint' });
        const row = { id: uid(), created_at: now(), updated_at: now(), ...DEFAULTS[table]?.(), ...b };
        if (PK[table]) delete row.id;
        rows.push(row); out.push(row);
      }
      return ret(201, out);
    }
    if (method === 'PATCH') {
      const patch = JSON.parse(req.postData() || '{}');
      const hit = applyFilters(rows, params);
      hit.forEach((r) => Object.assign(r, patch, { updated_at: now() }));
      return ret(200, hit);
    }
    if (method === 'DELETE') {
      const hit = new Set(applyFilters(rows, params));
      db[table] = rows.filter((r) => !hit.has(r));
      return ret(200, [...hit]);
    }
    return json(405, {});
  });
}

module.exports = { install, makeDb };
