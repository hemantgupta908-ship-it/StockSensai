/**
 * Where do the cross-based swing screens actually stop?
 *
 * They return nothing at every tolerance, which a lookback window alone does
 * not explain. This walks the same gates in the same order and counts survivors
 * at each, so the blocking one is visible rather than guessed at.
 *
 *   MARKET_DATA_PROVIDER=yahoo npx tsx --tsconfig scripts/tsconfig.json \
 *     scripts/diagnose-swing-gates.ts
 */
process.env.MARKET_DATA_PROVIDER = process.env.MARKET_DATA_PROVIDER ?? "mock";

// Marks this file as a module. Without it TypeScript treats the script as
// global scope and `main` collides with the other scripts in this directory.
export {};

async function main() {
  const { getUniverseBundles } = await import("@/lib/market-data");
  const { closes, ema, rsi, macd, crossedAbove, crossedAboveLevel, last, at } = await import(
    "@/lib/indicators"
  );
  const { THRESHOLD_PRESETS, eventWindow } = await import("@/lib/strategies/types");

  const bundles = await getUniverseBundles();
  const thresholds = THRESHOLD_PRESETS.aggressive;

  const counters = {
    total: 0,
    enoughHistory: 0,
    emaCross: 0,
    macdCross: 0,
    rsiCross: 0,
    marketUptrend: 0,
    rsUptrend: 0,
    emaCrossAndMarket: 0,
    macdCrossAndMarket: 0,
  };

  for (const bundle of bundles) {
    counters.total++;
    const { daily, benchmarkDaily, quote } = bundle;
    if (daily.length < 80 || benchmarkDaily.length < 50) continue;
    counters.enoughHistory++;

    const price = closes(daily);
    const ema20 = ema(price, 20);
    const ema50 = ema(price, 50);
    const rsi14 = rsi(price, 14);
    const { macd: macdLine, signal } = macd(price, 12, 26, 9);

    const emaCross = crossedAbove(ema20, ema50, eventWindow(thresholds, 5)) >= 0;
    const macdCross = crossedAbove(macdLine, signal, eventWindow(thresholds, 4)) >= 0;
    const rsiCross =
      crossedAboveLevel(rsi14, thresholds.rsiOversold, eventWindow(thresholds, 3)) >= 0;

    if (emaCross) counters.emaCross++;
    if (macdCross) counters.macdCross++;
    if (rsiCross) counters.rsiCross++;

    // The two conditions both cross screens mark `required`.
    const benchmarkPrice = closes(benchmarkDaily);
    const benchEma50 = last(ema(benchmarkPrice, 50));
    const benchNow = last(benchmarkPrice);
    const marketUptrend = benchNow > benchEma50;
    if (marketUptrend) counters.marketUptrend++;

    const stockThen = at(closes(daily), 20);
    const benchThen = at(benchmarkPrice, 20);
    const rsUptrend =
      Number.isFinite(stockThen) && Number.isFinite(benchThen)
        ? quote.price / benchNow > stockThen / benchThen
        : true;
    if (rsUptrend) counters.rsUptrend++;

    if (emaCross && marketUptrend && rsUptrend) counters.emaCrossAndMarket++;
    if (macdCross && marketUptrend && rsUptrend) counters.macdCrossAndMarket++;
  }

  console.log(`(at AGGRESSIVE tolerance — the widest windows)\n`);
  for (const [k, v] of Object.entries(counters)) {
    console.log(`  ${k.padEnd(22)} ${v}`);
  }

  console.log(
    `\nmarket uptrend is a REQUIRED condition on both cross screens: ` +
      `${counters.marketUptrend === 0 ? "FAILING FOR EVERY STOCK" : "passing for some"}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
