// Builds provider adapters from the environment. The only place that decides which implementation runs.
import type { Env } from "./env";
import { SITE } from "@/lib/site";
import { StripePaymentAdapter } from "./adapters/stripe";
import { AnthropicLlm, type LlmAdapter } from "./adapters/llm";
import { ResendEmail, type EmailAdapter } from "./adapters/email";
import type { PaymentAdapter } from "./payments/adapter";

let payments: PaymentAdapter | null | undefined;
export function paymentAdapter(env: Env): PaymentAdapter | null {
  if (payments === undefined) payments = env.STRIPE_SECRET_KEY ? new StripePaymentAdapter(env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET) : null;
  return payments;
}

export function llmAdapter(env: Env): LlmAdapter | null {
  return env.LLM_API_KEY && env.LLM_MODEL ? new AnthropicLlm(env.LLM_API_KEY, env.LLM_MODEL) : null;
}

export function emailAdapter(env: Env): EmailAdapter | null {
  return env.RESEND_API_KEY && env.EMAIL_FROM ? new ResendEmail(env.RESEND_API_KEY, env.EMAIL_FROM, env.SUPPORT_EMAIL) : null;
}

export const supportEmail = (env: Env) => env.SUPPORT_EMAIL ?? SITE.support;
