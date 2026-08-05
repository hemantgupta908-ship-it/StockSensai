import type { Metadata } from "next";

import { NavBar } from "@/components/ui/nav-bar";
import { RecommendationFeed } from "@/components/recommendations/recommendation-feed";

export const metadata: Metadata = {
  title: "Ideas",
  description:
    "Rule-based stock screens across intraday, short-term, swing, positional and long-term trading styles for NSE and BSE listed companies.",
};

export default function HomePage() {
  return (
    <>
      {/* No title: the trading-style tabs directly below already say what this
          screen is, so a heading would only repeat them. */}
      <NavBar width="fluid" />
      <main className="pb-2">
        <RecommendationFeed />
      </main>
    </>
  );
}
