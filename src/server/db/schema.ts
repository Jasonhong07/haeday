// Haeday database schema v1 (ARCHITECTURE §2 + APPROVED_CHANGES D14–D17).
// Columns ending in `_enc` hold AES-256-GCM envelopes from server/security/encryption.ts.
// Plaintext personal data (email, birth input, chart, reading text) is never stored.
import { sql } from "drizzle-orm";
import {
  boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

export const paymentStatus = pgEnum("payment_status", ["open", "paid", "expired", "refund_pending", "refunded", "partially_refunded"]);
export const fulfillmentStatus = pgEnum("fulfillment_status", ["none", "queued", "generating", "delivered", "failed"]);
export const refundStatus = pgEnum("refund_status", ["requested", "pending", "requires_action", "succeeded", "failed", "canceled", "unknown"]);
export const refundReason = pgEnum("refund_reason", ["service_failure", "goodwill", "duplicate", "admin", "validation_failure"]);
export const attemptStatus = pgEnum("attempt_status", ["running", "succeeded", "failed", "abandoned"]);
export const emailStatus = pgEnum("email_status", ["pending", "sending", "sent", "failed", "bounced"]);
export const refundSource = pgEnum("refund_source", ["service", "provider"]);
export const issueStatus = pgEnum("issue_status", ["open", "acknowledged", "resolved"]);

/** Runtime settings such as sales_enabled (ARCHITECTURE §5). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

export const guests = pgTable("guests", {
  id: uuid("id").primaryKey().defaultRandom(),
  cookieHash: text("cookie_hash").notNull().unique(),
  firstUtm: jsonb("first_utm"),        // L4: { c: campaign id from our own list | "other", r: referrer host } only
  visitorId: text("visitor_id"),       // D40: anonymous first-party visit id (random, no personal data) for cohorts
  createdAt: createdAt(),
});

/**
 * D40 funnel, first party (L5). Only allowlisted event names; no URLs, query strings, emails or birth data.
 * visitor_id is a random per-browser id set by us, never derived from a person.
 */
export const funnelEvents = pgTable("funnel_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),         // visit | form_started
  visitorId: text("visitor_id").notNull(),
  channel: text("channel"),             // campaign id from our own list, "search", "social", "other", or null (direct)
  createdAt: createdAt(),
}, (t) => [index("funnel_events_name_created_idx").on(t.name, t.createdAt), uniqueIndex("funnel_events_once_per_day").on(t.visitorId, t.name, sql`((created_at at time zone 'UTC')::date)`)]);

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  emailLookup: text("email_lookup").notNull().unique(), // HMAC-SHA-256 of normalized email (D17)
  emailEnc: text("email_enc").notNull(),
  verifiedAt: ts("verified_at"),
  createdAt: createdAt(),
});

