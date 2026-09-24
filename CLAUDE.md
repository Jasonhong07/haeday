# Haeday · Korean saju web app (agent guide)

## Read first, in this order
1. docs/DECISIONS.md (accepted decisions override everything below)
2. docs/TASKS.md (do only the current milestone)
3. docs/ENGINE_SPEC.md (chart math) · docs/ARCHITECTURE.md (money, access, jobs, data) · docs/PRD.md (screens, copy, reading contract)
4. docs/OPERATIONS.md (ops behavior you must support)
Conflicts between docs: stop, write the conflict in DECISIONS.md as `proposed`, and ask Jason. Do not pick silently.
Ignore any file outside this repo (older plans are archived and not specs).

## Owner
Jason is a non-engineer on Windows (Git Bash). Explain in plain language. For any dashboard/account step give click-by-click instructions. Never ask him to debug a stack trace alone.

## Stack (versions recorded in DECISIONS D12 and lockfiles)
Next.js App Router + TypeScript strict · pnpm · Postgres (Railway) · Drizzle ORM · pg-boss · Zod · Luxon · Stripe Checkout · Resend · PostHog · Sentry · Vitest · Playwright · Python 3.12 + Skyfield for tools/oracle.

## Commands
pnpm dev · pnpm worker · pnpm db:generate (read the SQL) · pnpm db:migrate · pnpm test · pnpm e2e · pnpm check (typecheck+lint+test)
pnpm oracle:verify (CI, read-only) · pnpm oracle:update (manual; produces a diff Jason approves)
stripe listen --forward-to localhost:3000/api/webhooks/stripe

## Hard rules
1. Engine follows ENGINE_SPEC exactly. Never edit expected fixture values to make a test pass.
2. Never block a customer because of chart uncertainty (D06). Resolve by question or disclosed default.
3. The LLM never computes pillars, strength, 用神 or 대운. It gets facts + approved snippets only.
4. Prices from the server SKU table. Validate livemode, session↔order, price, subtotal, currency, payment_status before any transition. Unlock only after a validated event.
5. Payment event insert + order transition + job enqueue happen in ONE database transaction (pg-boss bound to the Drizzle transaction). External calls (LLM, Stripe refund, email) never run inside a DB transaction; they use idempotency keys and conditional updates.
6. Orders store an immutable snapshot of the chart revision, price and versions. Delivered readings are never regenerated or changed.
7. Access: guest cookie = only that guest's orders; verified session = that customer's orders; admin = verified session + ADMIN_EMAILS. An email typed at checkout proves nothing.
8. All refunds go through the single refund service.
9. No birth values, email, tokens, reading text or raw query strings in logs, Sentry, PostHog or share images.
10. Provider SDKs only in server/adapters. Secrets only via server/env.ts. Never read or print .env files.
11. Never switch PAYMENTS_MODE to live, send email to real customers, buy services, or deploy to production without Jason's explicit OK in the chat.

## Working style
- Build what the current milestone specifies without asking (schema, auth, jobs included). Ask only for: changing an accepted decision or a spec contract, new paid services, live actions, deleting data.
- Small commits. Tests first for money, access, engine, failure paths.
- Mobile first (360–430 px). Use the design tokens in PRD §10.

## Definition of done (every milestone)
- All TASKS boxes for the milestone have evidence in docs/LAUNCH_EVIDENCE.md: command, environment, result. Mark anything not run as NOT RUN.
- `pnpm check` green, migrations committed.
- Report to Jason: files changed · commands and results · what he must do by hand (click-by-click) · risks/TODOs · suggested commit message.
