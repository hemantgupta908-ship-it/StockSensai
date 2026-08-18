import type { Metadata, Viewport } from "next";
import "./globals.css";

import { ThemeProvider, themeInitScript } from "@/components/theme-provider";
import { PreferencesProvider } from "@/components/preferences-provider";
import { IconProvider } from "@/components/icon-provider";
import { NativeShell } from "@/components/mobile/native-shell";
import { getCspNonce, getInitialRiskTolerance } from "@/lib/request-context";

export const metadata: Metadata = {
  title: {
    default: "WealthSensei — Indian stock screener",
    template: "%s · WealthSensei",
  },
  description:
    "Rule-based screens for NSE and BSE listed stocks across intraday, short-term, swing, positional and long-term styles. An educational screener, not investment advice.",
  applicationName: "WealthSensei",
  appleWebApp: { capable: true, title: "WealthSensei", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: "/icon.svg",
    // iOS ignores the manifest and reads this link, and it does not accept SVG
    // — pointing it at icon.svg meant a home-screen shortcut got a blank tile.
    apple: "/apple-icon-180.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2F2F7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const riskTolerance = await getInitialRiskTolerance();
  // Set by the middleware, which owns the Content-Security-Policy. Undefined on
  // any path the middleware does not match, where there is no policy to satisfy.
  const nonce = await getCspNonce();

  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        {/* Applies the theme class before first paint to avoid a light flash.
            Nonced because the CSP admits no inline script without one — without
            this the page renders light, then snaps to dark on hydration.

            `suppressHydrationWarning` because React deliberately does not carry
            the nonce into the client tree — it reads `nonce=""` there and warns
            about a mismatch it will not patch. The script has already run by
            then, so the difference is in the warning only. */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body className="min-h-dvh antialiased">
        <ThemeProvider>
          <IconProvider>
            <PreferencesProvider initialRiskTolerance={riskTolerance}>
              {/* Hardware back button, status-bar tinting, splash dismissal and
                  external-link handling. Renders nothing, and is inert outside
                  the Android build. */}
              <NativeShell />
              {children}
            </PreferencesProvider>
          </IconProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
