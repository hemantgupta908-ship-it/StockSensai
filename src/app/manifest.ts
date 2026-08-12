import type { MetadataRoute } from "next";

/**
 * Web app manifest.
 *
 * Beyond making the site installable, this is the foundation for shipping to
 * Android later: a Trusted Web Activity (Bubblewrap) or a Capacitor shell both
 * read this file for the app's identity, icons and display mode. Getting it
 * right now costs nothing and avoids reworking it at packaging time.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WealthSensei — NSE & BSE stock screener",
    short_name: "WealthSensei",
    description:
      "Rule-based screens for Indian stocks across intraday, short-term, swing, positional and long-term styles. An educational screener, not investment advice.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#000000",
    theme_color: "#000000",
    categories: ["finance", "education"],
    lang: "en-IN",
    dir: "ltr",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Ideas", url: "/home", description: "Today's screened ideas" },
      { name: "Watchlist", url: "/watchlist", description: "Stocks you're following" },
      { name: "Portfolio", url: "/portfolio", description: "Positions you've logged" },
    ],
  };
}
