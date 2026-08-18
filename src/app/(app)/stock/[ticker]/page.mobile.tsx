import { Suspense } from "react";

import { SEED_INSTRUMENTS } from "@/lib/market-data/seed/instruments";
import { StockDetailLoader } from "@/components/stock/stock-detail-loader";

/**
 * The stock detail screen, as bundled into the APK.
 *
 * A static export has to know its dynamic segments at build time, so one HTML
 * shell is emitted per instrument in the universe. They are shells only — the
 * analysis is resolved at runtime by `StockDetailLoader` — so this costs a few
 * hundred near-identical files and no stale market data. Baking the analysis in
 * would ship prices frozen at build time, which is the one thing a screener
 * must never do.
 */
export function generateStaticParams() {
  return SEED_INSTRUMENTS.map((instrument) => ({ ticker: instrument.ticker }));
}

export default function StockPage() {
  return (
    // `useSearchParams` suspends during prerender; without a boundary the whole
    // route opts out of static generation, which an export cannot allow.
    <Suspense fallback={null}>
      <StockDetailLoader />
    </Suspense>
  );
}
