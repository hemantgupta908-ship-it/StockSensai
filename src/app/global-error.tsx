"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary, for errors thrown in the root layout itself.
 *
 * `error.tsx` sits *inside* the root layout, so it cannot catch a failure in
 * that layout — the theme script, a provider, the font setup. This one replaces
 * the whole document, which is why it has to render its own <html> and <body>
 * and cannot use any of the app's providers or Tailwind-themed tokens.
 *
 * Styling is inline for the same reason: if the layout failed, the stylesheet
 * may not have loaded either.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error]", error);
  }, [error]);

  return (
    <html lang="en-IN">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "#F2F2F7",
          color: "#000",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>
            WealthSensei couldn&apos;t start
          </h1>
          <p style={{ marginTop: 10, fontSize: 15, lineHeight: 1.5, color: "#3C3C43" }}>
            Something failed before the app finished loading. Your saved data has not been
            touched.
          </p>
          {error.digest ? (
            <p style={{ marginTop: 10, fontSize: 12, fontFamily: "monospace", color: "#6C6C70" }}>
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            onClick={reset}
            style={{
              marginTop: 22,
              height: 48,
              padding: "0 24px",
              border: 0,
              borderRadius: 14,
              background: "#007AFF",
              color: "#fff",
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
