/**
 * Sentry in the browser.
 *
 * Deliberately minimal. Session Replay is not enabled and should not be: it
 * records the DOM, and on the budget side the DOM *is* the user's bank
 * statement.
 */

import * as Sentry from "@sentry/nextjs";

import { sharedSentryOptions } from "@/lib/observability";

Sentry.init({
  ...sharedSentryOptions,
  sampleRate: 1,
  // Extensions and cross-origin scripts produce errors this app cannot act on.
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    "Non-Error promise rejection captured",
  ],
});

/** Instruments client-side navigation timing. Exported for Next to pick up. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
