/**
 * Sentry for the Node runtime: route handlers, server components, the cron
 * jobs and the market-data layer.
 *
 * No-ops entirely when `NEXT_PUBLIC_SENTRY_DSN` is unset, which keeps the
 * zero-configuration demo boot intact.
 */

import * as Sentry from "@sentry/nextjs";

import { sharedSentryOptions } from "@/lib/observability";

Sentry.init({
  ...sharedSentryOptions,
  // The undocumented upstream feed is the most likely thing to break in
  // production, and it breaks by changing shape rather than by going down.
  // Those throws are the whole reason this is here, so nothing is sampled away.
  sampleRate: 1,
});
