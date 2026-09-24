import { expect, it } from "vitest";
import { sameOrigin } from "../src/server/http";
import { parseEnv } from "../src/server/env";

const env = parseEnv({ APP_ENV: "dev", APP_ORIGIN: "https://haeday.com" });
const req = (headers: Record<string, string>) => new Request("http://internal/api/charts", { method: "POST", headers });

it("accepts the configured origin and the request's own host, rejects everything else", () => {
  expect(sameOrigin(req({ origin: "https://haeday.com" }), env)).toBe(true);
  expect(sameOrigin(req({ origin: "https://web-staging.up.railway.app", host: "web-staging.up.railway.app" }), env)).toBe(true);
  expect(sameOrigin(req({ origin: "https://evil.example", host: "web-staging.up.railway.app" }), env)).toBe(false);
  expect(sameOrigin(req({ host: "haeday.com" }), env)).toBe(false);
  expect(sameOrigin(req({ origin: "null", host: "haeday.com" }), env)).toBe(false);
});
