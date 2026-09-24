import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "../../src/server/db/client";
import { isSalesEnabled, resetSettingsCache, setSalesEnabled } from "../../src/server/settings";
import { freshDb, hasDb } from "./helpers";

describe.skipIf(!hasDb)("sales kill switch", () => {
  let h: DbHandle;
  beforeAll(async () => { h = await freshDb(); resetSettingsCache(); });
  afterAll(async () => { await h?.pool.end(); });

  it("is off when never configured (fail closed)", async () => {
    expect(await isSalesEnabled(h.db)).toBe(false);
  });
  it("turns on and off without redeploy", async () => {
    await setSalesEnabled(h.db, true, "test");
    expect(await isSalesEnabled(h.db)).toBe(true);
    await setSalesEnabled(h.db, false, "test");
    expect(await isSalesEnabled(h.db)).toBe(false);
  });
  it("serves a cached value for at most 30 seconds", async () => {
    const t0 = Date.now();
    await setSalesEnabled(h.db, true, "test");
    expect(await isSalesEnabled(h.db, t0)).toBe(true);
    await h.db.execute("update settings set value = 'false'::jsonb" as never);
    expect(await isSalesEnabled(h.db, t0 + 10_000)).toBe(true);
    expect(await isSalesEnabled(h.db, t0 + 31_000)).toBe(false);
  });
});
