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
  expect(event.request?.url).toBe("https://haeday.com/chart/[id]");
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


it("never forwards PII in messages, tags, exception text, path tokens or stack locals", () => {
  const secret = "synthetic-person@example.test";
  const event = scrubEvent({
    message: secret, tags: { email: secret }, fingerprint: [secret],
    request: { url: "https://haeday.com/login/secret-token?email=" + secret },
    exception: { values: [{ type: "Error", value: "Birth 1990-01-01 " + secret,
      stacktrace: { frames: [{ vars: { email: secret }, context_line: secret }] } }] },
  } as unknown as ErrorEvent);
  expect(JSON.stringify(event)).not.toMatch(/synthetic-person|1990-01-01|secret-token/);
});

it("keeps what is needed to debug: code location, error type, safe messages, environment", () => {
  const event = scrubEvent({
    type: undefined, environment: "staging", release: "abc", level: "error",
    message: "Haeday Sentry connection test",
    request: { url: "https://haeday.com/order/123e4567", method: "POST" },
    exception: { values: [{ type: "RangeError", value: "date outside jie table", mechanism: { type: "generic", handled: false },
      stacktrace: { frames: [{ filename: "/app/src/server/engine/astro.ts?x=1", abs_path: "/home/u/app/src/server/engine/astro.ts", function: "jieIndexAt", lineno: 13, colno: 5,
        pre_context: ["secret"], vars: { a: 1 } }] } }] },
  } as unknown as ErrorEvent);
  expect(event.environment).toBe("staging");
  expect(event.message).toBe("Haeday Sentry connection test");
  expect(event.request).toEqual({ url: "https://haeday.com/order/[id]", method: "POST" });
  const ex = event.exception!.values![0]!;
  expect(ex.value).toBe("date outside jie table");
  expect(ex.stacktrace!.frames![0]).toEqual({ filename: "src/server/engine/astro.ts", function: "jieIndexAt", lineno: 13, colno: 5, in_app: undefined, module: undefined });
  expect(JSON.stringify(event)).not.toMatch(/secret|abs_path|\/home\/u/);
});

it("redacts any message that could hold a date, number or email", () => {
  for (const m of ["born 1990-01-01", "user a@b.co failed", "order 12 failed", "token=abc"]) {
    expect(scrubEvent({ type: undefined, message: m } as ErrorEvent).message).toBe("Message redacted");
  }
});
