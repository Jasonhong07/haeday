# LAUNCH_EVIDENCE · Haeday

Every TASKS item and launch-checklist item gets one row. Status: PASS / FAIL / NOT RUN. No row = not done.
Environment "cloud-dev" = Claude workspace: Linux, Node 24.18.0, pnpm 11.19.0, PostgreSQL 16.13 (local), Chromium (preinstalled).

| Date | Milestone / item | Environment | Command or action | Result | Status | By |
|---|---|---|---|---|---|---|
| 2026-09-24 | M0 install from lockfile | cloud-dev | `pnpm install` | lockfile committed, build scripts allowed only for esbuild, unrs-resolver | PASS | Claude |
| 2026-09-24 | M0 typecheck + lint + unit/integration tests | cloud-dev | `TEST_DATABASE_URL=… pnpm check` | typecheck 0 errors, eslint 0 problems, 9 files / 36 tests passed | PASS | Claude |
| 2026-09-24 | M0 transaction proof (row + job rollback/commit) | cloud-dev | `pnpm test tests/integration/queue-tx.test.ts` | rollback: 0 rows, 0 jobs · commit: 1 row, 1 job · dedupe by key · keyless exclusive send refused · web-role sender works | PASS | Claude |
| 2026-09-24 | M0 schema constraints (one active order, one refund claim, provider refunds, no plaintext PII columns, retention-nullable `_enc`) | cloud-dev | `pnpm test tests/integration/schema.test.ts` | all assertions passed | PASS | Claude |
| 2026-09-24 | M0 migration on a fresh DB | cloud-dev | `pnpm db:migrate` | 14 public tables; pg-boss queues: reading.generate (exclusive), email.send (exclusive), system.heartbeat | PASS | Claude |
| 2026-09-24 | M0 worker heartbeat | cloud-dev | `pnpm worker` (75 s) | "[worker] heartbeat …" logged and `settings.worker_heartbeat` written | PASS | Claude |
| 2026-09-24 | M0 health endpoints | cloud-dev | `pnpm start` + curl `/api/health/live`, `/api/health/ready` | live 200 `{"status":"ok"}`; ready 200 `{"status":"ready"}`; ready 503 in <5 s when DB unreachable (test) | PASS | Claude |
| 2026-09-24 | M0 production build | cloud-dev | `pnpm build` | compiled, 4 routes | PASS | Claude |
| 2026-09-24 | M0 mobile E2E (placeholder, no checkout, no horizontal scroll) | cloud-dev | `pnpm e2e` (iPhone 13 viewport) | 1 passed | PASS | Claude |
| 2026-09-24 | M0 Sentry scrubbing | cloud-dev | unit tests | request body/query/cookies/headers, user, breadcrumbs, extra, contexts, SQL params removed | PASS | Claude |
| 2026-09-24 | Oracle Python compatibility smoke test | cloud-dev | Skyfield 1.55 + skyfield-data (DE421) + numpy 2.5.3, 立春 2024 | 3.12.11 and 3.14.0rc2 both → 2024-02-04T08:27:08Z (16:27 Beijing, matches published) | PASS | Claude |
| | GitHub Actions first run | GitHub | push to main | | NOT RUN (repo not created yet) | |
| | Railway staging deploy (web + worker + Postgres) | Railway | see docs/SETUP_ACCOUNTS.md | | NOT RUN (project not created yet) | |
| | Sentry test event | Sentry | `pnpm sentry:test` | | NOT RUN (account not created yet) | |
