/**
 * Sentry for the edge runtime, which here means the middleware — the auth gate
 * and the security headers. A failure in it locks everyone out, so it is worth
 * reporting even though almost nothing else runs on this runtime.
 */

import * as Sentry from "@sentry/nextjs";

import { sharedSentryOptions } from "@/lib/observability";

Sentry.init({
  ...sharedSentryOptions,
  sampleRate: 1,
});
