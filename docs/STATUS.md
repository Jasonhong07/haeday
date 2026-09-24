# Status (2026-09-24)

## M0 foundation: done
GitHub (private, CI green) → Railway staging (web + worker + Postgres, APP_ENV=staging, PAYMENTS_MODE=test) ready; Sentry receives events (confirmed by Jason).

## M1 chart engine: done except two sign-offs from Jason
- Engine: canonical jie table 1900–2050 (Skyfield DE421), independent Python oracle, TypeScript engine (own implementation), 33 golden fixtures match, unknown-time enumeration with exact disclosures.
- Third-party check: lunar_python (6tail) agrees on 3,000/3,000 random births (all four pillars) and on the 10 crosscheck cases; its solar terms differ from our table by ≤ 3 s for 1990–2025 and ≤ 45 s for 1901–1929.
- City search: 34,126 GeoNames cities, `GET /api/places?q=`, server-side `placeId` resolution (DECISIONS D27).
- Checks: `pnpm check` 13 files / 121 tests, `oracle:verify`, `pnpm build`, `pnpm e2e` 2/2 all green (see LAUNCH_EVIDENCE).

### Jason sign-offs (M1 gate, by 9/27 23:59 CT)
1. **Jie table approval:** reply "절기표 승인" in chat (evidence: spot checks vs published times + lunar_python comparison above). Sign-off: ________
2. **Korean app cross-check:** `docs/crosscheck.md` Part B (enter what two apps show; Claude explains differences).

## Next
M2 input + free chart screens (/saju, /chart/[id], /method with GeoNames attribution).
