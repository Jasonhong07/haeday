# Change log part 2 for independent review · 2026-09-24 (M3–M7 code)

Scope: everything after commit `4e6f0e0` (part 1 = docs/review/CHANGES_2026-09-24.md). Diff: `docs/review/CHANGES_2026-09-24_part2.diff`.
How to use: attach this file and the diff to ChatGPT (or another AI) and paste the prompt at the bottom.

| # | Area | What | Files | Tests |
|---|---|---|---|---|
| P1 | Payments boundary | `PaymentAdapter` interface; Stripe implementation (only file importing the SDK); in-memory fake | `src/server/payments/adapter.ts`, `src/server/adapters/stripe.ts`, `src/server/adapters/fake-payments.ts` | `tests/adapters.test.ts` (real SDK signature header) |
| P2 | Checkout | One active order per (guest, revision, SKU) via partial unique index + `on conflict do nothing`; encrypted immutable snapshot; Stripe session with idempotency key `checkout:<orderId>`; reuse while open; expired → new order; provider call outside any transaction | `src/server/payments/checkout.ts`, `src/app/api/checkout/route.ts`, `src/app/checkout/[chartId]/*` | commerce: consent, sales off, needs answer, double click, expiry |
| P3 | Webhook | Session details fetched before the transaction; one transaction: event insert (unique) → `validatePaid` (livemode, session, order refs, paid, currency, single line item = price, subtotal = 399, total ≥ subtotal, payment intent) → open→paid → enqueue generation; refunds/charge.refunded/disputes | `src/server/payments/webhook.ts`, `src/app/api/webhooks/stripe/route.ts` | 6 tampering cases, duplicates, late completion after refund, expiry |
| P4 | Refund service | Single function for customer/admin/worker/cron: locked claim `refund:<orderId>:1` (partial unique index), provider call outside tx, pending ≠ refunded, `unknown` reconciled with same key; goodwill 7 days, once per checkout email | `src/server/payments/refunds.ts`, `src/app/api/refunds/[orderId]/route.ts`, `src/app/refund/[orderId]/*` | 3-way race → 1 provider refund; pending; network error → reconcile; goodwill rules |
| P5 | Reading contract | Facts only from the engine (incl. 2027 ten-god relations), deterministic snippet choice, production = approved snippets only; strict Zod schema; gate: 700–1,100 words, known snippet ids, forbidden claims, no markup, no hour talk when time unknown, only this chart's pillars | `src/server/fulfillment/prompt.ts`, `checks.ts`, `src/content/snippets.ts` | `tests/fulfillment.test.ts` |
| P6 | Generation worker | Claim with fencing token per attempt; abandoned tokens cannot save; save only if still paid + generating + current token; 3 attempts → failed → refund → apology; deadline sweep; LLM missing or cap 0 → never delivers | `src/server/fulfillment/generate.ts`, `src/worker/index.ts`, `src/server/queue/boss.ts` (retry settings) | timeout×2 then success, refund during generation, stale token, deadline, LLM missing |
| P7 | LLM adapter | Anthropic Messages API with forced tool call (strict JSON), 60 s timeout | `src/server/adapters/llm.ts` | request shape, errors |
| P8 | Email | Outbox row + job in the same transaction as delivery; send with idempotency key; transient → retry, 4xx → bounced; never triggers regeneration/refund | `src/server/email/*`, `src/server/adapters/email.ts` | retry, bounce |
| P9 | Identity | Magic link only for known addresses (same response otherwise), GET confirm page + POST consume (atomic), 5/h per email, session rotation, orders linked only after verification, admin = verified session + allowlist | `src/server/auth.ts`, `src/app/api/auth/*`, `src/app/login/*`, `src/app/my/page.tsx` | concurrent use, expiry, throttle, "attacker pays with admin email" |
| P10 | Pages | Order status (auto refresh), reading (hanji), sign-in prompt for other browsers, legal drafts | `src/app/order`, `src/app/r`, `src/app/{terms,privacy,refunds}` | `tests/e2e/purchase.spec.ts` |
| P11 | Admin | Aggregates from orders/refunds, sales on / soft stop / hard stop (expires open sessions), retry & refund with audit rows | `src/server/admin.ts`, `src/app/admin`, `src/app/api/admin/*` | `tests/integration/admin.test.ts` |
| P12 | Retention | Unpaid charts after delete_after; open/expired orders scrubbed after 30 days; paid chart/reading/snapshot/email after 12 months; money records kept | `src/server/retention.ts` | `tests/integration/retention.test.ts` |
| P13 | M0–M2 fixes | Future-date check at UTC+14; place validated before guest creation; per-IP limits; index only in production | see docs/review/RECOMMENDATIONS_M0-M2.md R1–R5 | E2E |

## Review prompt
```text
You are reviewing the payment, fulfillment and identity code of a small paid web app (Next.js + Postgres + pg-boss).
Attached: a change log and the diff. Verify the diff against the log; do not trust the log.
Hard rules the code must follow:
1. Unlock only after a validated payment event (livemode, session↔order, price, subtotal, currency, payment_status).
2. Payment event insert + order transition + job enqueue in ONE transaction; no network call inside any transaction.
3. All refunds through one service; concurrent refund requests must produce one provider refund.
4. Only the latest generation attempt (fencing token) may save a reading, and only while the order is still paid.
5. A guest cookie sees only its own orders; an email typed at checkout grants nothing until a magic link to that
   address is clicked; admin = verified session + allowlist.
6. No birth data, email, token or reading text in logs, analytics or error reports.
For P2–P4, P6 and P9 describe one concrete race or failure you tried (two tabs, webhook retry, worker crash,
network error after Stripe succeeded) and whether the code survives it. Then give a table:
change id · verdict (OK / problem) · severity (P0 money or data leak, P1 wrong behaviour, P2 style) · one-line fix.
Answer in Korean; keep code references in English.
```
