import path from "node:path";
import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Two builds come out of this one source tree.
 *
 *   web     The Next.js app as it has always been: server components, route
 *           handlers, middleware, SSR.
 *   mobile  A static export bundled into the Android APK. There is no server
 *           behind a WebView, so route handlers, middleware and every
 *           request-scoped read have to be absent rather than merely unused.
 *
 * The split is done with `pageExtensions` rather than a second app directory,
 * so the two builds share every file that does not actually differ — which is
 * almost all of them. A file named `page.web.tsx` is a page in the web build
 * and invisible to the mobile one; `page.mobile.tsx` is the reverse. Route
 * handlers are all `route.web.ts`, which is what keeps `output: "export"` from
 * tripping over `force-dynamic`.
 */
const isMobile = process.env.NEXT_PUBLIC_MOBILE === "1";

const platformExtensions = isMobile
  ? ["mobile.tsx", "mobile.ts"]
  : ["web.tsx", "web.ts"];

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: isMobile ? ".next.mobile" : ".next",
  reactStrictMode: true,
  // Lint runs in the build. It was disabled before, which read as "we know
  // about the warnings" but actually meant there was no ESLint config at all.
  eslint: { ignoreDuringBuilds: false },

  // Platform-specific first: a `page.mobile.tsx` must win over a bare
  // `page.tsx` sitting beside it, which is how a screen provides a WebView
  // implementation without forking the whole route.
  pageExtensions: [...platformExtensions, "tsx", "ts", "jsx", "js"],

  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
  },

  ...(isMobile
    ? {
        output: "export",
        // The exported bundle is loaded from the APK over `https://localhost`,
        // where a trailing-slash directory layout is what maps cleanly onto
        // `index.html` files on disk.
        trailingSlash: true,
        // No image optimiser without a server.
        images: { unoptimized: true },
      }
    : {}),

  webpack(config) {
    if (isMobile) {
      // Swap the request-scoped server modules for WebView equivalents. These
      // are aliases rather than runtime branches so the real implementations —
      // and the secrets and Node built-ins they reach for — are never linked
      // into a bundle that ships on a device.
      config.resolve.alias = {
        ...config.resolve.alias,
        "@/lib/supabase/server": path.resolve(here, "src/lib/mobile/stubs/supabase-server.ts"),
        "@/lib/request-context": path.resolve(here, "src/lib/mobile/stubs/request-context.ts"),
      };
    }
    return config;
  },
};

/**
 * Sentry's build step: it rewrites the client bundle to capture errors and,
 * when credentials exist, uploads source maps so a stack trace names real
 * files instead of minified chunks.
 *
 * Every part of it is conditional on configuration being present. A clone with
 * no Sentry account has to build exactly as it did before — this app's whole
 * premise is that it runs with no environment at all.
 */
const hasSentryCredentials = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT,
);

/**
 * The mobile build skips Sentry's wrapper entirely.
 *
 * `tunnelRoute` installs a route handler, which `output: "export"` cannot emit,
 * and the tunnel exists to defeat ad blockers on the web — a concern with no
 * counterpart inside a WebView. The client SDK still initialises from
 * `instrumentation-client.ts` if a DSN is configured, so crashes are still
 * reported; only the build-time rewriting is dropped.
 */
export default isMobile
  ? nextConfig
  : withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      // Without a token there is nothing to upload, and attempting it turns a
      // missing optional secret into a failed build.
      sourcemaps: { disable: !hasSentryCredentials },
      // The plugin is chatty on every build; its output matters only when it fails.
      silent: !process.env.CI,
      // Routes Sentry's own requests through this app's origin, so an ad blocker
      // cannot quietly suppress error reporting.
      tunnelRoute: "/monitoring",
      // Strips the SDK's internal debug logging from the production bundle.
      webpack: { treeshake: { removeDebugLogging: true } },
    });
