// Sends one test event to verify the Sentry connection: `pnpm sentry:test` with SENTRY_DSN set.
import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "../src/server/observability/sentry";

const dsn = process.env.SENTRY_DSN;
if (!dsn) { console.error("SENTRY_DSN is not set"); process.exit(1); }
Sentry.init(sentryOptions(dsn, process.env.APP_ENV ?? "dev"));
Sentry.captureMessage("Haeday Sentry connection test");
Sentry.flush(5000).then((ok) => { console.log(ok ? "sent" : "not sent"); process.exit(ok ? 0 : 1); });
