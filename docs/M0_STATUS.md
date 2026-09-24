# M0 status (2026-09-24)

**Code complete and verified in the cloud workspace. Waiting on Jason's accounts to deploy.** See LAUNCH_EVIDENCE.md for every check.

## Done
- Next.js 16.3.6 app (placeholder landing), env validation, AES-256-GCM encryption + keyring (D17), Sentry scrubbing
- Drizzle schema v1 with all ARCHITECTURE §2 tables + D14–D17 changes (encrypted columns, delivery email lookup, refund claim rule, retention-nullable columns), migration `drizzle/0000_init.sql`
- pg-boss: worker (heartbeat → settings), send-only web role, queues installed by `pnpm db:migrate`
- Health: `/api/health/live`, `/api/health/ready`
- Kill switch read path (`settings.sales_enabled`, off by default)
- CI workflow `.github/workflows/ci.yml`, Railway configs `railway/web.json`, `railway/worker.json`
- Team review by a second engineer: 15 findings, all fixed (see DECISIONS D20–D23)

## Waiting on Jason
1. GitHub repo + push (docs/SETUP_ACCOUNTS.md §1)
2. Railway project + staging (§2)
3. Sentry account + DSN (§3)
4. Decisions: Python version for the oracle (D12) and jie table range (D21)

## Next: M1 (chart engine), starts once the two decisions above are made
