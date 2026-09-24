import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getEnv } = await import("./server/env");
    const env = getEnv(); // fail fast on invalid configuration
    // R10: build the city index at boot so the first visitor's search is not the slow one.
    const { searchPlaces } = await import("./server/places");
    searchPlaces("seoul");
    if (env.SENTRY_DSN) {
      const { sentryOptions } = await import("./server/observability/sentry");
      Sentry.init(sentryOptions(env.SENTRY_DSN, env.APP_ENV));
    }
  }
}

export const onRequestError = Sentry.captureRequestError;
