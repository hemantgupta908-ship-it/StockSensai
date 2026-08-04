/**
 * No-op stand-in for the `server-only` package.
 *
 * That package throws on import outside a React Server Component, which is
 * exactly what we want in the app — it's what stops the service-role Supabase
 * key or a live provider from being pulled into client code. CLI scripts run
 * outside Next entirely, so they alias it to this via `scripts/tsconfig.json`.
 * The real guarantee is untouched: nothing in `src/` sees this file.
 */
export {};
