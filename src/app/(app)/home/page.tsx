import type { Metadata } from "next";

import { NavBar } from "@/components/ui/nav-bar";
import { RecommendationFeed } from "@/components/recommendations/recommendation-feed";

export const metadata: Metadata = {
  title: "Ideas",
  description:
    "Rule-based stock screens across swing, short-term and long-term trading styles for NSE and BSE listed companies.",
};

export default function HomePage() {
  return (
    <>
      <NavBar
        title="Ideas"
        largeTitle
        width="fluid"
        subtitle="Rule-based screens across NSE & BSE"
      />
      <main className="pb-2">
        <RecommendationFeed />
      </main>
    </>
  );
}
