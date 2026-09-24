// Builds provider adapters from the environment. The only place that decides which implementation runs.
import { devFakes, type Env } from "./env";
import { FakePaymentAdapter } from "./adapters/fake-payments";
import { DevLlm } from "./adapters/dev-llm";
import { SITE } from "@/lib/site";
import { StripePaymentAdapter } from "./adapters/stripe";
import { AnthropicLlm, type LlmAdapter } from "./adapters/llm";
import { ResendEmail, type EmailAdapter } from "./adapters/email";
import type { PaymentAdapter } from "./payments/adapter";

let payments: PaymentAdapter | null | undefined;
export function paymentAdapter(env: Env): PaymentAdapter | null {
  if (payments === undefined) {
    if (devFakes(env)) payments = new FakePaymentAdapter(`${new URL(env.APP_ORIGIN).origin}/dev/pay?s=`); // L6, dev only
    else payments = env.STRIPE_SECRET_KEY ? new StripePaymentAdapter(env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET) : null;
  }
  return payments;
}

export function llmAdapter(env: Env): LlmAdapter | null {
  if (devFakes(env)) return new DevLlm();
  return env.LLM_API_KEY && env.LLM_MODEL ? new AnthropicLlm(env.LLM_API_KEY, env.LLM_MODEL) : null;
}

/** Price id the checkout sends: the dev fake has no Stripe price. */
export const priceId = (env: Env) => (devFakes(env) ? "price_dev_fake" : env.STRIPE_PRICE_SAJU);
export const dailyCap = (env: Env) => (devFakes(env) && env.LLM_DAILY_CAP <= 0 ? 100 : env.LLM_DAILY_CAP);

export function emailAdapter(env: Env): EmailAdapter | null {
  return env.RESEND_API_KEY && env.EMAIL_FROM ? new ResendEmail(env.RESEND_API_KEY, env.EMAIL_FROM, env.SUPPORT_EMAIL) : null;
}

export const supportEmail = (env: Env) => env.SUPPORT_EMAIL ?? SITE.support;
