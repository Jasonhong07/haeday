# OPERATIONS · Haeday

## Daily (10 min, from Korea after 10/13: check at 08:00 KST = 18:00 CT previous day)
1. /admin: paid-but-undelivered = 0? refunds pending? disputes?
2. Sentry new issues.
3. hello@haeday.com replies (SLA 24 h). Macros below.

## Weekly (Sunday, 30 min + content time)
Funnel review (PRD §13 events), LLM + Railway spend, 5 random delivered readings read in full, retention cron log, Stripe payout vs orders.

## Incidents
| Situation | Action |
|---|---|
| Paid, no reading after 5 min | /admin Retry. The 15-min deadline cron refunds automatically if still failing |
| Many failures at once (LLM outage) | Soft stop (sales off). Worker keeps retrying existing orders. Resume when healthy |
| Systematic chart bug found | Hard stop. Fix, bump policyVersion, notify affected customers, offer refund. Never silently change delivered readings |
| Dispute opened | Submit evidence in Stripe: order time, product description, delivery email log, reading access log. Do not refund inside an open dispute unless advised by Stripe |
| Email bounces | Customer can still open the reading in the same browser; reply with the link after verifying via Stripe receipt email |
| Cost spike | Lower LLM_DAILY_CAP, soft stop if needed |

## Deploy freeze 10/11–10/13 (move)
Before 10/11: last deploy, worker healthy, 10 posts per channel scheduled, alerts routed to phone push (Sentry app + Gmail), SALES soft stop tested from phone browser.

## Support macros (English)
- Where is my reading: "Thanks for your purchase! Your reading is here: {link}. If it asks you to sign in, use the email you paid with."
- Refund: "Done. Your refund of $3.99 has been started; banks usually show it in 5–10 business days."
- Accuracy question: "Here's how we calculate your chart: haeday.com/method. If your birth time was approximate, feel free to create a new chart with a different time."
