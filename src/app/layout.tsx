import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";

import { ThemeProvider, themeInitScript } from "@/components/theme-provider";
import { PreferencesProvider } from "@/components/preferences-provider";
import { IconProvider } from "@/components/icon-provider";
import { parseRiskTolerance, RISK_COOKIE } from "@/lib/preferences";

export const metadata: Metadata = {
  title: {
    default: "StockSensei — Indian stock screener",
    template: "%s · StockSensei",
  },
  description:
    "Rule-based screens for NSE and BSE listed stocks across intraday, short-term, swing, positional and long-term styles. An educational screener, not investment advice.",
  applicationName: "StockSensei",
  appleWebApp: { capable: true, title: "StockSensei", statusBarStyle: "default" },
  formatDetection: { telephone: false },
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
  const cookieStore = await cookies();
  const riskTolerance = parseRiskTolerance(cookieStore.get(RISK_COOKIE)?.value);

  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        {/* Applies the theme class before first paint to avoid a light flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        <ThemeProvider>
          <IconProvider>
            <PreferencesProvider initialRiskTolerance={riskTolerance}>
              {children}
            </PreferencesProvider>
          </IconProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
