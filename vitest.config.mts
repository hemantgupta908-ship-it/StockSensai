import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Only the component tests need JSX transformed; the plugin is inert for the
  // pure-logic suites, which are the majority.
  plugins: [react()],
  resolve: {
    // Resolves the `@/` alias from tsconfig, so tests import the way the app
    // does rather than counting `../`s.
    tsconfigPaths: true,
    alias: {
      // `server-only` throws on import outside a React Server Component, which
      // is exactly what it is there for — it keeps the service-role key out of
      // client bundles. Tests run outside Next entirely, so they use the same
      // no-op stand-in the CLI scripts already alias it to. The guarantee is
      // untouched: nothing in the app build sees this.
      // `fileURLToPath`, not `URL.pathname` — the latter yields "/C:/..." on
      // Windows, which resolves to nothing.
      "server-only": fileURLToPath(new URL("./scripts/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    // The date arithmetic under test is timezone-sensitive by nature — that is
    // the bug class these tests exist to catch — so the suite pins a zone rather
    // than inheriting the machine's. IST is deliberate: it is the app's own
    // market, and the zone where `toISOString().slice(0, 10)` silently moved
    // every budget period boundary back a day.
    env: { TZ: "Asia/Kolkata" },
  },
});
