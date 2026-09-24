# ARCHITECTURE · Haeday v1

## 1. Runtime and environments
- Railway services: `web` (Next.js App Router, API routes, Stripe webhook) and `worker` (pg-boss consumer + cron). Postgres on Railway with daily backups.
- Environments: `dev`, `staging`, `production`. `APP_ENV` decides behavior, not NODE_ENV (staging also runs a production build).
- `PAYMENTS_MODE = test | live`. staging must be `test`. production boot refuses `live` unless `LIVE_PAYMENTS_APPROVED=true` (set by Jason after D05 checks). A missing payment key disables new checkouts only; reading pages and the worker keep running.
- Health: `/api/health/live` (process up) and `/api/health/ready` (db + queue reachable). No internals in responses.

## 2. Data model (Drizzle)
| Table | Columns (key) | Rules |
|---|---|---|
| guests | id, cookie_hash, first_utm jsonb, created_at | UTM bounded (PRD §13) |
| customers | id, email_normalized unique, verified_at null, created_at | Stripe email = delivery address only; login requires verified_at via magic link |
| chart_revisions | id, chart_group_id, guest_id, input jsonb, response jsonb, policy_version, coverage_version, tzdata_version, library_version, created_at, delete_after | Immutable. Edit = new revision |
| orders | id, chart_revision_id, guest_id, customer_id null, sku, unit_amount_cents, subtotal_cents, tax_cents, total_cents, currency, snapshot jsonb, consent_version, stripe_session_id unique, stripe_payment_intent_id, payment_status, fulfillment_status, paid_at, fulfillment_deadline_at, utm jsonb, created_at | snapshot = chart response + price + policy/prompt versions at checkout creation. Partial unique index on (guest_id, chart_revision_id, sku) where payment_status in ('open','paid') |
| payment_events | id, provider, event_id, type, livemode, received_at, handled_at | unique(provider, event_id) |
| generation_attempts | id, order_id, attempt_no, fencing_token, status, error_code, started_at, finished_at | only the current fencing token may complete |
| readings | id, order_id unique, content jsonb, used_snippet_ids, prompt_version, model_id, policy_version, delivered_at | immutable after delivered |
| email_outbox | id, kind, to_email, order_id, dedupe_key unique, status, attempts, provider_message_id, last_error | separate retries from generation |
| refunds | id, order_id, kind (service_failure, goodwill, duplicate, admin), idempotency_key unique, stripe_refund_id, status (requested, pending, requires_action, succeeded, failed, canceled), requested_by, created_at, updated_at | all paths go through one service function |
| disputes | id, order_id, stripe_dispute_id unique, status, reason, evidence_due_by, outcome | separate axis from payment_status |
| magic_links | id, customer_id, token_hash, expires_at, consumed_at | consume atomically once |
| sessions | id, customer_id, created_at, expires_at, rotated_from | rotate on login |
| admin_audit | id, actor_customer_id, action, target, at | |

Enums:
- payment_status: `open | paid | expired | refund_pending | refunded | partially_refunded`
- fulfillment_status: `none | queued | generating | delivered | failed`
- dispute status lives in `disputes`, not in payment_status.

Allowed payment transitions: open→paid (checkout.session.completed with payment_status=paid, or async_payment_succeeded) · open→expired · paid→refund_pending→refunded/partially_refunded · refund_pending→paid (refund failed/canceled). A late `completed` never moves refund_pending/refunded back to paid.

## 3. SKU table (server)
`saju_reading`: 399 USD cents, Stripe Price ID from env. No add-ons at launch (D07).

## 4. Flows
**4.1 Chart:** POST /api/charts {input with placeId} → engine → insert chart_revision → return free fields only. Never return reading text.

**4.2 Checkout:** POST /api/checkout {chartRevisionId, consent} →
1. SALES_ENABLED and PAYMENTS configured, owner check.
2. If an order for this revision is `paid` → return "already owned".
3. In a DB transaction: select-for-update existing `open` order for (guest, revision, sku); reuse its session if Stripe says it is still open; else create order row with snapshot.
4. Create Stripe Checkout Session with idempotency key = order id, metadata {orderId, chartRevisionId}, client_reference_id = orderId, automatic tax per Stripe Tax settings, payment methods: card + wallets only (no delayed methods at launch).

