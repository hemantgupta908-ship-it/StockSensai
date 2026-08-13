/**
 * Strategy smoke test.
 *
 * Builds bundles straight from the seed generator (bypassing the server-only
 * provider registry) and runs all 15 strategies over the full universe at each
 * risk tolerance. Use it to sanity-check that the screens actually fire — and,
 * just as importantly, that they don't fire on everything.
 *
 *   npx tsx scripts/smoke-strategies.ts
 */
import { SEED_INSTRUMENTS } from "@/lib/market-data/seed/instruments";
import {
  generateBenchmarkCandles,
  generateDailyCandles,
  generateFundamentals,
  generateIntradayCandles,
} from "@/lib/market-data/seed/generate";
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

for (const tolerance of tolerances) {
  const thresholds = THRESHOLD_PRESETS[tolerance];
  const counts = new Map<string, { bull: number; bear: number }>();

  for (const bundle of bundles) {
    for (const strategy of ALL_STRATEGIES) {
      const signal = strategy.evaluate({ bundle, thresholds });
      const entry = counts.get(strategy.id) ?? { bull: 0, bear: 0 };
      if (signal) {
        if (signal.direction === "bullish") entry.bull++;
        else entry.bear++;
      }
      counts.set(strategy.id, entry);
    }
  }

  console.log(`\n===== ${tolerance.toUpperCase()} — universe of ${bundles.length} =====`);
  for (const strategy of ALL_STRATEGIES) {
    const c = counts.get(strategy.id)!;
    const flag = c.bull + c.bear === 0 ? "   <-- NOTHING FIRED" : "";
    console.log(
      `${strategy.style.padEnd(11)} ${strategy.id.padEnd(34)} bull=${String(c.bull).padStart(2)} bear=${String(c.bear).padStart(2)}${flag}`,
    );
  }
}

const thresholds = THRESHOLD_PRESETS.moderate;
outer: for (const bundle of bundles) {
  for (const strategy of ALL_STRATEGIES) {
    const signal = strategy.evaluate({ bundle, thresholds });
    if (signal?.direction === "bullish" && signal.style === "swing") {
      console.log("\n===== SAMPLE SWING SIGNAL =====");
      console.log(JSON.stringify(signal, null, 2));
      break outer;
    }
  }
}
