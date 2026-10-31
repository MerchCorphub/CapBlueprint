// METE CAP/OPS — server-side AI function.
// The browser never sees the AI key. Every call is tied to the signed-in user,
// and the business is loaded through Row Level Security so a user can only
// run AI against a business they own.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const GROUND_RULES = `You are the METE CAP/OPS consulting engine for small businesses.
Rules you must follow:
- Use only facts the owner supplied. Never invent numbers, names, laws or results.
- A low assessment score is a signal to investigate, not proof of a root cause.
- When the owner's answers are too thin to support a conclusion, say so, lower confidence, and say what to confirm.
- Write in plain words for a busy owner. Short sentences. No jargon.
- Legal, tax and licensing items say "verify with the proper authority or a qualified professional".
- Respond with a single JSON object only, matching the requested shape. No markdown fences, no commentary.`;

const PROMPTS: Record<string, (p: any) => string> = {
  followups: (p) => `Business profile:\n${JSON.stringify(p.profile, null, 2)}\n\nCAP investigation priorities (low-scoring answers, with any owner notes):\n${JSON.stringify(p.priorities, null, 2)}\n\nWrite follow-up questions that uncover the ROOT CAUSE behind each priority (why it is happening, what it costs, what has been tried). 1-2 questions per priority, at most 14 total. Questions must be answerable in a few sentences by the owner.\nReturn: {"questions":[{"cap_question_id":"<id from priorities>","question":"...","purpose":"what this answer will tell us"}]}`,
  findings: (p) => `Business profile:\n${JSON.stringify(p.profile, null, 2)}\n\nCategory scores:\n${JSON.stringify(p.scores, null, 2)}\n\nInvestigation priorities:\n${JSON.stringify(p.priorities, null, 2)}\n\nFollow-up questions and the owner's answers:\n${JSON.stringify(p.followups, null, 2)}\n\nGroup related priorities into distinct business weaknesses (usually 3-7). For each give evidence that cites the owner's own answers, and the most likely root cause. If a follow-up was unanswered or vague, set confidence "low" and say what must be confirmed.\nReturn: {"findings":[{"title":"short weakness name","category":"one of the CAP categories","cap_question_ids":["..."],"evidence":"...","root_cause":"...","confidence":"low|medium|high","severity":"low|medium|high|critical"}]}`,
  solutions: (p) => `Business profile:\n${JSON.stringify(p.profile, null, 2)}\n\nConfirmed findings (each has an id):\n${JSON.stringify(p.findings, null, 2)}\n\nFor EACH finding write exactly one OPS corrective-action record. Use existing resources first; keep actions realistic for a small business. Choose phase 30, 60 or 90 (days) by urgency and dependency (fix foundations like money separation and records first). document_type is "policy" for rules/standards, "sop" for step-by-step procedures, or "none". The KPI must be something the owner can count; leave kpi_baseline null if unknown.\nReturn: {"solutions":[{"finding_id":"...","problem":"...","evidence":"...","root_cause":"...","corrective_action":"numbered concrete steps","document_type":"policy|sop|none","document_title":"... or null","responsible_role":"e.g. Owner, Office Manager","priority":"high|medium|low","phase":30,"kpi_name":"...","kpi_baseline":null,"kpi_target":0,"kpi_unit":"e.g. %, $, count/week"}]}`,
  document: (p) => `Business profile:\n${JSON.stringify(p.profile, null, 2)}\n\nOPS solution this document supports:\n${JSON.stringify(p.solution, null, 2)}\n\nWrite an editable ${p.doc_type === "sop" ? "Standard Operating Procedure" : "policy"} titled "${p.title}" for this specific business. ${p.doc_type === "sop" ? "Sections: Purpose, Scope, Responsibilities, Materials/Tools, Procedure (numbered steps), Quality Checks, Records, Review Schedule." : "Sections: Purpose, Scope, Policy Statement, Responsibilities, Procedures, Exceptions, Compliance & Records, Review Schedule."} Use "- " for bullet lines and "1. " for numbered lines inside a body. Mark anything the owner must fill in as [FILL IN: ...].\nReturn: {"title":"...","sections":[{"heading":"...","body":"..."}]}`,
  blueprint: (p) => `Business profile:\n${JSON.stringify(p.profile, null, 2)}\n\nCAP results:\n${JSON.stringify(p.scores, null, 2)}\n\nConfirmed findings:\n${JSON.stringify(p.findings, null, 2)}\n\nOPS solutions:\n${JSON.stringify(p.solutions, null, 2)}\n\nWrite the Business Operating Blueprint: how this business should run once the corrections are in place. Sections: Executive Summary, Where the Business Stands (CAP), Principal Weaknesses and Root Causes, Operating Model (who does what, weekly rhythm), Customer & Sales System, Operations & Quality System, Financial Control System, People & Compliance System, Required Policies and SOPs, 30/60/90-Day Priorities, Measures of Success, Review Cadence. Use "- " bullets inside bodies. Do not invent figures.\nReturn: {"title":"Business Operating Blueprint","sections":[{"heading":"...","body":"..."}]}`,
};

function extractJson(text: string): any {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("AI returned no JSON");
  return JSON.parse(text.slice(start, end + 1));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization");
  if (!auth) return json({ ok: false, error: "not_signed_in" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad_request" }, 400); }
  const { action, business_id, payload } = body ?? {};
  if (!PROMPTS[action] || !business_id) return json({ ok: false, error: "bad_request" }, 400);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: biz, error: bizErr } = await supabase.from("businesses").select("id").eq("id", business_id).maybeSingle();
  if (bizErr || !biz) return json({ ok: false, error: "business_not_found" }, 404);

  const log = (status: string, message: string) =>
    supabase.from("ai_runs").insert({ business_id, action, status, message: message.slice(0, 500) });

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) {
    await log("fallback", "AI key not configured");
    return json({ ok: false, error: "ai_not_configured", message: "AI is not configured on the server yet." });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 110_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5",
        max_tokens: 8000,
        system: GROUND_RULES,
        messages: [{ role: "user", content: PROMPTS[action](payload ?? {}) }],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      await log("error", `AI HTTP ${res.status}: ${t}`);
      return json({ ok: false, error: "ai_failed", message: `The AI service returned an error (${res.status}).` });
    }
    const data = await res.json();
    const text = (data.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
    const result = extractJson(text);
    await log("ok", "completed");
    return json({ ok: true, result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await log("error", msg);
    return json({ ok: false, error: "ai_failed", message: msg.includes("abort") ? "The AI took too long to respond." : "The AI response could not be read." });
  } finally {
    clearTimeout(timer);
  }
});
