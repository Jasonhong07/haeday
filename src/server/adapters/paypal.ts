// PayPal (Orders v2 + Payments v2) implementation of PaymentAdapter, over fetch (no SDK). CC4c.
// The only file that talks to PayPal's API. PayPal and Venmo buttons run PayPal's JS SDK in the browser; the server
// creates the order, captures it after approval and refunds it. Sandbox when PAYMENTS_MODE=test.
//
// Idempotency: every create/capture/refund sends PayPal-Request-Id (our stable key), so a retry returns the same
// order, capture or refund. PayPal has no "list refunds of a capture" endpoint: refunds are read by id (the ids we
// stored, and ids from webhooks), and the refund summary is therefore never treated as complete.
import type {
  CaptureResult, CheckoutDetails, CheckoutSessionRef, CheckoutSessionRequest, CompletedSessionRef, PaymentAdapter, PaymentEvent,
  PaymentRefundSummary, ProviderRefund, RefundResult, RefundStatus,
} from "../payments/adapter";
import { PaymentProviderError } from "../payments/adapter";
import { SKUS } from "../payments/sku";

export interface PayPalConfig { clientId: string; clientSecret: string; webhookId: string | undefined; live: boolean; fetchImpl?: typeof fetch; timeoutMs?: number }

type Json = Record<string, unknown>;
type Money = { currency_code?: string; value?: string };

/** "3.99" → 399 without floating point. */
export function toCents(v: string | undefined | null): number | null {
  if (v === undefined || v === null || !/^\d+(\.\d{1,2})?$/.test(v)) return null;
  const [w, f = ""] = v.split(".");
  return Number(w) * 100 + Number((f + "00").slice(0, 2));
}
export const fromCents = (c: number) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;

const refundStatus = (s: unknown): RefundStatus =>
  s === "COMPLETED" ? "succeeded" : s === "FAILED" ? "failed" : s === "CANCELLED" ? "canceled" : "pending";
const unix = (iso: unknown): number | null => (typeof iso === "string" && !Number.isNaN(Date.parse(iso)) ? Math.floor(Date.parse(iso) / 1000) : null);
const upLink = (links: unknown, part: string): string | null => {
  const l = Array.isArray(links) ? (links as Array<{ rel?: string; href?: string }>).find((x) => x.rel === "up" && x.href?.includes(`/${part}/`)) : undefined;
  return l?.href ? l.href.split(`/${part}/`)[1]!.split(/[/?]/)[0]! : null;
};

export class PayPalPaymentAdapter implements PaymentAdapter {
  readonly provider = "paypal" as const;
  readonly kind = "paypal" as const;
  readonly livemode: boolean;
  private readonly base: string;
  private readonly f: typeof fetch;
  private token: { value: string; until: number } | null = null;

  constructor(private readonly cfg: PayPalConfig) {
    this.livemode = cfg.live;
    this.base = cfg.live ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
    this.f = cfg.fetchImpl ?? fetch;
  }

