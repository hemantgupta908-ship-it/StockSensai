/**
 * Signal geometry check.
 *
 * Bands are zones, not ticks, so every price inside an entry band has to be on
 * the correct side of both the stop and the target band. `rewardToRisk` works
 * from midpoints and cannot see a violation: a stop sitting inside the entry
 * band still leaves midpoint risk positive, so the card reports a healthy ratio
 * while a fill in the lower half of the band is stopped out on entry.
 *
 * Runs every strategy over the seed universe at all three tolerances and
 * asserts, per emitted signal:
 *
 *   bullish   stopLoss < entry.low   and   target.low  > entry.high
 *   bearish   stopLoss > entry.high  and   target.high < entry.low
 *
 *   npx tsx scripts/check-geometry.ts
 */
import { SEED_INSTRUMENTS } from "@/lib/market-data/seed/instruments";
import {
  generateBenchmarkCandles,
  generateDailyCandles,
  generateFundamentals,
  generateIntradayCandles,
} from "@/lib/market-data/seed/generate";
import { lowestLow } from "@/lib/indicators";
import { ALL_STRATEGIES } from "@/lib/strategies";
import { THRESHOLD_PRESETS, type RiskTolerance } from "@/lib/strategies/types";
import type { StockDataBundle } from "@/lib/market-data/types";

const benchmark = generateBenchmarkCandles(320);

const bundles: StockDataBundle[] = SEED_INSTRUMENTS.map((seed) => {
  const daily = generateDailyCandles(seed, 320);
  const intraday = generateIntradayCandles(seed, daily, 3);
  const lastBar = daily[daily.length - 1];
  const prevBar = daily[daily.length - 2];
  const w52 = daily.slice(-250);
  const { sim, ...instrument } = seed;
  void sim;

  return {
    instrument,
    quote: {
      ticker: seed.ticker,
      exchange: seed.exchange,
      price: lastBar.close,
      change: lastBar.close - prevBar.close,
      changePercent: ((lastBar.close - prevBar.close) / prevBar.close) * 100,
      open: lastBar.open,
      high: lastBar.high,
      low: lastBar.low,
      prevClose: prevBar.close,
      volume: lastBar.volume,
      week52High: Math.max(...w52.map((c) => c.high)),
      week52Low: Math.min(...w52.map((c) => c.low)),
      updatedAt: new Date(lastBar.time * 1000).toISOString(),
    },
    daily,
    weekly: daily.filter((_, i) => i % 5 === 0),
    monthly: daily.filter((_, i) => i % 21 === 0),
    intraday,
    fundamentals: generateFundamentals(seed, lastBar.close),
    benchmarkDaily: benchmark,
  };
});

const tolerances: RiskTolerance[] = ["conservative", "moderate", "aggressive"];

let checked = 0;
const violations: string[] = [];

for (const tolerance of tolerances) {
  const thresholds = THRESHOLD_PRESETS[tolerance];

  for (const strategy of ALL_STRATEGIES) {
    for (const bundle of bundles) {
      const signal = strategy.evaluate({ bundle, thresholds });
      if (!signal) continue;
      checked += 1;

      const { entry, target, stopLoss, direction } = signal;
      const where = `${tolerance}/${strategy.id}/${signal.ticker}`;
      const bands =
        `entry ${entry.low}–${entry.high} | target ${target.low}–${target.high} | stop ${stopLoss}`;

      if (direction === "bullish") {
        if (stopLoss >= entry.low) {
          violations.push(`${where}: stop inside/above entry band — ${bands}`);
        }
        if (target.low <= entry.high) {
          violations.push(`${where}: target band overlaps entry band — ${bands}`);
        }
      } else {
        if (stopLoss <= entry.high) {
          violations.push(`${where}: stop inside/below entry band — ${bands}`);
        }
        if (target.high >= entry.low) {
          violations.push(`${where}: target band overlaps entry band — ${bands}`);
        }
      }
    }
  }
}

console.log(`Checked ${checked} signals across ${ALL_STRATEGIES.length} strategies × ${tolerances.length} tolerances × ${bundles.length} instruments.`);

if (violations.length > 0) {
  console.log(`\n${violations.length} GEOMETRY VIOLATION(S):`);
  for (const v of violations) console.log(`  ${v}`);
} else {
  console.log("No geometry violations.");
}

// ---------------------------------------------------------------------------
// lt-value: which instruments the pre-fix stop construction would have broken.
//
// The old stop was max(price*0.82, lowestLow(daily,250)*0.97) with no relation
// to the entry band, so it landed inside the band whenever the 250-day low sat
// within ~3.1% of spot. Reported here so the fix's effect on signal count can
// be attributed rather than guessed at.
// ---------------------------------------------------------------------------
console.log("\n--- lt-value: instruments where the pre-fix stop fell inside the entry band ---");
for (const bundle of bundles) {
  const price = bundle.quote.price;
  const entryLow = price * 0.94;
  const rawStop = Math.max(price * 0.82, lowestLow(bundle.daily, 250) * 0.97);
  if (rawStop < entryLow) continue;

  const stillFires = tolerances.filter((t) => {
    const s = ALL_STRATEGIES.find((x) => x.id === "lt-value")!;
    return s.evaluate({ bundle, thresholds: THRESHOLD_PRESETS[t] }) !== null;
  });

  console.log(
    `  ${bundle.instrument.ticker.padEnd(14)} spot ${price.toFixed(2).padStart(9)} ` +
      `entry.low ${entryLow.toFixed(2).padStart(9)} raw stop ${rawStop.toFixed(2).padStart(9)} ` +
      `(${(((rawStop - entryLow) / entryLow) * 100).toFixed(2)}% inside) ` +
      `— after fix fires at: ${stillFires.length ? stillFires.join(", ") : "none"}`,
  );
}

process.exit(violations.length > 0 ? 1 : 0);
