# Status (2026-09-24, evening)

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
