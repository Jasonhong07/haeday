// `pnpm preflight`: the launch checklist for the current environment (names and yes/no only, never values).
import { getEnv } from "../src/server/env";
import { preflight } from "../src/server/preflight";

const mark = { ok: "OK   ", todo: "TODO ", warn: "WARN ", block: "BLOCK" } as const;
let env;
try { env = getEnv(); } catch (e) { console.log(`BLOCK environment: ${(e as Error).message}`); process.exit(2); }
const checks = preflight(env);
for (const c of checks) console.log(`${mark[c.level]} ${c.area}: ${c.text}`);
process.exit(checks.some((c) => c.level === "block") ? 1 : 0);