export const chartRevisions = pgTable("chart_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  chartGroupId: uuid("chart_group_id").notNull(),
  guestId: uuid("guest_id").notNull().references(() => guests.id),
  inputEnc: text("input_enc"),       // null after retention deletion (D16)
  responseEnc: text("response_enc"),
  policyVersion: text("policy_version").notNull(),
  coverageVersion: text("coverage_version").notNull(),
  tzdataVersion: text("tzdata_version").notNull(),
  libraryVersion: text("library_version").notNull(),
  createdAt: createdAt(),
  deleteAfter: ts("delete_after").notNull(),
  piiDeletedAt: ts("pii_deleted_at"),
  firstViewedAt: ts("first_viewed_at"),  // D40 step 4: free chart viewed
}, (t) => [index("chart_revisions_guest_idx").on(t.guestId), index("chart_revisions_delete_after_idx").on(t.deleteAfter)]);

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  chartRevisionId: uuid("chart_revision_id").references(() => chartRevisions.id, { onDelete: "set null" }), // nullable after retention (D16)
  guestId: uuid("guest_id").notNull().references(() => guests.id),
  customerId: uuid("customer_id").references(() => customers.id),
  sku: text("sku").notNull(),
  unitAmountCents: integer("unit_amount_cents").notNull(),
  subtotalCents: integer("subtotal_cents"),
  taxCents: integer("tax_cents"),
  totalCents: integer("total_cents"),
  currency: text("currency").notNull().default("usd"),
  snapshotEnc: text("snapshot_enc"),               // chart + price + versions at checkout; nulled at retention (D16)
  deliveryEmailEnc: text("delivery_email_enc"),     // D14
  deliveryEmailLookup: text("delivery_email_lookup"),
  consentVersion: text("consent_version").notNull(),
  stripeSessionId: text("stripe_session_id").unique(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  paymentStatus: paymentStatus("payment_status").notNull().default("open"),
  fulfillmentStatus: fulfillmentStatus("fulfillment_status").notNull().default("none"),
  currentFencingToken: uuid("current_fencing_token"), // only the holder may save a reading (ARCHITECTURE §4.4)
  paidAt: ts("paid_at"),
  fulfillmentDeadlineAt: ts("fulfillment_deadline_at"),
  utm: jsonb("utm"),
  discountCents: integer("discount_cents"),        // F15: from the provider session (total_details.amount_discount)
  promotionCodeId: text("promotion_code_id"),      // Stripe promotion_code id (not the typed code)
  duplicateOfOrderId: uuid("duplicate_of_order_id"), // D51: a late payment for something already owned (refunded)
  deliveryPromise: text("delivery_promise").notNull().default("minutes"), // D35/D47: "minutes" | "24h", shown before payment
  fulfillmentNotBefore: ts("fulfillment_not_before"),  // F13: deferred generation (next UTC day) for "24h" orders
  providerPaidAt: ts("provider_paid_at"),              // F13: when the provider captured the payment (charge.created)
  piiDeletedAt: ts("pii_deleted_at"),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("orders_one_active_per_revision").on(t.guestId, t.chartRevisionId, t.sku)
    // Payments that never unlocked (D34 validation refunds, D51 duplicates: fulfillment "none") are not a purchase
    // of this reading, so they never block the customer from buying it.
    .where(sql`${t.paymentStatus} in ('open', 'paid', 'refund_pending', 'partially_refunded') and ${t.duplicateOfOrderId} is null and (${t.paymentStatus} = 'open' or ${t.fulfillmentStatus} <> 'none')`),
  index("orders_delivery_email_lookup_idx").on(t.deliveryEmailLookup),
  index("orders_customer_idx").on(t.customerId),
  index("orders_payment_intent_idx").on(t.stripePaymentIntentId),
  index("orders_status_paid_at_idx").on(t.paymentStatus, t.paidAt),
  index("orders_fulfillment_deadline_idx").on(t.fulfillmentStatus, t.fulfillmentDeadlineAt),
  check("orders_amount_positive", sql`${t.unitAmountCents} > 0`),
]);

export const paymentEvents = pgTable("payment_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(),
  eventId: text("event_id").notNull(),
  type: text("type").notNull(),
  livemode: boolean("livemode").notNull(),
  orderId: uuid("order_id").references(() => orders.id),
  receivedAt: ts("received_at").notNull().defaultNow(),
  handledAt: ts("handled_at"),
}, (t) => [uniqueIndex("payment_events_provider_event_uq").on(t.provider, t.eventId)]);

export const generationAttempts = pgTable("generation_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  attemptNo: integer("attempt_no").notNull(),
  fencingToken: uuid("fencing_token").notNull().defaultRandom(),
  status: attemptStatus("status").notNull().default("running"),
  errorCode: text("error_code"),
  // F14: provider usage for this attempt (null = unknown, e.g. timeout) and the price version used to cost it.
  modelId: text("model_id"),
  inputTokens: integer("tokens_in"),
  outputTokens: integer("tokens_out"),
  cacheReadTokens: integer("tokens_cache_read"),
  cacheWriteTokens: integer("tokens_cache_write"),
  costMicroUsd: integer("cost_micro_usd"),
  pricingVersion: text("pricing_version"),
  startedAt: ts("started_at").notNull().defaultNow(),
  finishedAt: ts("finished_at"),
}, (t) => [uniqueIndex("generation_attempts_order_no_uq").on(t.orderId, t.attemptNo)]);