  private async send(method: string, path: string, init: { body?: string; headers?: Record<string, string>; auth?: string } = {}): Promise<{ status: number; json: Json }> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.cfg.timeoutMs ?? 20_000);
    try {
      const res = await this.f(`${this.base}${path}`, {
        method, body: init.body, signal: ctl.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json", ...(init.auth ? { Authorization: init.auth } : {}), ...init.headers },
      });
      const text = await res.text();
      let json: Json = {};
      try { json = text ? (JSON.parse(text) as Json) : {}; } catch { json = {}; }
      return { status: res.status, json };
    } catch {
      throw new PaymentProviderError("transient", "paypal_network");
    } finally { clearTimeout(timer); }
  }

  private async bearer(force = false): Promise<string> {
    if (!force && this.token && this.token.until > Date.now()) return this.token.value;
    const basic = Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString("base64");
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.cfg.timeoutMs ?? 20_000);
    let res: Response;
    try {
      res = await this.f(`${this.base}/v1/oauth2/token`, { method: "POST", signal: ctl.signal, headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
    } catch { throw new PaymentProviderError("transient", "paypal_network"); } finally { clearTimeout(timer); }
    if (res.status >= 500) throw new PaymentProviderError("transient", `paypal_auth_${res.status}`);
    const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
    if (!res.ok || !j.access_token) throw new PaymentProviderError("rejected", "paypal_auth_failed");
    this.token = { value: j.access_token, until: Date.now() + Math.max(60, (j.expires_in ?? 300) - 120) * 1000 };
    return j.access_token;
  }

  /** Authenticated call. 5xx/network = transient (outcome unknown); 4xx = rejected with PayPal's issue code. */
  private async api(method: string, path: string, body?: unknown, requestId?: string): Promise<Json> {
    const headers: Record<string, string> = { Prefer: "return=representation", ...(requestId ? { "PayPal-Request-Id": requestId } : {}) };
    const raw = body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body);
    let r = await this.send(method, path, { body: raw, headers, auth: `Bearer ${await this.bearer()}` });
    if (r.status === 401) r = await this.send(method, path, { body: raw, headers, auth: `Bearer ${await this.bearer(true)}` });
    if (r.status >= 500 || r.status === 429) throw new PaymentProviderError("transient", `paypal_${r.status}`);
    if (r.status >= 400) {
      const details = r.json.details as Array<{ issue?: string }> | undefined;
      const code = details?.[0]?.issue ?? (typeof r.json.name === "string" ? r.json.name : `paypal_${r.status}`);
      throw new PaymentProviderError(r.status === 409 ? "transient" : "rejected", code);
    }
    return r.json;
  }

  buildCheckoutParams(req: CheckoutSessionRequest): Record<string, unknown> {
    const sku = SKUS.saju_reading;
    const value = fromCents(sku.amountCents);
    return {
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: req.orderId,
        custom_id: req.orderId,
        // PayPal refuses a second payment with the same invoice id on the account: a second guard against paying twice.
        invoice_id: `haeday-${req.orderId}`,
        description: sku.name,
        soft_descriptor: "HAEDAY",
        amount: { currency_code: sku.currency.toUpperCase(), value, breakdown: { item_total: { currency_code: sku.currency.toUpperCase(), value } } },
        items: [{ name: sku.name, sku: "saju_reading", quantity: "1", category: "DIGITAL_GOODS", unit_amount: { currency_code: sku.currency.toUpperCase(), value } }],
      }],
      application_context: { brand_name: "Haeday", shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW" },
    };
  }

  private orderRef(o: Json): CheckoutSessionRef {
    const s = o.status;
    const status: CheckoutSessionRef["status"] = s === "COMPLETED" ? "complete" : s === "APPROVED" ? "approved" : s === "VOIDED" ? "expired" : "open";
    return { id: String(o.id), url: null, status, createdUnix: unix(o.create_time) ?? undefined };
  }

  async createCheckoutSession(req: CheckoutSessionRequest): Promise<CheckoutSessionRef> {
    const o = await this.api("POST", "/v2/checkout/orders", req.providerParams ?? this.buildCheckoutParams(req), req.idempotencyKey);
    return this.orderRef(o);
  }

  async getCheckoutSession(orderId: string): Promise<CheckoutSessionRef> {
    return this.orderRef(await this.api("GET", `/v2/checkout/orders/${encodeURIComponent(orderId)}`));
  }

  async getCheckoutDetails(orderId: string): Promise<CheckoutDetails> {
    const o = await this.api("GET", `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
    const pu = ((o.purchase_units as Json[] | undefined) ?? [])[0] ?? {};
    const amount = (pu.amount ?? {}) as Money & { breakdown?: Record<string, Money> };
    const b = amount.breakdown ?? {};
    // A declined attempt can precede the one that went through: read the COMPLETED capture (else a pending one).
    const caps = (((pu.payments as Json | undefined)?.captures as Json[] | undefined) ?? []);
    const cap = caps.find((c) => c.status === "COMPLETED") ?? caps.find((c) => c.status === "PENDING") ?? caps[0];
    const capAmount = (cap?.amount ?? {}) as Money;
    const ref = this.orderRef(o);
    const items = ((pu.items as Array<{ sku?: string; quantity?: string }> | undefined) ?? []).map((i) => ({ priceId: i.sku ?? null, quantity: Number(i.quantity ?? "0") }));
    return {
      id: ref.id, livemode: this.livemode,
      status: ref.status === "complete" ? "complete" : ref.status === "expired" ? "expired" : "open",
      paymentStatus: cap?.status === "COMPLETED" ? "paid" : "unpaid",
      currency: (cap ? capAmount.currency_code : amount.currency_code)?.toLowerCase() ?? null,
      amountSubtotal: toCents(b.item_total?.value ?? amount.value),
      amountTax: toCents(b.tax_total?.value ?? "0"),
      amountTotal: toCents(cap ? capAmount.value : amount.value),
      clientReferenceId: typeof pu.reference_id === "string" ? pu.reference_id : null,
      metadataOrderId: typeof pu.custom_id === "string" ? pu.custom_id : typeof cap?.custom_id === "string" ? cap.custom_id : null,
      lineItems: items,
      paymentIntentId: cap && typeof cap.id === "string" ? cap.id : null,
      customerEmail: null, // Jason 2026-09-26: PayPal/Venmo buyers type their email on our page before paying
      amountDiscount: toCents(b.discount?.value ?? "0") ?? 0,
      amountShipping: toCents(b.shipping?.value ?? "0") ?? 0,
      promotionCodeId: null,
      created: unix(o.create_time) ?? 0,
      paidAt: cap ? unix(cap.create_time) : null,
    };
  }

  async capture(orderId: string, idempotencyKey: string): Promise<CaptureResult> {
    let o: Json;
    try {
      o = await this.api("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {}, idempotencyKey);
    } catch (e) {
      if (e instanceof PaymentProviderError && e.kind === "rejected") {
        if (e.code === "ORDER_ALREADY_CAPTURED") return { outcome: "already_captured" };
        if (e.code === "ORDER_NOT_APPROVED") return { outcome: "not_approved" };
        // The buyer can pick another funding source in the PayPal window (actions.restart()).
        if (e.code === "INSTRUMENT_DECLINED" || e.code === "PAYER_ACTION_REQUIRED") return { outcome: "declined", code: e.code };
        // Anything else PayPal refuses (4xx) is final for this order: nothing was charged.
        return { outcome: "failed", code: e.code };
      }
      throw e;
    }
    const caps = (((((o.purchase_units as Json[] | undefined) ?? [])[0]?.payments as Json | undefined)?.captures as Json[] | undefined) ?? []);
    if (caps.some((c) => c.status === "COMPLETED")) return { outcome: "completed" };
    if (caps.some((c) => c.status === "PENDING")) return { outcome: "pending" };
    return { outcome: "declined", code: String(caps[0]?.status ?? "NO_CAPTURE") };
  }

  /** PayPal has no order search: reconciliation reads our own open PayPal orders by id instead (reconcileOpenSessions). */
  async listCompletedSessions(): Promise<CompletedSessionRef[]> { return []; }

  /** An unapproved PayPal order cannot be voided; it is harmless because we never capture an order we closed. */
  async expireCheckoutSession(): Promise<void> { /* nothing to do at PayPal */ }

  async createRefund(req: { paymentIntentId: string; amountCents: number; idempotencyKey: string; orderId: string; refundRowId: string }): Promise<RefundResult> {
    const r = await this.api("POST", `/v2/payments/captures/${encodeURIComponent(req.paymentIntentId)}/refund`, {
      amount: { currency_code: SKUS.saju_reading.currency.toUpperCase(), value: fromCents(req.amountCents) },
      custom_id: req.refundRowId, invoice_id: `haeday-refund-${req.refundRowId}`, note_to_payer: "Haeday refund",
    }, req.idempotencyKey);
    return { id: String(r.id), status: refundStatus(r.status) };
  }

  private toProviderRefund(r: Json): ProviderRefund & { totalRefundedCents: number | null } {
    const amount = (r.amount ?? {}) as Money;
    const bd = (r.seller_payable_breakdown ?? {}) as { total_refunded_amount?: Money };
    const details = (r.status_details ?? {}) as { reason?: string };
    return {
      id: String(r.id), status: refundStatus(r.status), amountCents: toCents(amount.value) ?? 0, currency: amount.currency_code?.toLowerCase() ?? "",
      refundRowId: typeof r.custom_id === "string" ? r.custom_id : null, orderId: null, failureReason: details.reason ?? null,
      totalRefundedCents: toCents(bd.total_refunded_amount?.value),
    };
  }

  async getRefundSummary(captureId: string, knownRefundIds: string[] = []): Promise<PaymentRefundSummary> {
    const cap = await this.api("GET", `/v2/payments/captures/${encodeURIComponent(captureId)}`);
    const capAmount = (cap.amount ?? {}) as Money;
    const captured = toCents(capAmount.value) ?? 0;
    const refunds = [];
    for (const id of [...new Set(knownRefundIds)]) refunds.push(this.toProviderRefund(await this.api("GET", `/v2/payments/refunds/${encodeURIComponent(id)}`)));
    const holding = refunds.filter((r) => r.status !== "failed" && r.status !== "canceled").reduce((a, r) => a + r.amountCents, 0);
    // PayPal's own running total when a refund told us; otherwise what the capture status implies.
    const reported = refunds.map((r) => r.totalRefundedCents).filter((x): x is number => x !== null);
    const refunded = cap.status === "REFUNDED" ? captured : cap.status === "COMPLETED" && !refunds.some((r) => r.status === "pending") ? holding
      : reported.length ? Math.max(...reported) : holding;
    return {
      paymentIntentId: captureId, livemode: this.livemode, currency: capAmount.currency_code?.toLowerCase() ?? "",
      amountCapturedCents: captured, amountRefundedCents: refunded,
      refunds: refunds.map(({ totalRefundedCents: _t, ...r }) => r),
      complete: false,
    };
  }

  parseWebhook(): PaymentEvent { throw new Error("PayPal webhooks are verified asynchronously: use verifyWebhook"); }

  async verifyWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent> {
    const h = (n: string) => headers.get(n) ?? "";
    if (!this.cfg.webhookId || !h("paypal-transmission-sig")) throw new Error("Webhook signature missing");
    let event: Json;
    try { event = JSON.parse(rawBody) as Json; } catch { throw new Error("Bad webhook body"); }
    // The event goes back to PayPal byte-for-byte (re-serializing can change what was signed).
    const body = `{"auth_algo":${JSON.stringify(h("paypal-auth-algo"))},"cert_url":${JSON.stringify(h("paypal-cert-url"))},"transmission_id":${JSON.stringify(h("paypal-transmission-id"))},"transmission_sig":${JSON.stringify(h("paypal-transmission-sig"))},"transmission_time":${JSON.stringify(h("paypal-transmission-time"))},"webhook_id":${JSON.stringify(this.cfg.webhookId)},"webhook_event":${rawBody}}`;
    const v = await this.api("POST", "/v1/notifications/verify-webhook-signature", body);
    if (v.verification_status !== "SUCCESS") throw new Error("Bad signature");
    return this.normalize(event);
  }

  /** PayPal event → our normalized event (exported for tests through the class). */
  normalize(e: Json): PaymentEvent {
    const base = { id: String(e.id), livemode: this.livemode };
    const type = String(e.event_type ?? "");
    const r = (e.resource ?? {}) as Json;
    switch (type) {
      case "CHECKOUT.ORDER.APPROVED":
        return { ...base, type: "checkout.approved", sessionId: String(r.id) };
      case "PAYMENT.CAPTURE.COMPLETED":
      case "PAYMENT.CAPTURE.DENIED":
      case "PAYMENT.CAPTURE.DECLINED": {
        const orderId = ((r.supplementary_data as Json | undefined)?.related_ids as Json | undefined)?.order_id ?? upLink(r.links, "orders");
        if (typeof orderId !== "string") return { ...base, type: "ignored", providerType: `${type}:no_order` };
        return { ...base, type: type === "PAYMENT.CAPTURE.COMPLETED" ? "checkout.completed" : "checkout.async_failed", sessionId: orderId };
      }
      case "PAYMENT.CAPTURE.REFUNDED": {
        const pr = this.toProviderRefund(r);
        return { ...base, type: "refund.updated", refundId: pr.id, paymentIntentId: upLink(r.links, "captures"), status: pr.status, amountCents: pr.amountCents, orderId: null, refundRowId: pr.refundRowId };
      }
      case "PAYMENT.CAPTURE.REVERSED": {
        // The resource is the reversal (a refund object, e.g. after a chargeback): its "up" link names the capture.
        const pr = this.toProviderRefund(r);
        return { ...base, type: "refund.updated", refundId: pr.id, paymentIntentId: upLink(r.links, "captures"), status: pr.status, amountCents: pr.amountCents, orderId: null, refundRowId: pr.refundRowId };
      }
      case "CUSTOMER.DISPUTE.CREATED":
      case "CUSTOMER.DISPUTE.UPDATED":
      case "CUSTOMER.DISPUTE.RESOLVED": {
        const tx = ((r.disputed_transactions as Json[] | undefined) ?? [])[0] ?? {};
        const outcome = ((r.dispute_outcome ?? {}) as { outcome_code?: string }).outcome_code;
        const status = r.status === "RESOLVED"
          ? outcome === "RESOLVED_SELLER_FAVOUR" ? "won" : outcome === "RESOLVED_BUYER_FAVOUR" ? "lost" : "warning_closed"
          : String(r.status ?? "open").toLowerCase();
        const due = typeof r.seller_response_due_date === "string" ? new Date(r.seller_response_due_date) : null;
        return { ...base, type: "dispute.updated", disputeId: String(r.dispute_id), paymentIntentId: typeof tx.seller_transaction_id === "string" ? tx.seller_transaction_id : null, status, reason: typeof r.reason === "string" ? r.reason : null, evidenceDueBy: due };
      }
      default:
        return { ...base, type: "ignored", providerType: type || "unknown" };
    }
  }
}
