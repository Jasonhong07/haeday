# TASKS · Haeday v1

Rules: one milestone at a time, in order. A box is ticked only with evidence recorded in `docs/LAUNCH_EVIDENCE.md` (command, environment, result). Dates are targets (D13).

## M0 · Foundation (9/24)
- [x] Repo: Next.js App Router + TS strict + pnpm, ESLint, Vitest, Playwright skeleton, GitHub Actions (typecheck, lint, test) · CI file written, first GitHub run pending repo creation
- [x] Pin versions: Node LTS (record exact), pnpm via `npm i -g pnpm@<ver>`, Python 3.12 for tools/oracle, lockfiles committed; record in DECISIONS D12 · Python choice pending (D12/D21)
- [x] server/env.ts (ARCHITECTURE §7), APP_ENV / PAYMENTS_MODE handling; app boots without Stripe/LLM keys (checkout disabled)
- [x] Drizzle schema v1 (all ARCHITECTURE §2 tables) + migration committed
- [x] pg-boss worker with heartbeat; **transaction proof test**: insert row + enqueue inside one Drizzle transaction, throw → both rolled back; commit → job exists
- [x] Health endpoints live/ready
- [ ] (Jason accounts needed) Railway `staging` deployed (web + worker + Postgres), Sentry test event received, landing placeholder at staging URL
- [x] `settings` table + SALES_ENABLED read path

## M1 · Chart engine (9/24–9/26) · release gate 9/27 23:59 CT
- [ ] Choose calendar library (lunar-javascript or tyme4ts) or implement stems/branches directly; record license + version (D12)
- [ ] tools/oracle (Python + Skyfield + zoneinfo/tzdata pinned) → `data/jie_1900_2100.json` (+ ephemeris name/hash) via `pnpm oracle:update`; Jason approves the diff
- [ ] Bundled GeoNames cities15000 subset with lat/lon/tz; `GET /api/places?q=` autocomplete; server-side placeId resolution
- [ ] Engine implements ENGINE_SPEC §2–§4 exactly, returns the §3 union
- [ ] `fixtures/manifest.json` with F01–F30; `pnpm oracle:verify` in CI compares every step (utc, offsets, jie neighbors, trueSolar within tolerance, pillars, warnings)
- [ ] Unit tests: 五虎遁, 五鼠遁, ten-god tables, visible counts with 6/8 denominators, day anchor continuity 1900–2030
- [ ] Unknown-time minute enumeration: 1-group, day-split (disclosure text exact), month-split (question)
- [ ] Jason: `docs/crosscheck.md` with 10 cases vs two Korean apps; every difference explained
- Gate: all fixtures pass and crosscheck explained → paid sales may open later. If not, keep building; sales stay off (D10).

## M2 · Input + free chart (9/27)
- [ ] /saju per PRD §3 (three time modes), /chart/[id] per PRD §4 (fold, gap, boundary questions; disclosure; details-confirm; already-owned state)
- [ ] Edit creates a new chart revision; old revision unchanged
- [ ] Share image 1080×1920 (no birth data) with preview
- [ ] /method page with policy explanation and GeoNames attribution
- [ ] Mobile 360–430 px, keyboard, focus ring, screen-reader text for element bars, reduced motion
- [ ] E2E: fold case (1995-10-29 01:30 New York), gap case (1995-04-02 02:30), unknown time with day split

## M3 · Payments in test mode (9/28)
- [ ] PaymentAdapter + Stripe Checkout (card + wallets), consent checkbox, snapshot on order creation, reuse open session, "already owned"
- [ ] Webhook per ARCHITECTURE §4.3 with the same-transaction enqueue
- [ ] Tests: duplicate event; completed after refund (stays refunded); wrong livemode; wrong amount/price; session not matching order; success URL opened without payment; double-click checkout (one order); edit during checkout (paid order keeps its snapshot); SALES soft stop; tax present (subtotal validated, total stored)
- [ ] Reconciliation function shared with webhook validation

## M4 · Reading generation (9/29)
- [ ] D11: pick LLM + model with structured output; record cost per reading from 5 real test calls
- [ ] Prompt per PRD §7 with facts + approved snippets; Zod schema; content checks (word range, forbidden claims list, usedSnippetIds ⊆ provided)
- [ ] Worker per ARCHITECTURE §4.4 with fencing tokens and deadlines; email_outbox
- [ ] Tests: timeout twice then success (one reading, one email); refund starts during generation (late result not saved); email provider down (no regeneration, no refund); worker killed mid-generation (retry completes once)
- [ ] /order/[id] status page and /r/[id] reading page (hanji layout), escaped rendering

## M5 · Reading quality (9/30)
- [ ] Jason finishes content/library (PRD §9) with ids/versions
- [ ] Script generates 15 samples across all 10 day masters incl. 3 unknown-time charts
- [ ] Jason scores; fix prompt/library; regenerate; ≥ 12/15 pass and zero factual/unsafe errors

## M6 · Email, identity, refunds, ops (10/1)
- [ ] Resend domain verified (SPF/DKIM), delivery email template, outbox worker, bounce handling
- [ ] Magic link per ARCHITECTURE §4.7; /my; guest→customer linking on verification
- [ ] Refund service §4.8 + /refund/[orderId] POST + /admin actions; disputes table from webhooks
- [ ] Tests: attacker pays with admin's email → no admin access; attacker enters victim email → cannot see victim's past orders; two concurrent token uses → one succeeds; cron + admin + customer refund at once → one Stripe refund; refund pending shown as pending
- [ ] Crons: 5-min alert, 15-min deadline, reconciliation, retention; hard stop button
- [ ] Restore drill (ARCHITECTURE §8) on staging

## M7 · Legal, analytics, SEO, launch readiness (10/1–10/2 AM)
- [ ] /privacy /terms /refunds from PRD §12 (Jason edits); seller name per D04
- [ ] PostHog allowlisted events; test that sends sample birth data/email through the flow and asserts none reaches PostHog/Sentry/logs
- [ ] /go with bounded UTM, sitemap, metadata, OG image, PWA manifest, security headers
- [ ] Production environment created with TEST keys first; smoke test
- [ ] Launch checklist (Runbook §7) filled with evidence
- [ ] Switch to live ONLY after Jason sets LIVE_PAYMENTS_APPROVED=true. No real-card self test in live mode (D08). First real customer order is observed and recorded.

## P1 (after launch)
Year Ahead add-on (new order_items model first) · love match · 대운 with its own spec · 5–10 SEO pages then expand · ManyChat paid · tarot
