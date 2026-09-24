# M0–M2 review · fixes and recommendations (2026-09-24)

Reviewer: Claude (PM / engineering / UX pass). "Fixed" items are in the code with tests; "Recommended" items wait for a decision or a later milestone.

## Fixed now
| # | Area | Problem | Fix | Where |
|---|---|---|---|---|
| R1 | Engine input | "Birth date is in the future" used today's **UTC** date, so a baby born today in Asia/Pacific (already tomorrow there) was rejected | Accept up to the latest civil date on Earth (UTC+14) | `src/server/charts/service.ts` |
| R2 | Abuse | Every bad or bot POST to /api/charts created a guest row before validation | Place is validated first; per-IP limit 60/h in addition to 30/h per guest; same pattern on checkout (20/day) and magic links (10/h) | `src/app/api/charts/route.ts`, `src/server/ratelimit.ts` |
| R3 | SEO | `noindex` was hard-coded for the whole site, so production would also be invisible to Google | Index only when `APP_ENV=production`; private pages keep `noindex` | `src/app/layout.tsx` |
| R4 | Ops | POSTs failed with 403 if `APP_ORIGIN` did not exactly match the Railway domain | Also accept the request's own host (C13) | `src/server/http.ts` |
| R5 | UX | "Readings closed" looked like an error (red box) | Neutral status card | `src/app/checkout/[chartId]/page.tsx` |

## Recommended (not done yet)
| # | Priority | Area | Recommendation | Why | Needs |
|---|---|---|---|---|---|
| R6 | P1 | Privacy/perf | Self-host fonts with `next/font` instead of the Google Fonts CSS import | Visitor IPs go to Google today; render-blocking CSS | Jason OK (Q14); verify Railway build has network |
| R7 | P1 | Security | Add `Content-Security-Policy-Report-Only` then enforce (ARCHITECTURE §6) | Defence against injected scripts | none (M7) |
| R8 | P1 | Landing | Real landing page: hero, how it works (3 steps), sample reading excerpt, FAQ ("Is this accurate?", "What if I don't know my time?"), trust line | Current landing is a placeholder; conversion depends on it | copy approval |
| R9 | P1 | Chart UX | For boundary warnings, show the alternative pillar ("born after 9:01 AM → hour pillar 乙巳") instead of a generic note | Customers near a boundary understand what could change | none |
| R10 | P2 | Places | Warm the city index at boot (first search takes ~0.3 s) | First visitor after deploy waits | none |
| R11 | P2 | Places | Consider GeoNames cities5000 (~2x rows) | Small towns missing | Q8 |
| R12 | P1 | Payments | Auto-refund a paid session that fails validation (today: alert only) | Money taken, product not unlocked | Q11 |
| R13 | P2 | Errors | Friendly 503 page when encryption keys are missing (today: generic 500) | Clearer during misconfiguration | none |
| R14 | P1 | Analytics | PostHog events (PRD §13) with an allowlist test proving no birth data/email leaves | Funnel visibility | Q9 |
| R15 | P2 | Rate limit | Move the in-memory IP limiter to Postgres if web runs >1 instance | Per-instance memory | only if scaling |
| R16 | P2 | E2E | Dev-only fake checkout so one E2E covers chart → pay → reading end to end | Today payment is integration-tested and the reading page E2E seeds the DB | none |
