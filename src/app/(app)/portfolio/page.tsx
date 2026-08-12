import type { Metadata } from "next";

import { PortfolioView } from "@/components/portfolio/portfolio-view";

export const metadata: Metadata = {
  title: "Portfolio",
  description:
    "Log the positions you actually took and track them against the original recommendation.",
};

export default function PortfolioPage() {
  return (
    <main>
      <PortfolioView />
    </main>
  );
}
