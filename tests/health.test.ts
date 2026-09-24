import { expect, it } from "vitest";
import { GET } from "../src/app/api/health/live/route";
it("reports liveness without infrastructure details", async () => {
  const response = GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ status: "ok" });
});
