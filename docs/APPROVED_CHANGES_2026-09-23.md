# Owner-approved implementation changes — 2026-09-23

This addendum supersedes conflicting v8 data-model details. Original source docs in haeday_v8 remain reference snapshots.

## D14 — Delivery identity (accepted)
Orders retain delivery email encrypted plus a keyed normalized email lookup value. Stripe email does not authenticate a customer. Linking orders happens only after email verification.

## D15 — Refund coordination (accepted)
All refund reasons use one order-level claim and one stable provider idempotency key per refund operation. Reason is metadata, never a concurrency partition. A DB transaction locks the order and records the claim; Stripe runs outside that transaction. Pending/unknown results must be reconciled before another operation. The launch product uses full refunds; partial refunds received from Stripe remain visible and cannot be overwritten. Concurrency tests cover customer, admin, worker and deadline paths.

## D16 — Retention (accepted)
At 12 months remove paid chart and reading data AND encrypted personal snapshots from orders; retain only required transaction records. Orders' chart reference becomes nullable after deletion. Expired unpaid orders must not indefinitely retain chart snapshots. Deleting PII is the explicit exception to immutable snapshots, recorded by timestamp. Backup retention and post-restore cleanup still apply.

## D17 — Encryption (accepted user requirement)
Encrypt email, birth inputs, chart responses, personal order snapshots, reading contents and outbound email addresses before database persistence. AES-256-GCM with a random 96-bit nonce, 128-bit authentication tag and associated data binding table/row/field. Include key version in each envelope. Keys are deployment secrets outside DB; old key versions are retained until migration and backup expiry. Email equality lookup uses a separate HMAC-SHA-256 key; no plaintext email index. Session/magic-link/guest tokens are hashes, never plaintext. Queue jobs contain internal IDs only. Provider SDK calls necessarily receive only the data they need over TLS. Encryption is not a replacement for authorization, transport encryption or log scrubbing.

M0: encryption helper/tests and encrypted schema. M2/M3/M4/M6: use it on every relevant write/read path. Before launch verify database exports contain none of the synthetic test PII. Keys missing => fail closed for private-data operations; placeholder/liveness can still run.

## D18 — Error pages (accepted)
Dedicated login states: expired, already used, invalid link, throttled, temporary failure. Do not reveal whether an email has an account. Refund states: unavailable order, pending/requires_action, already refunded, outside goodwill window, temporary failure. Customer pages must not expose raw errors, IDs of other users or provider details. Refund actions remain authenticated POSTs. Build and verify with the actual M6 flows.

## D19 — Owner admin dashboard (accepted)
Separate /admin page and protected server endpoints; verified customer session plus ADMIN_EMAILS allowlist. Never trust an email typed at checkout. Aggregate data only by default.

Seven journey stages: landing_view → chart_started → chart_completed → checkout_started → payment_succeeded → reading_delivered → returning_visit. Add offer_viewed and refund_succeeded as supporting metrics. Payment and delivery events originate on the server, not the browser.

Show date range, device-based unique visitors, unique payers, paid orders, conversion, gross receipts, tax, refunds and net receipts. Money is derived from orders/refunds, not client analytics. Label pseudonymous visitors as device-based, not exact people. Main conversion is paid orders / visitors in period (an activity metric); cohort conversion must be separately labeled and use events in timestamp order. Return visit means a new visit session on a later calendar day, not page refresh. Keep stages with no data empty/zero with clear states; never seed fake production metrics. UTC storage; displayed reporting timezone explicit.

PostHog properties remain allowlisted; no birth values, emails, raw URLs, readings or tokens. Unauthenticated users never receive dashboard data. M0 defines contracts; M2/M3/M4 record events; M6 implements protected dashboard + error handling; M7 verifies end-to-end analytics and PII exclusion.
