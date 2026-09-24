import type { ErrorEvent, StackFrame } from "@sentry/nextjs";

// Allowlist scrubber (CLAUDE.md rule 9): everything not explicitly kept is dropped. Free-form text can carry
// birth data, emails or tokens, so it is only forwarded when it cannot contain any of them (no digits, no "@").
const TYPES = new Set(["Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "DrizzleQueryError", "ZodError"]);
const PUBLIC_PATHS = new Set(["/", "/saju", "/method", "/api/places", "/api/charts", "/api/health/live", "/api/health/ready"]);
const ID_PATHS = /^\/(chart|order|r|refund|api\/charts)\/[^/]+$/;
const SAFE_TEXT = /^[A-Za-z][A-Za-z ,.:;'()_-]{0,159}$/;

const safeText = (text: string | undefined, fallback: string) => (text && SAFE_TEXT.test(text) ? text : fallback);

function scrubPath(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    const path = PUBLIC_PATHS.has(url.pathname) ? url.pathname
      : ID_PATHS.test(url.pathname) ? url.pathname.replace(/\/[^/]+$/, "/[id]")
      : "/[redacted]";
    return url.origin + path;
  } catch {
    return undefined; // never forward an unparseable URL
  }
}

/** Code location only: file, function, line. No local variables or source lines (they can hold customer data). */
function scrubFrame(f: StackFrame): StackFrame {
  const file = f.filename?.replace(/^.*?(?=(src|node_modules|\.next)\/)/, "").split("?")[0];
  return { filename: file, function: f.function, lineno: f.lineno, colno: f.colno, in_app: f.in_app, module: f.module };
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const clean: ErrorEvent = {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    level: event.level,
    platform: event.platform ?? "javascript",
    environment: event.environment,
    release: event.release,
    sdk: event.sdk,
  };
  if (event.message !== undefined) clean.message = safeText(event.message, "Message redacted");
  const url = event.request?.url ? scrubPath(event.request.url) : undefined;
  if (url) clean.request = { url, method: event.request?.method };
  if (event.exception?.values) {
    clean.exception = {
      values: event.exception.values.map((ex) => ({
        type: TYPES.has(ex.type ?? "") ? ex.type : "Error",
        value: ex.type === "DrizzleQueryError" ? "Failed query (details redacted)" : safeText(ex.value, "Exception details redacted"),
        mechanism: ex.mechanism ? { type: ex.mechanism.type, handled: ex.mechanism.handled } : undefined,
        stacktrace: ex.stacktrace?.frames ? { frames: ex.stacktrace.frames.map(scrubFrame) } : undefined,
      })),
    };
  }
  // Dropped on purpose: user, request data/headers/cookies/query, breadcrumbs, extra, contexts, tags,
  // fingerprint, transaction, logentry, server_name, stack locals and source context.
  return clean;
}

export function sentryOptions(dsn: string, environment: string) {
  return { dsn, environment, sendDefaultPii: false, tracesSampleRate: 0, beforeSend: scrubEvent };
}
