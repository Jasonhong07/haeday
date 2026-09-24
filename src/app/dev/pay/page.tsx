// L6: dev-only stand-in for the Stripe payment page (404 anywhere else). Lets the end-to-end test pay with no network.
import { notFound } from "next/navigation";
import { devFakes } from "@/server/env";
import { serverContext } from "@/server/http";

export const dynamic = "force-dynamic";

export default async function DevPay({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const ctx = serverContext();
  if (!devFakes(ctx.env)) notFound();
  const { s } = await searchParams;
  if (!s || !/^cs_test_[a-z0-9]+$/.test(s)) notFound();
  return (
    <main className="app">
      <h1>Test payment (dev only)</h1>
      <p className="note">This page exists only with DEV_FAKE_PROVIDERS=true in APP_ENV=dev. No money moves.</p>
      <form method="post" action="/api/dev/pay"><input type="hidden" name="s" value={s} /><button className="btn btn-primary" type="submit">Pay $3.99 (test)</button></form>
    </main>
  );
}
