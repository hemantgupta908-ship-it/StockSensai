import type { Metadata } from "next";

import { WatchlistView } from "@/components/watchlist/watchlist-view";

export const metadata: Metadata = {
  title: "Watchlist",
  description: "Stocks you've saved to follow.",
};

export default function WatchlistPage() {
  return (
    <main>
      <WatchlistView />
    </main>
  );
}
