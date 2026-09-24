# Haeday

Mobile-first Korean saju web app for English speakers. Free chart → $3.99 reading.

Read in order: `AGENTS.md` → `CLAUDE.md` → `docs/DECISIONS.md` → `docs/APPROVED_CHANGES_2026-09-23.md` → `docs/TASKS.md`. Status: `docs/M0_STATUS.md`, evidence: `docs/LAUNCH_EVIDENCE.md`. Human runbook: `docs/LAUNCH_RUNBOOK_v8.md`.

## Requirements
Node 24.18.0, pnpm 11.19.0, PostgreSQL 16. Python for the oracle is decided in M1.

## Commands
```bash
pnpm install --frozen-lockfile
pnpm dev                       # web on :3000
pnpm worker                    # queue worker (needs DATABASE_URL)
pnpm db:migrate                # app tables + pg-boss schema/queues
TEST_DATABASE_URL=postgresql://…/haeday_test pnpm check   # typecheck + lint + tests (DB name must end in _test)
pnpm e2e                       # Playwright, mobile viewport
pnpm sentry:test               # sends one test event (needs SENTRY_DSN)
```
Environment variables: see `env.example`. Never commit secrets.

## Deploy
Railway: `railway/web.json` (pre-deploy migrations, `pnpm start`) and `railway/worker.json` (`pnpm worker`). Account setup: `docs/SETUP_ACCOUNTS.md`.
