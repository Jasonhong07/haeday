// C4 / D41: "Email me my chart" + an optional, separate marketing consent. The chart email is transactional (what the
// visitor asked for). Marketing consent is only RECORDED here; no marketing is sent until D48 is settled.
import { createHash, createHmac } from "node:crypto";
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { Db } from "../db/client";
import { emailOutbox, marketingContacts } from "../db/schema";
import { QUEUES, enqueueInTx } from "../queue/boss";
import { emailLookup, encryptPrivate, normalizeEmail, type Keyring } from "../security/encryption";
import { aad } from "../security/keyring";
import { loadChart } from "../charts/service";
import { DAY_MASTERS } from "@/content/library";

export const MARKETING_CONSENT_VERSION = "marketing-2026-09-24";
export const MARKETING_CONSENT_TEXT = "Send me occasional saju notes from Haeday. Unsubscribe any time.";
export const CHART_EMAILS_PER_GUEST_PER_DAY = 3;
export const CHART_EMAILS_PER_RECIPIENT_PER_DAY = 2;

export type CaptureResult = "queued" | "not_found" | "not_ready" | "rate_limited";

export async function requestChartEmail(
  deps: { db: Db; ring: Keyring; boss: PgBoss; now?: () => Date },
  input: { guestId: string; chartId: string; email: string; marketing: boolean },
): Promise<CaptureResult> {
  const now = deps.now?.() ?? new Date();
  const chart = await loadChart(deps.db, deps.ring, input.chartId, input.guestId);
  if (!chart) return "not_found";
  if (chart.response.kind !== "computed") return "not_ready";
  const c = chart.response.chart;
  const dm = DAY_MASTERS[c.dayMaster.stem];
  const p = c.pillars;
  const pillars = [p.hour, p.day, p.month, p.year].map((x) => (x ? `${x.stem}${x.branch}` : "—")).join(" · ");
  const email = normalizeEmail(input.email);
  const lookup = emailLookup(email, deps.ring);

  return deps.db.transaction(async (tx) => {
    // Abuse guards (the address is unverified): a browser can send its chart to at most 3 addresses a day, and one
    // address receives at most 2 chart emails a day whoever asks. The overall volume is capped by the email budget.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`chart-email:${input.guestId}`}, 0))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`chart-email-to:${lookup}`}, 0))`);
    const since = new Date(now.getTime() - 86_400_000);
    const [{ n } = { n: 0 }] = await tx.select({ n: count() }).from(emailOutbox)
      .where(and(eq(emailOutbox.guestId, input.guestId), eq(emailOutbox.kind, "chart"), gt(emailOutbox.createdAt, since)));
    if (n >= CHART_EMAILS_PER_GUEST_PER_DAY) return "rate_limited" as const;
    const [{ m } = { m: 0 }] = await tx.select({ m: count() }).from(emailOutbox)
      .where(and(eq(emailOutbox.toLookup, lookup), eq(emailOutbox.kind, "chart"), gt(emailOutbox.createdAt, since)));
    if (m >= CHART_EMAILS_PER_RECIPIENT_PER_DAY) return "rate_limited" as const;

    const id = crypto.randomUUID();
    const dedupeKey = `chart:${input.chartId}:${lookup.slice(0, 16)}`;
    const ins = await tx.insert(emailOutbox).values({
      id, kind: "chart", orderId: null, dedupeKey, guestId: input.guestId, toLookup: lookup,
      toEmailEnc: encryptPrivate(email, aad("email_outbox", id, "to_email"), deps.ring),
      payloadEnc: encryptPrivate({ dayMaster: dm?.name ?? c.dayMaster.stem, image: dm?.image ?? "", pillars }, aad("email_outbox", id, "payload"), deps.ring),
    }).onConflictDoNothing().returning({ id: emailOutbox.id });
    if (ins.length) await enqueueInTx(deps.boss, tx, QUEUES.sendEmail, { dedupeKey }, { singletonKey: dedupeKey });

    if (input.marketing) {
      // An unsubscribe is final from this form: anyone can type any address here, so a new tick must never undo
      // someone's opt-out (CAN-SPAM). A still-subscribed contact just gets the newer consent recorded.
      const contactId = crypto.randomUUID();
      await tx.insert(marketingContacts).values({
        id: contactId, emailLookup: lookup, emailEnc: encryptPrivate(email, aad("marketing_contacts", contactId, "email"), deps.ring),
        source: "free_chart", consentVersion: MARKETING_CONSENT_VERSION, consentedAt: now, consentGuestId: input.guestId,
      }).onConflictDoUpdate({
        target: marketingContacts.emailLookup,
        set: { consentVersion: MARKETING_CONSENT_VERSION, consentedAt: now, consentGuestId: input.guestId },
        setWhere: isNull(marketingContacts.unsubscribedAt),
      });
    }
    return "queued" as const;
  });
}

const tokenHash = (t: string) => createHash("sha256").update("unsub:v1\0").update(t).digest("hex");

/**
 * The contact's one-click unsubscribe token. Deterministic (keyed HMAC of the contact id), so every email ever sent
 * carries a link that keeps working; only its hash is stored, for the lookup.
 */
export async function issueUnsubscribeToken(db: Db, ring: Keyring, contactId: string): Promise<string> {
  const token = createHmac("sha256", ring.lookupKey).update(`unsub:v1\0${contactId}`).digest("base64url").slice(0, 32);
  await db.update(marketingContacts).set({ unsubscribeTokenHash: tokenHash(token) }).where(eq(marketingContacts.id, contactId));
  return token;
}

/** RFC 8058 one-click (POST) or the confirm page: no login needed; idempotent; unknown tokens look the same. */
export async function unsubscribe(db: Db, token: string, now = new Date()): Promise<void> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return;
  // The address itself is dropped at once; the keyed lookup stays as the suppression record (never mail again).
  await db.update(marketingContacts).set({ unsubscribedAt: now, emailEnc: null })
    .where(and(eq(marketingContacts.unsubscribeTokenHash, tokenHash(token)), isNull(marketingContacts.unsubscribedAt)));
}

/** Marketing may be sent only to consenting, not-unsubscribed contacts — and only once D48 is settled (flag). */
export async function marketingAllowed(db: Db, lookup: string, enabled: boolean): Promise<boolean> {
  if (!enabled) return false;
  const c = await db.query.marketingContacts.findFirst({ where: eq(marketingContacts.emailLookup, lookup) });
  return Boolean(c && !c.unsubscribedAt);
}
