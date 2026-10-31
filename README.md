# CapBlueprint — Mete Business Blueprint

Mete Business Consulting's Business Blueprint: takes a business idea through research, CAP (Customer Acquisition Program), OPS (Operations Performance System), a financial model and a 90-day launch plan, and produces a client-ready blueprint report.

- `app/mete-business-blueprint.html` — the Phase 1 app as one self-contained page. Open it in a browser; projects save in that browser.
- `design-system/` — brand tokens (navy #1B2A4E, brass #C9A227, warm white, slate), brand guide and cover.
- `tests/engine.test.js` — checks on the financial engine (unit economics, funnel, capacity, loans, cash timing, scenarios). It reads the engine straight from the app file. Run: `node tests/engine.test.js`

- `cap-ops/` — **METE CAP/OPS™** web app (built). Source in `capops/`; see `capops/README.md`. Uses Supabase for sign-in, data and server-side AI.
