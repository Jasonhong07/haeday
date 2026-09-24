# Status (2026-09-24)

## M0 foundation: done and deployed to staging
GitHub (private) → Railway staging (web + worker + Postgres) ready; Sentry DSN set, test event sent. To confirm: GitHub Actions green, test event visible in Sentry.

## M1 chart engine: engine done, 2 items waiting on Jason
- Done: canonical jie table 1900–2050, independent Python oracle, TypeScript engine (own implementation), 33 golden fixtures all matching, unit tests, unknown-time enumeration with exact disclosures.
- Waiting on Jason:
  1. City data received; places API is Claude's next task.
  2. **Cross-check:** fill `docs/crosscheck.md` using two Korean 만세력 apps.
- Engine release gate (D10): 9/27 23:59 CT.

## Next
M1 finish (places API) → M2 input + free chart screens (9/27).
