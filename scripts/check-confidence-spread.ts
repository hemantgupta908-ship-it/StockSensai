/**
 * Confidence must depend on the strategy, not only on the stock.
 *
 * Guards a specific regression: when the confidence score is computed purely
 * from a per-stock feature vector, all fifteen strategies return the identical
 * number for a given stock. Everything downstream still typechecks and the feed
 * still renders — but the ranking becomes an arbitrary tiebreak, and
 * `minConfidence` silently turns into a per-stock filter that admits or rejects
 * a stock's whole slate at once rather than judging setup quality.
 *
 * The feed cannot show this, because it dedupes by ticker. This has to run at
 * the signal level.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/check-confidence-spread.ts
 */
// Must be set before anything imports `@/lib/env`, which reads it once at
// module-evaluation time — hence the dynamic imports below.
process.env.MARKET_DATA_PROVIDER = process.env.MARKET_DATA_PROVIDER ?? "mock";

export {};

/** Below this share of multi-signal stocks showing varied scores, fail. */
const MIN_SPREAD_RATIO = 0.5;

async function main() {
  const { getUniverseBundles } = await import("@/lib/market-data");
  const { evaluateAllStrategies } = await import("@/lib/engine/recommend");
  const { extractFeatures } = await import("@/lib/engine/features");

  const bundles = await getUniverseBundles();

  let multiSignalStocks = 0;
  let stocksWithSpread = 0;
  let featurelessStocks = 0;
  const samples: string[] = [];

  for (const bundle of bundles) {
    if (extractFeatures(bundle) === null) featurelessStocks++;

    const signals = evaluateAllStrategies(bundle, "moderate");
    if (signals.length < 2) continue;

    multiSignalStocks++;
    const distinct = new Set(signals.map((s) => s.confidence));
    if (distinct.size > 1) stocksWithSpread++;

    if (samples.length < 8) {
      samples.push(
        `  ${bundle.instrument.ticker.padEnd(14)}` +
          signals.map((s) => `${s.strategyId}=${s.confidence}`).join("  "),
      );
    }
  }

  console.log(`universe                        : ${bundles.length}`);
  console.log(`below the ${"50"}-bar feature minimum  : ${featurelessStocks}`);
  console.log(`stocks firing 2+ strategies     : ${multiSignalStocks}`);
  console.log(`...of those, with varied scores : ${stocksWithSpread}`);
  console.log(`\nsamples:`);
  for (const s of samples) console.log(s);

  if (multiSignalStocks === 0) {
    console.log(
      "\nINCONCLUSIVE: no stock fired more than one strategy, so per-stock " +
        "collapse cannot be distinguished from genuine agreement.",
    );
    return;
  }

  const ratio = stocksWithSpread / multiSignalStocks;
  if (ratio < MIN_SPREAD_RATIO) {
    console.log(
      `\nFAILED: only ${(ratio * 100).toFixed(0)}% of multi-signal stocks show ` +
        `differing confidence across strategies (need ${MIN_SPREAD_RATIO * 100}%). ` +
        `Confidence has likely collapsed onto a per-stock score.`,
    );
    process.exit(1);
  }

  console.log(
    `\nOK: ${(ratio * 100).toFixed(0)}% of multi-signal stocks score their ` +
      `strategies differently.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
