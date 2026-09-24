// Email boundary (Resend). Business code depends on EmailAdapter only.
export interface EmailMessage { to: string; subject: string; html: string; text: string; idempotencyKey: string }
export interface EmailAdapter { send(msg: EmailMessage): Promise<{ id: string }> }

export class EmailError extends Error {
  constructor(public readonly code: "http" | "network" | "rejected", public readonly permanent = false) { super(`Email ${code}`); this.name = "EmailError"; }
}

export class ResendEmail implements EmailAdapter {
  constructor(private readonly apiKey: string, private readonly from: string, private readonly replyTo?: string, private readonly fetchImpl: typeof fetch = fetch) {}
  async send(msg: EmailMessage): Promise<{ id: string }> {
    let res: Response;
    try {
      res = await this.fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": msg.idempotencyKey },
        body: JSON.stringify({ from: this.from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text, ...(this.replyTo ? { reply_to: this.replyTo } : {}) }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch { throw new EmailError("network"); }
    // 4xx other than 429 will not succeed on retry (bad address, unverified domain).
    if (!res.ok) throw new EmailError(res.status === 422 || res.status === 400 ? "rejected" : "http", res.status >= 400 && res.status < 500 && res.status !== 429);
    const body = (await res.json()) as { id?: string };
    return { id: body.id ?? "" };
  }
}

export class FakeEmail implements EmailAdapter {
  sent: EmailMessage[] = [];
  failNext: EmailError | null = null;
  async send(msg: EmailMessage): Promise<{ id: string }> {
    if (this.failNext) { const e = this.failNext; this.failNext = null; throw e; }
    if (this.sent.some((m) => m.idempotencyKey === msg.idempotencyKey)) return { id: `dup-${msg.idempotencyKey}` };
    this.sent.push(msg);
    return { id: `em_${this.sent.length}` };
  }
}