export const readings = pgTable("readings", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().unique().references(() => orders.id),
  contentEnc: text("content_enc"), // null after retention (D16)
  usedSnippetIds: jsonb("used_snippet_ids").notNull().default(sql`'[]'::jsonb`),
  promptVersion: text("prompt_version").notNull(),
  modelId: text("model_id").notNull(),
  policyVersion: text("policy_version").notNull(),
  libraryVersion: text("library_version"),         // F7: content version actually used (frozen at checkout)
  firstViewedAt: ts("first_viewed_at"),            // D40 step 8: reading opened
  deliveredAt: ts("delivered_at").notNull().defaultNow(),
  piiDeletedAt: ts("pii_deleted_at"),
});

export const emailOutbox = pgTable("email_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  toEmailEnc: text("to_email_enc"), // nulled by retention (D16)
  payloadEnc: text("payload_enc"),   // C4: encrypted per-email content (e.g. the free chart summary); null for order mail
  orderId: uuid("order_id").references(() => orders.id),
  guestId: uuid("guest_id"),         // C4 chart mail: requesting browser (abuse cap); null for order mail
  toLookup: text("to_lookup"),       // C4 chart mail: keyed recipient lookup (per-recipient cap); nulled by retention
  dedupeKey: text("dedupe_key").notNull().unique(),
  status: emailStatus("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  providerMessageId: text("provider_message_id"),
  lastError: text("last_error"),
  nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
  piiDeletedAt: ts("pii_deleted_at"),
  createdAt: createdAt(),
}, (t) => [
  index("email_outbox_due_idx").on(t.status, t.nextAttemptAt),
  index("email_outbox_guest_idx").on(t.guestId, t.createdAt),
  index("email_outbox_to_lookup_idx").on(t.toLookup, t.createdAt),
]);

// D15: one active/successful refund claim per order regardless of reason, for refunds WE start.
// Refunds created outside the app (Stripe dashboard) are recorded with source=provider and never blocked.
export const refunds = pgTable("refunds", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  source: refundSource("source").notNull().default("service"),
  reason: refundReason("reason").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  amountCents: integer("amount_cents").notNull(),
  stripeRefundId: text("stripe_refund_id").unique(),
  status: refundStatus("status").notNull().default("requested"),
  requestedBy: text("requested_by").notNull(), // customer | admin | worker | deadline_cron
  attemptNo: integer("attempt_no").notNull().default(1), // new provider attempt only after a confirmed failure (CC1a F3)
  leaseToken: uuid("lease_token"),          // held while one executor calls the provider (never inside a DB transaction)
  leaseExpiresAt: ts("lease_expires_at"),
  failureReason: text("failure_reason"),    // provider code only, no free text
  firstSentAt: ts("first_sent_at"),         // first provider call; the idempotency window is measured from here
  lastCheckedAt: ts("last_checked_at"),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("refunds_one_claim_per_order").on(t.orderId)
    .where(sql`${t.source} = 'service' and ${t.status} in ('requested', 'pending', 'requires_action', 'unknown', 'succeeded')`),
  index("refunds_order_idx").on(t.orderId),
]);

/**
 * F4: the exact provider request for an order's Checkout Session, frozen when the order is created. Every retry
 * with the same idempotency key sends these same parameters, even after a redeploy or a settings change.
 * No secrets are stored here.
 */
