/**
 * Signal geometry check against live Yahoo data.
 *
 * The seeded counterpart (`check-geometry.ts`) is exhaustive but synthetic. This
 * one hits the network so the bands are built from the same prices the app
 * serves when MARKET_DATA_PROVIDER=yahoo, which is where an in-band stop was
 * first observed. Slow, and fails if Yahoo is unreachable.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/check-geometry-yahoo.ts
 */
process.env.MARKET_DATA_PROVIDER = "yahoo";

import { YahooMarketDataProvider } from "@/lib/market-data/yahoo-provider";
import { ALL_STRATEGIES } from "@/lib/strategies";
import { THRESHOLD_PRESETS, type RiskTolerance } from "@/lib/strategies/types";
import type { StockDataBundle } from "@/lib/market-data/types";

const provider = new YahooMarketDataProvider();

async function main() {
  const instruments = await provider.listInstruments();
  const benchmarkDaily = await provider.getBenchmarkCandles(300);
  console.log(`Universe: ${instruments.length} instruments, NIFTY ${benchmarkDaily.length} bars\n`);

  const bundles: StockDataBundle[] = [];
  for (const instrument of instruments) {
    const [quote, daily, intraday, fundamentals] = await Promise.all([
      provider.getQuote(instrument.ticker),
      provider.getCandles({ ticker: instrument.ticker, interval: "1d", limit: 300 }),
      provider.getCandles({ ticker: instrument.ticker, interval: "5m", limit: 225 }),
      provider.getFundamentals(instrument.ticker),
    ]);
    if (!quote || daily.length < 60) continue;
    bundles.push({ instrument, quote, daily, intraday, fundamentals, benchmarkDaily });
  }
  console.log(`Bundles built: ${bundles.length}\n`);

  const tolerances: RiskTolerance[] = ["conservative", "moderate", "aggressive"];
  let checked = 0;
  const violations: string[] = [];
  const ltValueByTolerance: Record<string, string[]> = {};

  for (const tolerance of tolerances) {
    const thresholds = THRESHOLD_PRESETS[tolerance];
    ltValueByTolerance[tolerance] = [];

    for (const strategy of ALL_STRATEGIES) {
      for (const bundle of bundles) {
        const signal = strategy.evaluate({ bundle, thresholds });
        if (!signal) continue;
        checked += 1;

        const { entry, target, stopLoss, direction } = signal;
        const where = `${tolerance}/${strategy.id}/${signal.ticker}`;
        const bands = `entry ${entry.low}–${entry.high} | target ${target.low}–${target.high} | stop ${stopLoss}`;

        if (strategy.id === "lt-value") {
          ltValueByTolerance[tolerance].push(
            `${signal.ticker} buy ${entry.low}–${entry.high} sell ${target.low}–${target.high} stop ${stopLoss}`,
          );
        }

        if (direction === "bullish") {
          if (stopLoss >= entry.low) violations.push(`${where}: stop inside entry band — ${bands}`);
          if (target.low <= entry.high) violations.push(`${where}: target overlaps entry — ${bands}`);
        } else {
          if (stopLoss <= entry.high) violations.push(`${where}: stop inside entry band — ${bands}`);
          if (target.high >= entry.low) violations.push(`${where}: target overlaps entry — ${bands}`);
        }
      }
    }
  }

  console.log(`Checked ${checked} live signals across ${ALL_STRATEGIES.length} strategies × ${tolerances.length} tolerances.`);
  if (violations.length > 0) {
    console.log(`\n${violations.length} GEOMETRY VIOLATION(S):`);
    for (const v of violations) console.log(`  ${v}`);
  } else {
    console.log("No geometry violations.");
  }

  for (const t of tolerances) {
    console.log(`\n--- lt-value @ ${t} (${ltValueByTolerance[t].length} signals) ---`);
    for (const s of ltValueByTolerance[t]) console.log(`  ${s}`);
  }

  process.exit(violations.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
