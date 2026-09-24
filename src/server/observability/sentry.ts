import type { ErrorEvent } from "@sentry/nextjs";

/** Strip anything that could carry personal data before an event leaves the server (CLAUDE.md rule 9). */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
    if (event.request.url) event.request.url = event.request.url.split("?")[0];
  }
  delete event.user;
  delete event.breadcrumbs;
  delete event.extra;
  delete event.contexts;
  for (const ex of event.exception?.values ?? []) {
    // ORM errors embed SQL parameters (hashes, envelopes, utm) after "params:"; keep only the head.
    if (ex.value) ex.value = ex.value.split(/\nparams:|params:/)[0]!.slice(0, 300);
  }
  if (event.message) event.message = event.message.slice(0, 300);
  return event;
}

export function sentryOptions(dsn: string, environment: string) {
  return {
    dsn,
    environment,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  };
}