export const checkoutAttempts = pgTable("checkout_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().unique().references(() => orders.id),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  request: jsonb("request").notNull(),
  status: text("status").notNull().default("pending"), // pending | linked | abandoned
  sessionId: text("session_id"),
  createdAt: createdAt(),
  lastTriedAt: ts("last_tried_at"),
});

/** D36: an extra generation attempt granted by an admin retry. One row per admin request (double click = one grant). */
export const attemptGrants = pgTable("attempt_grants", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  requestId: text("request_id").notNull().unique(),
  actorCustomerId: uuid("actor_customer_id"),
  createdAt: createdAt(),
});

/** L7/D45: emails sent per UTC day (all kinds), reserved atomically before each send. */
export const emailBudget = pgTable("email_budget", {
  day: text("day").primaryKey(), // YYYY-MM-DD (UTC)
  sent: integer("sent").notNull().default(0),
});

/**
 * C4 / D41: marketing consent from the free chart (separate from any transactional email). Email is encrypted, looked
 * up by HMAC. Sending marketing stays OFF until the postal address question (D48) is settled.
 */
export const marketingContacts = pgTable("marketing_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  emailLookup: text("email_lookup").notNull().unique(),
  emailEnc: text("email_enc"),                       // null after unsubscribe (lookup stays as suppression)
  source: text("source").notNull(),                 // free_chart
  consentVersion: text("consent_version").notNull(),
  consentedAt: ts("consented_at").notNull(),
  consentGuestId: uuid("consent_guest_id"),          // which browser ticked the box (evidence; the address is unverified)
  unsubscribedAt: ts("unsubscribed_at"),
  unsubscribeTokenHash: text("unsubscribe_token_hash").unique(),
  createdAt: createdAt(),
});

/**
 * Per-order refund sync lease (CC1a F3). Provider state is fetched outside any transaction and saved only while
 * the token still matches, so an older fetch can never overwrite a newer one. `dirty` = re-fetch after saving.
 */
export const refundSyncs = pgTable("refund_syncs", {
  orderId: uuid("order_id").primaryKey().references(() => orders.id),
  leaseToken: uuid("lease_token"),
  leaseExpiresAt: ts("lease_expires_at"),
  dirty: boolean("dirty").notNull().default(false),
  lastSyncedAt: ts("last_synced_at"),
});

/** Payment problems a person must look at (D34). Ids and codes only: no email, birth data or provider payloads. */
export const paymentIssues = pgTable("payment_issues", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  dedupeKey: text("dedupe_key").notNull().unique(), // kind:provider object:mode
  orderId: uuid("order_id").references(() => orders.id),
  providerObjectId: text("provider_object_id"),
  livemode: boolean("livemode").notNull(),
  status: issueStatus("status").notNull().default("open"),
  nextAction: text("next_action").notNull(),
  occurrences: integer("occurrences").notNull().default(1),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  resolvedAt: ts("resolved_at"),
}, (t) => [index("payment_issues_status_idx").on(t.status, t.createdAt)]);

export const disputes = pgTable("disputes", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").references(() => orders.id),
  stripeDisputeId: text("stripe_dispute_id").notNull().unique(),
  status: text("status").notNull(),
  reason: text("reason"),
  evidenceDueBy: ts("evidence_due_by"),
  outcome: text("outcome"),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const magicLinks = pgTable("magic_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  consumedAt: ts("consumed_at"),
  createdAt: createdAt(),
}, (t) => [index("magic_links_customer_idx").on(t.customerId)]);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  tokenHash: text("token_hash").notNull().unique(),
  rotatedFrom: uuid("rotated_from"),
  createdAt: createdAt(),
  expiresAt: ts("expires_at").notNull(),
  revokedAt: ts("revoked_at"),
}, (t) => [index("sessions_customer_idx").on(t.customerId)]);

export const adminAudit = pgTable("admin_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorCustomerId: uuid("actor_customer_id").notNull().references(() => customers.id),
  action: text("action").notNull(),
  target: text("target"),
  at: ts("at").notNull().defaultNow(),
});
