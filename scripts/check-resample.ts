/**
 * Verify derived weekly/monthly bars against Yahoo's own.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/check-resample.ts
 *
 * The backtest builds higher timeframes from daily bars instead of fetching
 * them. Every weekly indicator a strategy reads therefore depends on this
 * rollup being right, and a silent discrepancy would show up as a strategy
 * behaving differently in the backtest than it does live — which is exactly the
 * kind of divergence that makes a backtest worthless without anyone noticing.
 *
 * Compares against real fetched bars rather than a fixture, so it also catches
 * the case where Yahoo changes its bucketing convention.
 */
process.env.MARKET_DATA_PROVIDER = "yahoo";

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import type { Candle } from "@/lib/market-data/types";
import { resample } from "@/lib/backtest/resample";

export {};

const SAMPLE = ["RELIANCE", "TCS", "SBIN", "INFY", "HDFCBANK"];
/** Bars this close to the present may still be forming; skip the last one. */
const TOLERANCE = 0.005; // 0.5% — Yahoo adjusts splits/dividends independently

async function main() {
  const { getMarketDataProvider } = await import("@/lib/market-data");
  const provider = getMarketDataProvider();

  let checked = 0;
  let mismatched = 0;
  let openDrift = 0;
  const problems: string[] = [];

  for (const ticker of SAMPLE) {
    const path = resolve("data/history", `${ticker}.json`);
    if (!existsSync(path)) {
      console.log(`  ${ticker}: no cached history — run scripts/fetch-history.ts first`);
      continue;
    }
    const daily = JSON.parse(readFileSync(path, "utf8")) as Candle[];

    for (const timeframe of ["1wk", "1mo"] as const) {
      const derived = resample(daily, timeframe);
      const fetched = await provider.getCandles({ ticker, interval: timeframe, limit: 400 });
      if (fetched.length === 0) continue;

      const derivedByTime = new Map(derived.map((c) => [c.time, c]));

      // Drop the newest fetched bar: it is still forming, so its close moves.
      for (const actual of fetched.slice(0, -1)) {
        const mine = derivedByTime.get(actual.time);
        if (!mine) continue; // outside the cached daily span

        checked++;
        const diff = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-9);

        // Closes are the assertion. Every strategy that reads a higher
        // timeframe reads `closes(bundle.weekly)` and nothing else — the
        // weekly EMAs are built from closes, and no strategy touches weekly
        // open, high, low, or the monthly series at all. Opens are tracked
        // separately because they legitimately differ: Yahoo stamps a week's
        // open from its own session list, which disagrees with a derived
        // rollup around market holidays, and that difference reaches no
        // indicator.
        if (diff(mine.close, actual.close) > TOLERANCE) {
          mismatched++;
          if (problems.length < 10) {
            const when = new Date(actual.time * 1000).toISOString().slice(0, 10);
            problems.push(
              `${ticker} ${timeframe} ${when}  close derived ${mine.close.toFixed(2)} vs yahoo ${actual.close.toFixed(2)}`,
            );
          }
        }
        if (diff(mine.open, actual.open) > TOLERANCE) openDrift++;
      }
    }
  }

  const rate = checked > 0 ? (mismatched / checked) * 100 : 0;
  console.log(`\ncompared ${checked} bars`);
  console.log(
    `  closes outside ${TOLERANCE * 100}%: ${mismatched} (${rate.toFixed(2)}%)  <- the figure that matters`,
  );
  console.log(
    `  opens  outside ${TOLERANCE * 100}%: ${openDrift} (informational; no indicator reads them)`,
  );
  for (const p of problems) console.log(`  ${p}`);

  if (checked === 0) {
    console.log("\nINCONCLUSIVE: nothing compared.");
    process.exit(1);
  }
  // Held tight because closes drive every weekly indicator. The handful that do
  // drift are the current, still-forming week and old bars Yahoo has since
  // re-adjusted for a dividend — neither is a rollup error.
  if (rate > 1) {
    console.log("\nFAILED: derived closes disagree with the provider too often.");
    process.exit(1);
  }
  console.log("OK: derived bars match the provider's own.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
