/**
 * End-to-end check of the Yahoo provider against live data.
 *
 * Fetches the real universe, prints what came back, then runs all 15 strategies
 * over it. Unlike the mock smoke test this hits the network, so it is slow and
 * will fail if Yahoo is unreachable or has changed its response shape.
 *
 *   npx tsx scripts/smoke-yahoo.ts
 */
process.env.MARKET_DATA_PROVIDER = "yahoo";

import { YahooMarketDataProvider } from "@/lib/market-data/yahoo-provider";
import { ALL_STRATEGIES } from "@/lib/strategies";
import { THRESHOLD_PRESETS } from "@/lib/strategies/types";
import type { StockDataBundle } from "@/lib/market-data/types";

const provider = new YahooMarketDataProvider();

async function main() {
  const instruments = await provider.listInstruments();
  console.log(`Universe: ${instruments.length} instruments\n`);

  const benchmark = await provider.getBenchmarkCandles(300);
  console.log(
    `NIFTY 50: ${benchmark.length} bars, last close ${benchmark.at(-1)?.close ?? "—"}\n`,
  );

  const bundles: StockDataBundle[] = [];
  const problems: string[] = [];

  for (const instrument of instruments) {
    const [quote, daily, weekly, monthly, intraday, fundamentals] = await Promise.all([
      provider.getQuote(instrument.ticker),
      provider.getCandles({ ticker: instrument.ticker, interval: "1d", limit: 300 }),
      provider.getCandles({ ticker: instrument.ticker, interval: "1wk", limit: 150 }),
      provider.getCandles({ ticker: instrument.ticker, interval: "1mo", limit: 60 }),
      provider.getCandles({ ticker: instrument.ticker, interval: "5m", limit: 225 }),
      provider.getFundamentals(instrument.ticker),
    ]);

    if (!quote || daily.length < 60) {
      problems.push(`${instrument.ticker}: quote=${!!quote} daily=${daily.length}`);
      continue;
    }

    console.log(
      `${instrument.ticker.padEnd(11)} ₹${String(quote.price).padStart(9)} ` +
        `${(quote.changePercent >= 0 ? "+" : "") + quote.changePercent.toFixed(2)}%`.padStart(8) +
        ` | daily=${String(daily.length).padStart(3)} intra=${String(intraday.length).padStart(3)}` +
        ` | PE=${fundamentals ? fundamentals.peRatio.toFixed(1).padStart(6) : "  none"}` +
        ` RoE=${fundamentals && Number.isFinite(fundamentals.roe) ? fundamentals.roe.toFixed(1).padStart(5) : "   —"}` +
        ` D/E=${fundamentals && Number.isFinite(fundamentals.debtToEquity) ? fundamentals.debtToEquity.toFixed(2).padStart(5) : "   —"}` +
        ` div=${fundamentals ? fundamentals.dividendHistory.length : 0}y`,
    );

    bundles.push({ instrument, quote, daily, weekly, monthly, intraday, fundamentals, benchmarkDaily: benchmark });
  }

  if (problems.length) {
    console.log(`\nProblems (${problems.length}):`);
    problems.forEach((p) => console.log(`  ${p}`));
  }

  console.log(`\n===== STRATEGIES over ${bundles.length} live instruments =====`);
  const thresholds = THRESHOLD_PRESETS.moderate;
  for (const strategy of ALL_STRATEGIES) {
    let bull = 0;
    let bear = 0;
    for (const bundle of bundles) {
      try {
        const signal = strategy.evaluate({ bundle, thresholds });
        if (signal?.direction === "bullish") bull++;
        else if (signal) bear++;
      } catch (error) {
        console.error(`  ${strategy.id} threw on ${bundle.instrument.ticker}:`, error);
      }
    }
    console.log(
      `${strategy.style.padEnd(11)} ${strategy.id.padEnd(34)} bull=${String(bull).padStart(2)} bear=${String(bear).padStart(2)}` +
        (bull + bear === 0 ? "   <-- nothing fired" : ""),
    );
  }

  // Show one real signal end to end.
  outer: for (const bundle of bundles) {
    for (const strategy of ALL_STRATEGIES) {
      const signal = strategy.evaluate({ bundle, thresholds });
      if (signal?.direction === "bullish") {
        console.log("\n===== SAMPLE LIVE SIGNAL =====");
        console.log(`${signal.ticker} — ${strategy.name} (confidence ${signal.confidence})`);
        console.log(signal.reason);
        console.log(
          `entry ₹${signal.entry.low}–${signal.entry.high} | target ₹${signal.target.low}–${signal.target.high} | stop ₹${signal.stopLoss}`,
        );
        break outer;
      }
    }
  }
}

main().catch((error) => {
  console.error("FAILED:", error);
  process.exit(1);
});
