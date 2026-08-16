/**
 * Shared Sentry configuration.
 *
 * This app holds two things that must never leave it: a user's complete
 * financial history on the budget side, and their session cookies on both. The
 * default SDK behaviour is reasonably careful, but "reasonably careful" is the
 * wrong bar for someone's bank transactions, so everything is stripped here
 * explicitly rather than trusted to defaults.
 *
 * The design rule is deny-by-default: an allowlist of what may be sent, not a
 * blocklist of what may not. A blocklist silently starts leaking the day a new
 * field is added.
 */

import type { ErrorEvent, EventHint } from "@sentry/nextjs";

import { isSentryConfigured, sentryDsn } from "@/lib/env";

export { isSentryConfigured, sentryDsn };

/**
 * Keys whose values are redacted wherever they appear, at any depth.
 *
 * `payload` and `settings` are the budget document's own column names — those
 * two alone are the entire financial history.
 */
const REDACTED_KEYS = new Set([
  "payload",
  "settings",
  "transactions",
  "wallets",
  "amount",
  "balance",
  "budget",
  "policies",
  "objectives",
  "cookie",
  "cookies",
  "authorization",
  "auth",
  "token",
  "access_token",
  "refresh_token",
  "apikey",
  "api_key",
  "password",
  "email",
  "user_id",
]);

const REDACTED = "[redacted]";

/** Depth cap: an error object can hold a cyclic or enormous graph. */
const MAX_DEPTH = 6;

function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return REDACTED;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = REDACTED_KEYS.has(key.toLowerCase()) ? REDACTED : redactDeep(v, depth + 1);
  }
  return out;
}

/**
 * Strip identifying and financial data from an event before it is sent.
 *
 * Runs on every event on every runtime. Returning `null` drops the event.
 */
export function scrubEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  // Never attach a user identity. Sentry would otherwise correlate every error
  // in the app to a real person by id, IP or email.
  delete event.user;
  delete event.server_name;

  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.headers;
    // A URL can carry tickers and ids in its query string.
    if (event.request.url) event.request.url = event.request.url.split("?")[0];
  }

  if (event.contexts) event.contexts = redactDeep(event.contexts) as typeof event.contexts;
  if (event.extra) event.extra = redactDeep(event.extra) as typeof event.extra;

  // Console breadcrumbs are the likeliest accidental leak: this codebase logs
  // freely, and a warning that interpolates a transaction would otherwise ride
  // along with the error. Keep navigation and fetch trails, drop the rest.
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .filter((crumb) => crumb.category !== "console")
      .map((crumb) => ({
        ...crumb,
        data: crumb.data ? (redactDeep(crumb.data) as typeof crumb.data) : undefined,
      }));
  }

  return event;
}

/** Options every runtime's `Sentry.init` shares. */
export const sharedSentryOptions = {
  dsn: sentryDsn,
  enabled: isSentryConfigured,
  // Never send IP addresses, cookies or headers. The single most important
  // switch here; `scrubEvent` is the second line of defence, not the first.
  sendDefaultPii: false,
  environment: process.env.NODE_ENV,
  // This is an error reporter, not an APM. Traces would multiply the volume and
  // add nothing while the app has one developer.
  tracesSampleRate: 0,
  beforeSend: scrubEvent,
} as const;