**4.3 Webhook** /api/webhooks/stripe (raw body, signature verified):
- Validate livemode matches PAYMENTS_MODE, account, session id ↔ order, currency usd, line item price = SKU price, `amount_subtotal` = 399 × qty, `payment_status`.
- One DB transaction: insert payment_event (unique; duplicate → 200 no-op) → apply allowed transition → store subtotal/tax/total → enqueue `generate(orderId)` with pg-boss using the SAME transaction (pg-boss `db` adapter bound to the Drizzle transaction). Verify with a rollback test.
- charge.refunded / refund.updated → update refunds and payment_status. charge.dispute.* → disputes.

**4.4 Generate (worker):**
1. Claim: conditional update fulfillment queued→generating with new fencing_token (only if payment_status = paid).
2. Call LLM outside any DB transaction (timeout 60 s, max_tokens cap, LLM_DAILY_CAP).
3. Validate with Zod + content checks. Save reading only if payment_status is still paid and fencing_token is current (conditional update). Then set delivered and insert email_outbox(dedupe_key = orderId:delivery) in the same transaction.
4. Retries: 3 attempts (0 s, 20 s, 90 s). Terminal failure → fulfillment failed → refund service (kind service_failure) → apology email via outbox → alert.
5. Deadline cron: if paid_at + 15 min passed and not delivered → same failure path. 5 min → alert only.

**4.5 Email worker:** sends outbox rows via Resend, retries with backoff, marks bounced. Email failure never triggers regeneration or refund. Stripe sends its own receipt; our email carries the reading link.

**4.6 Access:**
- Guest cookie grants access only to orders/charts created by that guest.
- Verified customer (magic-link session) sees orders where orders.customer_id = customer. Linking a guest order to a customer happens when that customer verifies the same email used at checkout.
- Admin = verified session AND email in ADMIN_EMAILS. Entering an admin email at Stripe checkout grants nothing.

**4.7 Magic link:** 32 random bytes, store SHA-256, 15 min expiry. GET shows a "Confirm sign in" page; POST consumes atomically (`update ... where consumed_at is null and expires_at > now() returning`). Same response whether or not the email exists. Session cookie Secure, HttpOnly, SameSite=Lax, rotated on login, 30-day expiry, logout endpoint. Tokens never in analytics, logs or Referer (Referrer-Policy: no-referrer on auth pages).

**4.8 Refund service** (single function used by customer, admin, deadline cron, worker): claim via insert refunds(idempotency_key = orderId:kind) → Stripe refund with the same idempotency key → store status. `pending/requires_action` are not "refunded". Goodwill refunds limited to one per normalized checkout email, within 7 days of payment; service failures and duplicates are always allowed.

**4.9 Retention cron (daily):** delete unpaid chart_revisions past 30 days; delete paid chart_revisions + readings 12 months after payment (orders keep amounts/ids for records); purge magic_links and expired sessions; log counts. Backups expire after 30 days; after any restore, rerun retention before reopening sales.

**4.10 Reconciliation cron (daily):** list Stripe Checkout Sessions/PaymentIntents of the last 48 h, compare with orders; fix missing paid orders through the same validation function as the webhook; report diffs to admin email.

## 5. Kill switch
`SALES_ENABLED` is a DB-backed runtime setting (table `settings`), editable in /admin, cached ≤ 30 s.
- Soft stop: blocks new checkout sessions.
- Hard stop (admin button): also expires all open Stripe Checkout Sessions via API.
Paid orders, worker, reading pages always keep working.

## 6. Security
HTTPS; CSRF via Origin check on POST; rate limits: charts 30/h per guest, checkout 5/day per guest and per IP, magic link 5/h per email; headers: HSTS, nosniff, frame-ancestors none, Referrer-Policy strict-origin-when-cross-origin (no-referrer on auth), CSP report-only first; `Cache-Control: no-store` + noindex on private routes; Stripe Radar default rules; Sentry `sendDefaultPii: false` + scrub request body, query and cookies; all user text escaped.

## 7. Env vars (server/env.ts, Zod)
APP_ENV, APP_ORIGIN, DATABASE_URL, SESSION_SECRET, PAYMENTS_MODE, LIVE_PAYMENTS_APPROVED, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_SAJU, LLM_API_KEY, LLM_MODEL, LLM_DAILY_CAP, RESEND_API_KEY, EMAIL_FROM, SUPPORT_EMAIL, ADMIN_EMAILS, POSTHOG_KEY, SENTRY_DSN, FLAGS (json), TZDATA_VERSION (read at boot and logged).

## 8. Restore drill (before launch, staging)
Stop worker → restore snapshot to a new DB → point staging to it → run reconciliation → verify no duplicate emails/refunds/generations (idempotency keys) → rerun retention → restart worker. Record in LAUNCH_EVIDENCE.md.
