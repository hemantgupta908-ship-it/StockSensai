/**
 * Server and edge instrumentation.
 *
 * Next calls `register()` once per runtime at startup. Both Sentry configs are
 * imported dynamically because the Node and edge builds pull in different SDK
 * internals, and a static import would drag the Node one into the edge bundle —
 * where the middleware runs, and where bundle size is a hard limit.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/**
 * Reports errors thrown inside server components, route handlers and the data
 * layer — the ones that previously reached only `console.error` in a serverless
 * log nobody reads.
 */
export async function onRequestError(
  ...args: Parameters<
    typeof import("@sentry/nextjs").captureRequestError
  >
) {
  const { captureRequestError } = await import("@sentry/nextjs");
  return captureRequestError(...args);
}
