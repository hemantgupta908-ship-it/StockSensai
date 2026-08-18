import { withSentryConfig } from "@sentry/nextjs";

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
  /**
   * A directory each.
   *
   * The two builds compile the same routes to different outputs, so sharing
   * `.next` means every switch between them starts from a cache describing the
   * other one — which on Windows surfaces as a readlink error on
   * `.next/diagnostics`, not as a clean rebuild.
   *
   * `out` for mobile rather than `.next.mobile` because an export with a custom
   * `distDir` *replaces* that directory with the exported site instead of
   * writing a sibling `out/`. Naming it `out` puts the finished assets exactly
   * where `webDir` in `capacitor.config.ts` expects them.
   */
  distDir: isMobile ? "out" : ".next",
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
