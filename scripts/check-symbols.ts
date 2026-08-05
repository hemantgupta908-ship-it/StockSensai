/**
 * Symbol validation for the curated universe.
 *
 * A renamed or wrong ticker fails silently: the chart fetch 404s, the bundle is
 * dropped, and the instrument just stops appearing in every screen. Nothing
 * crashes and no test goes red — the feed simply says "8 of 66 screened" when
 * the universe holds 68, which nobody reads as a bug.
 *
 * This walks the whole universe through the provider's own `toYahooSymbol`, so
 * overrides are exercised exactly as the app applies them, and reports anything
 * that does not resolve.
 *
 *   npx tsx scripts/check-symbols.ts
 *
 * Exits non-zero when a symbol fails, so it can gate a release.
 */
import { SEED_INSTRUMENTS } from "@/lib/market-data/seed/instruments";
import { toYahooSymbol } from "@/lib/market-data/yahoo-symbols";

const CHART = "https://query1.finance.yahoo.com/v8/finance/chart";
/** Well under Yahoo's tolerance; the whole run still finishes in ~30 seconds. */
const DELAY_MS = 120;

interface Result {
  ticker: string;
  symbol: string;
  status: number;
  overridden: boolean;
  name?: string;
}

async function check(ticker: string, exchange: string): Promise<Result> {
  const symbol = toYahooSymbol(ticker, exchange);
  const overridden = symbol !== `${ticker}${exchange === "BSE" ? ".BO" : ".NS"}`;

  try {
    const response = await fetch(`${CHART}/${symbol}?range=5d&interval=1d`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!response.ok) return { ticker, symbol, status: response.status, overridden };

    const body = (await response.json()) as {
      chart?: { result?: { meta?: { shortName?: string; longName?: string } }[] };
    };
    const meta = body.chart?.result?.[0]?.meta;
    return {
      ticker,
      symbol,
      status: 200,
      overridden,
      name: meta?.longName ?? meta?.shortName,
    };
  } catch (error) {
    console.error(`  ${ticker}: ${(error as Error).message}`);
    return { ticker, symbol, status: 0, overridden };
  }
}

async function main() {
  console.log(`Checking ${SEED_INSTRUMENTS.length} symbols against Yahoo…\n`);

  const results: Result[] = [];
  for (const instrument of SEED_INSTRUMENTS) {
    results.push(await check(instrument.ticker, instrument.exchange));
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }

  const failed = results.filter((r) => r.status !== 200);
  const overridden = results.filter((r) => r.overridden && r.status === 200);

  if (overridden.length > 0) {
    console.log("Resolved via SYMBOL_OVERRIDES:");
    for (const r of overridden) {
      console.log(`  ${r.ticker.padEnd(12)} -> ${r.symbol.padEnd(14)} ${r.name ?? ""}`);
    }
    console.log();
  }

  if (failed.length === 0) {
    console.log(`All ${results.length} symbols resolve.`);
    return;
  }

  console.error(`${failed.length} symbol(s) do NOT resolve:\n`);
  for (const r of failed) {
    console.error(
      `  ${r.ticker.padEnd(12)} -> ${r.symbol.padEnd(14)} HTTP ${r.status || "network error"}`,
    );
  }
  console.error(
    "\nEach of these is silently missing from every live screen. Fix by adding a\n" +
      "SYMBOL_OVERRIDES entry in src/lib/market-data/yahoo-provider.ts (for a rename\n" +
      "where the universe should keep the familiar name), or by correcting the ticker\n" +
      "in src/lib/market-data/seed/instruments.ts (for a symbol that is simply wrong).",
  );
  process.exitCode = 1;
}

void main();
