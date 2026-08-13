import type { Config } from "tailwindcss";

/**
 * iOS-inspired design tokens.
 *
 * Colours are driven by CSS custom properties defined in `globals.css` so that
 * light/dark mode is a single class swap on <html> rather than a `dark:` variant
 * on every element. The named scales below mirror Apple's semantic colour system
 * (systemBackground, secondarySystemBackground, label, separator, ...).
 */
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      screens: {
        /** Large desktop / monitor. Tailwind stops at 2xl (1536px). */
        "3xl": "1920px",
      },
      colors: {
        // Semantic surfaces (iOS: systemBackground family)
        bg: "rgb(var(--bg) / <alpha-value>)",
        "bg-secondary": "rgb(var(--bg-secondary) / <alpha-value>)",
        "bg-tertiary": "rgb(var(--bg-tertiary) / <alpha-value>)",
        "bg-elevated": "rgb(var(--bg-elevated) / <alpha-value>)",
        fill: "rgb(var(--fill) / <alpha-value>)",

        // Semantic content (iOS: label family)
        label: "rgb(var(--label) / <alpha-value>)",
        "label-secondary": "rgb(var(--label-secondary) / <alpha-value>)",
        "label-tertiary": "rgb(var(--label-tertiary) / <alpha-value>)",
        "label-quaternary": "rgb(var(--label-quaternary) / <alpha-value>)",
        separator: "rgb(var(--separator) / <alpha-value>)",

        // iOS system accent colours
        blue: "rgb(var(--sys-blue) / <alpha-value>)",
        green: "rgb(var(--sys-green) / <alpha-value>)",
        red: "rgb(var(--sys-red) / <alpha-value>)",
        amber: "rgb(var(--sys-orange) / <alpha-value>)",
        yellow: "rgb(var(--sys-yellow) / <alpha-value>)",
        purple: "rgb(var(--sys-purple) / <alpha-value>)",
        teal: "rgb(var(--sys-teal) / <alpha-value>)",
        indigo: "rgb(var(--sys-indigo) / <alpha-value>)",
        pink: "rgb(var(--sys-pink) / <alpha-value>)",
        accent: "rgb(var(--accent-rgb) / <alpha-value>)",
        "accent-fg": "rgb(var(--accent-fg) / <alpha-value>)",
        brand: "rgb(var(--brand-rgb) / <alpha-value>)",
        "brand-fg": "rgb(var(--brand-fg) / <alpha-value>)",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Text",
          "SF Pro Display",
          "Inter",
          "Segoe UI Variable",
          "Segoe UI",
          "Roboto",
          "system-ui",
          "sans-serif",
        ],
        mono: ["SF Mono", "ui-monospace", "Cascadia Mono", "Menlo", "monospace"],
      },
      fontSize: {
        // iOS type ramp
        caption2: ["11px", { lineHeight: "13px", letterSpacing: "0.06px" }],
        caption: ["12px", { lineHeight: "16px", letterSpacing: "0px" }],
        footnote: ["13px", { lineHeight: "18px", letterSpacing: "-0.08px" }],
        subhead: ["15px", { lineHeight: "20px", letterSpacing: "-0.24px" }],
        body: ["17px", { lineHeight: "22px", letterSpacing: "-0.41px" }],
        headline: ["17px", { lineHeight: "22px", letterSpacing: "-0.41px", fontWeight: "600" }],
        title3: ["20px", { lineHeight: "25px", letterSpacing: "0.38px" }],
        title2: ["22px", { lineHeight: "28px", letterSpacing: "0.35px" }],
        title1: ["28px", { lineHeight: "34px", letterSpacing: "0.36px" }],
        largetitle: ["34px", { lineHeight: "41px", letterSpacing: "0.37px" }],
      },
      borderRadius: {
        ios: "10px",
        card: "16px",
        xl2: "20px",
        sheet: "24px",
        continuous: "28px",
      },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / 0.04), 0 4px 16px -4px rgb(0 0 0 / 0.06)",
        "card-dark": "0 1px 2px rgb(0 0 0 / 0.4), 0 4px 16px -4px rgb(0 0 0 / 0.3)",
        sheet: "0 -8px 40px -8px rgb(0 0 0 / 0.18)",
        pill: "0 3px 8px rgb(0 0 0 / 0.10), 0 1px 1px rgb(0 0 0 / 0.04)",
      },
      backdropBlur: {
        ios: "20px",
        heavy: "30px",
      },
      transitionTimingFunction: {
        ios: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
      keyframes: {
        "sheet-in": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        "sheet-in": "sheet-in 0.4s cubic-bezier(0.32, 0.72, 0, 1)",
        shimmer: "shimmer 1.6s infinite",
        "fade-in": "fade-in 0.2s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
