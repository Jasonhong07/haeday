import { expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { scrubEvent } from "../src/server/observability/sentry";

it("removes request bodies, cookies, headers, query strings and users from error events", () => {
  const event = scrubEvent({
    type: undefined,
    request: { url: "https://haeday.com/chart/1?email=a@b.co", data: { birthDate: "1990-01-01" }, cookies: { s: "t" }, headers: { cookie: "x" }, query_string: "email=a@b.co" },
    user: { email: "a@b.co" },
  } as ErrorEvent);
  expect(JSON.stringify(event)).not.toMatch(/a@b\.co|1990-01-01|cookie/);
  expect(event.request?.url).toBe("https://haeday.com/chart/1");
});

it("drops breadcrumbs, extra, contexts and SQL params from exception text", () => {
  const event = scrubEvent({
    type: undefined,
    breadcrumbs: [{ message: "GET /login?token=abc" }],
    extra: { email: "a@b.co" },
    contexts: { req: { url: "/r/1?token=abc" } },
    exception: { values: [{ type: "DrizzleQueryError", value: "Failed query: insert into orders values ($1)\nparams: v1.k1.secret,a@b.co" }] },
  } as unknown as ErrorEvent);
  const text = JSON.stringify(event);
  expect(text).not.toMatch(/token=abc|a@b\.co|v1\.k1/);
  expect(event.exception?.values?.[0]?.value).toContain("Failed query");
});
