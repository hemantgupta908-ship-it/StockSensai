import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * Lint configuration.
 *
 * There was none before this, and `eslint.ignoreDuringBuilds` in next.config
 * was hiding that absence rather than suppressing known problems.
 *
 * The rule set is Next's recommended core-web-vitals baseline plus its
 * TypeScript rules, imported as native flat config. It is deliberately no
 * stricter than that to begin with: a config that fails the build on hundreds
 * of pre-existing stylistic complaints gets switched off again within a day.
 * Correctness rules are errors; matters of taste stay warnings.
 */
export default [
  {
    ignores: [
      ".next/**",
      ".next.tmp/**",
      "node_modules/**",
      "next-env.d.ts",
      // The Android build's static export, and the copy of it Capacitor syncs
      // into the native project. Both are minified webpack output.
      "out/**",
      "android/**",
      // Source images for the launcher icon and splash.
      "assets/**",
      // Agent worktrees carry their own build output, which is not source.
      ".claude/**",
      // Generated instrument universe — thousands of lines of data literals.
      "src/lib/market-data/seed/instruments.generated.ts",
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // `any` appears where an upstream payload has no usable type. Worth
      // seeing, not worth failing a build over today.
      "@typescript-eslint/no-explicit-any": "warn",
      // Usually a genuine mistake, but a leading underscore is the conventional
      // way to say "deliberately ignored".
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    /**
     * React Compiler rules, new in eslint-config-next 16.
     *
     * These have been triaged once, site by site. The verdict was mixed, and
     * worth writing down so it is not re-derived:
     *
     * - `purity` found a genuine bug — a screen rendering `Math.random()` as if
     *   it were strategy output. Worth every false positive on its own.
     * - `refs` and `static-components` were false positives here: `getIcon` is
     *   a module-level Map lookup with stable references, and the virtualiser's
     *   `scrollMargin` is its library's own documented usage. Both are
     *   suppressed at the site with the reasoning attached.
     * - `set-state-in-effect` is mostly *correct code*. The rule cannot tell
     *   "synchronise with an external system" — localStorage, the DOM, the
     *   network, an auth session — from "derive state that belongs in render",
     *   and the former is precisely what React says effects are for. Reading
     *   localStorage on mount and portalling after mount cannot be written any
     *   other way.
     *
     * So the remaining count is not a debt to drive to zero, and treating it as
     * one would mean rewriting working providers to satisfy a rule that does not
     * understand them. They stay warnings: visible when a new one appears,
     * which is when they are actually worth reading.
     */
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/use-memo": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/static-components": "warn",
    },
  },
  {
    // Developer tools run by hand, not shipped code.
    files: ["scripts/**/*.{ts,js}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];
