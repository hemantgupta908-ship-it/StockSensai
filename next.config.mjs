import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: ".next.tmp",
  reactStrictMode: true,
  // Lint runs in the build. It was disabled before, which read as "we know
  // about the warnings" but actually meant there was no ESLint config at all.
  eslint: { ignoreDuringBuilds: false },
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
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

export default withSentryConfig(nextConfig, {
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
