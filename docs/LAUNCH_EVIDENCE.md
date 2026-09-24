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
| 2026-09-24 | M1 jie table | cloud-dev (Python 3.14.0rc2, Skyfield 1.55, DE421 sha256 a20a7139…) | `python tools/oracle/gen_jie.py` | 1,817 jie instants 1899-08 → 2050-12; spot checks vs published: 立春 2024 = 08:27:08 UTC, 驚蟄 1996 = 07:09:37 UTC, 立秋 1995 = 23:51:44 UTC | PASS | Claude |
| 2026-09-24 | M1 oracle golden fixtures | cloud-dev | `python tools/oracle/build_golden.py` (re-verifies jie table first) | 33 cases (F01–F31 incl. F12z, F28a/b) | PASS | Claude |
| 2026-09-24 | M1 engine vs oracle | cloud-dev (Node tz 2026b vs Python tzdata 2026d) | `pnpm vitest run tests/engine` | 33/33 fixtures match: utc, std offset, longitude correction, jie neighbours, pillars, warnings; EoT max diff 11.8 s (tolerance 30 s) | PASS | Claude |
| 2026-09-24 | M1 table unit tests | cloud-dev | `pnpm vitest run tests/engine/tables.test.ts` | 五虎遁, 五鼠遁, hour branches, day cycle continuity 1900–2050, ten gods, gap/fold, EoT extremes, disclosure text, 6/8 denominators | PASS | Claude |
| 2026-09-24 | Full check after M1 | cloud-dev | `pnpm check` + `oracle:verify` + `pnpm build` | 11 files / 84 tests passed; golden matches oracle; build OK | PASS | Claude |
| 2026-09-24 | Unknown-time performance | cloud-dev | 1,440-minute enumeration, NYC 立春 day | 91 ms | PASS | Claude |
| 2026-09-24 | City dataset | cloud-dev | `pnpm places:build` (twice) | 34,149 GeoNames rows → 34,126 (23 same-label duplicates <50 km merged, 195 labels disambiguated with "near X"); 0 invalid tz; unique labels; identical sha256 on rebuild (bfb3c82a…) | PASS | Claude |
| 2026-09-24 | /api/places + placeId resolution | cloud-dev | `pnpm vitest run tests/places.test.ts` + `pnpm e2e` | 35 unit tests (ranking, aliases, state names, accents, junk input, 400s, no coordinates in API, fixture cities within 0.1° and same tz, every dataset tz accepted by engine); E2E through real server; search ≤ 10 ms, first load ~0.3 s | PASS | Claude |
| 2026-09-24 | Third-party cross-check (lunar_python 1.4.8) | cloud-dev | `pnpm oracle:lunar` + `vitest tests/engine/lunar.test.ts` | oracle vs lunar 3,000/3,000; engine vs lunar 3,000/3,000 (four pillars; 53 near-edge samples skipped); crosscheck.md 10/10 | PASS | Claude |
| 2026-09-24 | Jie table vs lunar_python solar terms | cloud-dev | 1,788 terms 1901–2049 compared (inline script, see STATUS) | max |Δ| 45 s (1901–1929), 21 s (1930–59), 10 s (1960–89), 3 s (1990–2025), 4 s (2026–49); none over 60 s | PASS | Claude |
| 2026-09-24 | Full check after M1 places | cloud-dev | `pnpm check` (with test DB) + `oracle:verify` + `pnpm build` + `pnpm e2e` | see STATUS | PASS | Claude |
| | Korean app cross-check (docs/crosscheck.md) | Jason's phone | 10 cases in two apps | | NOT RUN | Jason |
| 2026-09-24 | GitHub repo | GitHub | Jasonhong07/haeday (private), pushed via GitHub Desktop, HEAD d36de99 | local repo clean, file hashes match cloud copy | PASS | Claude |
| 2026-09-24 | GitHub Actions first run | GitHub | push to main | green (confirmed by Jason) | PASS | Jason |
| 2026-09-24 | Railway staging deploy (web + worker + Postgres) | Railway staging (APP_ENV=staging, PAYMENTS_MODE=test) | deploy from main; `/api/health/ready` | both services Active, ready reported by Jason | PASS | Jason |
| 2026-09-24 | Sentry test event | Jason PC → Sentry project (DSN also set on Railway web+worker) | PowerShell envelope POST from Jason's PC (sandboxes block ingest.us.sentry.io; SDK flush there returned true without delivery) | event visible in Sentry Issues (confirmed by Jason) | PASS | Jason |
| 2026-09-24 | Re-check after deploy | cloud-dev | `pnpm typecheck` + `lint` + `test` (with test DB) + `oracle:verify` | 84/84 tests, oracle 33/33 | PASS | Claude |
