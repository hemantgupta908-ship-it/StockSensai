/**
 * Download and cache long-range daily history for the backtest.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/fetch-history.ts
 *
 * Deliberately separate from `YahooMarketDataProvider`, which requests two
 * years of daily bars — the right window for a screen, far too short to measure
 * a strategy against. This asks for ten and writes the result to disk, so the
 * walk-forward can be re-run as often as needed without touching the network.
 *
 * Only daily bars are stored. Weekly and monthly series are *derived* from them
 * at backtest time rather than fetched: a separately fetched weekly bar is
 * stamped with the start of its week, so a naive "bars up to today" filter
 * hands the strategy a week that has not finished yet. Deriving them from the
 * same daily array makes that class of lookahead impossible to express.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Candle } from "@/lib/market-data/types";
import { SEED_INSTRUMENTS } from "@/lib/market-data/seed/instruments";
import { toYahooSymbol } from "@/lib/market-data/yahoo-symbols";

export {};

const CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const BENCHMARK_SYMBOL = "^NSEI";
const OUT_DIR = resolve("data/history");
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Concurrent downloads. Matches the provider's measured sweet spot. */
const CONCURRENCY = 8;
const RANGE = "10y";

interface YahooChart {
  chart?: {
    result?: {
      timestamp?: number[];
      indicators?: {
        quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[];
      };
    }[];
  };
}

async function fetchDaily(symbol: string): Promise<Candle[]> {
  const url =
    `${CHART_BASE}/${encodeURIComponent(symbol)}` +
    `?range=${RANGE}&interval=1d&events=div%2Csplit&includePrePost=false`;

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${symbol}: HTTP ${response.status}`);

  const payload = (await response.json()) as YahooChart;
  const result = payload.chart?.result?.[0];
  const stamps = result?.timestamp ?? [];
  const q = result?.indicators?.quote?.[0];
  if (!q) return [];

  const candles: Candle[] = [];
  for (let i = 0; i < stamps.length; i++) {
    const open = q.open?.[i];
    const high = q.high?.[i];
    const low = q.low?.[i];
    const close = q.close?.[i];
    // Yahoo pads non-trading days with nulls; a bar missing any leg is unusable.
    if (open == null || high == null || low == null || close == null) continue;
    if (!Number.isFinite(open) || !Number.isFinite(close)) continue;
    candles.push({
      time: stamps[i],
      open,
      high,
      low,
      close,
      volume: Number(q.volume?.[i] ?? 0),
    });
  }
  // Yahoo returns oldest-first already; sorting makes that a guarantee rather
  // than an assumption, because every downstream index depends on it.
  return candles.sort((a, b) => a.time - b.time);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const force = process.argv.includes("--force");

  const targets = [
    { ticker: "NIFTY50", symbol: BENCHMARK_SYMBOL },
    ...SEED_INSTRUMENTS.map((i) => ({
      ticker: i.ticker,
      symbol: toYahooSymbol(i.ticker, i.exchange),
    })),
  ];

  let done = 0;
  let skipped = 0;
  let failed = 0;
  const failures: string[] = [];

  async function worker(queue: typeof targets) {
    for (;;) {
      const target = queue.shift();
      if (!target) return;

      const path = resolve(OUT_DIR, `${target.ticker}.json`);
      if (!force && existsSync(path)) {
        skipped++;
        continue;
      }

      try {
        const candles = await fetchDaily(target.symbol);
        if (candles.length === 0) throw new Error("no usable bars");
        writeFileSync(path, JSON.stringify(candles), "utf8");
        done++;
      } catch (error) {
        failed++;
        failures.push(`${target.ticker}: ${error instanceof Error ? error.message : error}`);
      }

      if ((done + skipped + failed) % 25 === 0) {
        console.log(`  ${done + skipped + failed}/${targets.length}…`);
      }
    }
  }

  const queue = [...targets];
  const started = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

  console.log(
    `\nfetched ${done}, cached ${skipped}, failed ${failed} ` +
      `in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
  if (failures.length > 0) {
    console.log("\nfailures:");
    for (const f of failures.slice(0, 20)) console.log(`  ${f}`);
  }

  // Report the usable span, which bounds how far the backtest can reach.
  const benchPath = resolve(OUT_DIR, "NIFTY50.json");
  if (existsSync(benchPath)) {
    const bench = JSON.parse(readFileSync(benchPath, "utf8")) as Candle[];
    const first = new Date(bench[0].time * 1000).toISOString().slice(0, 10);
    const last = new Date(bench[bench.length - 1].time * 1000).toISOString().slice(0, 10);
    console.log(`\nbenchmark span: ${first} → ${last} (${bench.length} sessions)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
