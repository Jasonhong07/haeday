# Current handoff · 2026-09-26

Current queue: `growth/08_LAUNCH_HANDOFF.md`. Progress: **38/46 TASKS = 82.6% by item count**, not elapsed effort or release clearance. Remaining gates and owners: `LAUNCH_PROGRESS_2026-09-26.md`. User demo: `TRY_HAEDAY_KO.md`. Owner-only steps: `JASON_LAUNCH_STEPS.md`.

Codex on base `88a9f15`: landing/input/result/reading redesign; checkout birth-detail confirmation; truthful order/refund states including $0/discounted orders and failed refunds; refund navigation; public landing isolation; encryption preflight validation; local demo launcher. **Local full suite: 376 passed / 5 external contract tests skipped (44 files passed, 2 skipped)**. Final production build (including TypeScript), full ESLint and diff whitespace checks PASS. Fake Stripe→reading and fake PayPal→reading→refund were manually exercised in the browser with real local DB and enforced CSP. Full Playwright runner / current staging / real provider sandbox NOT RUN. No deployment, actual charges or customer mail.

**The snapshot below is historical; its percentages, pending items and test counts are not the current release checklist.**

# Status (2026-09-24, evening)

> Latest CC0 follow-up: see `review/PROPOSAL_V2_CODEX.md` and `review/CHANGES_CODEX_CC0.md`.
> Local fixes: admin bootstrap, uniform login HTTP outcomes, transaction-bound admin retry enqueue; 9 targeted tests and changed-file lint passed. DB integration NOT RUN; local typecheck blocked by missing installed Stripe dependency. Payment/refund recovery issues remain launch blockers. Percentages and milestone labels below are historical estimates, not a release approval; remaining work includes substantial code changes as well as account setup.

**Code: about 80% of launch scope. Launch readiness: about 55%.** The rest is mostly outside the code: keys and accounts, content approval, real test payments on staging, landing page copy, domain.

| Milestone | Code | Verified on staging | Blocked by |
|---|---|---|---|
| M0 foundation | done | yes | — |
| M1 engine + city search | done (policy v2, 포스텔러 10/10) | n/a | — |
| M2 input + free chart | done | not yet | Jason phone check |
| M3 payments (Stripe test) | done: checkout, webhook, refunds, disputes | no | Stripe test keys (docs/SETUP_PROVIDERS.md) |
| M4 AI reading | done: prompt, gate, worker, fencing, deadline, reading page | no | Q1 model choice + API key |
| M5 content + quality | draft library (72 entries, Korean review sheet) + sample script | no | Q7 approval, 15 samples scored |
| M6 email, identity, refunds, ops | done: outbox, magic link, /my, refunds page, /admin, crons | no | Q3 domain → Resend, Q10 admin email |
| M7 legal, analytics, launch | legal drafts done; PostHog, CSP, landing, production env pending | no | Q9, Q14, domain |

Tests: 22 files / 197 unit+integration, 11 E2E (phone viewport), all green in the cloud workspace.
Open questions for Jason: docs/QUESTIONS.md. Review recommendations: docs/review/RECOMMENDATIONS_M0-M2.md.
