/**
 * Does the Android build's on-device engine actually fire?
 *
 * The mobile app screens in the WebView through `@/lib/mobile/device-engine`
 * rather than through the server's `generateFeed`. Both call the same
 * `buildFeed`, but they assemble their inputs separately — a different provider
 * construction, a different universe cache, an empty track-record map — and a
 * clean typecheck says nothing about whether the result contains any cards.
 * A silent empty feed is the exact failure this guards: the app would launch,
 * render, and show "no ideas today" forever.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/check-device-engine.ts
 */

import {
  deviceAnalyseStock,
  deviceFeed,
  deviceInstruments,
  deviceQuotes,
} from "@/lib/mobile/device-engine";
import { TRADING_STYLES, type RiskTolerance } from "@/lib/strategies/types";

const TOLERANCES: RiskTolerance[] = ["conservative", "moderate", "aggressive"];

async function main() {
  let failures = 0;

  console.log("universe");
  const started = Date.now();
  const first = await deviceFeed("swing", "moderate");
  console.log(
    `  ${first.universeSize} instruments screened in ${((Date.now() - started) / 1000).toFixed(1)}s ` +
      `(source: ${first.dataSource}, live: ${first.isLiveData})`,
  );
  if (first.universeSize === 0) {
    console.error("  FAIL: empty universe");
    failures++;
  }

  console.log("\nfeeds");
  for (const tolerance of TOLERANCES) {
    for (const style of TRADING_STYLES) {
      const feed = await deviceFeed(style, tolerance);
      const n = feed.recommendations.length;
      const strategies = new Set(feed.recommendations.map((r) => r.strategyId)).size;
      const status = n > 0 ? "ok  " : "EMPTY";
      console.log(
        `  ${status} ${tolerance.padEnd(12)} ${style.padEnd(12)} ${String(n).padStart(2)} cards, ` +
          `${strategies} strategies`,
      );
      // An empty feed for one combination is legitimate — conservative
      // thresholds on a quiet universe genuinely produce nothing — but every
      // card must be bullish and carry the levels the UI draws.
      for (const rec of feed.recommendations) {
        if (rec.direction !== "bullish") {
          console.error(`  FAIL: ${rec.id} is ${rec.direction}, not bullish`);
          failures++;
        }
        if (!(rec.buyRange.low > 0) || !(rec.sellRange.low > 0) || !(rec.stopLoss > 0)) {
          console.error(`  FAIL: ${rec.id} has a non-positive level`);
          failures++;
        }
      }
    }
  }

  const anyCards = (
    await Promise.all(
      TRADING_STYLES.map(async (s) => (await deviceFeed(s, "moderate")).recommendations.length),
    )
  ).reduce((a, b) => a + b, 0);
  if (anyCards === 0) {
    console.error("\nFAIL: not one card across every style at moderate tolerance");
    failures++;
  }

  console.log("\nstock detail");
  const ticker = first.recommendations[0]?.ticker ?? "RELIANCE";
  const analysis = await deviceAnalyseStock(ticker, "moderate");
  if (!analysis) {
    console.error(`  FAIL: no analysis for ${ticker}`);
    failures++;
  } else {
    console.log(
      `  ok   ${ticker}: ${analysis.bundle.daily.length} daily bars, ` +
        `${analysis.bullishSignals.length} bullish, ${analysis.bearishSignals.length} bearish, ` +
        `fundamentals ${analysis.bundle.fundamentals ? "present" : "absent"}`,
    );
    if (analysis.bundle.daily.length < 200) {
      console.error("  FAIL: fewer than 200 daily bars — the 200 EMA screens cannot fire");
      failures++;
    }
  }

  console.log("\nquotes and instruments");
  const quotes = await deviceQuotes([ticker, "TCS", "INFY"]);
  console.log(`  ok   ${quotes.length} quotes`);
  if (quotes.length === 0) {
    console.error("  FAIL: no quotes");
    failures++;
  }

  const instruments = await deviceInstruments([ticker, "TCS"]);
  const names = Object.keys(instruments);
  console.log(`  ok   ${names.length} instruments (${names.join(", ")})`);
  if (names.length === 0) {
    console.error("  FAIL: no instrument metadata");
    failures++;
  }

  console.log(failures === 0 ? "\nSEEDED PATH PASS" : `\nFAILED with ${failures} problem(s)`);
  // Only exit on failure — the live-path pass runs after this one.
  if (failures > 0) process.exit(1);
}


/**
 * Does the *live* path work?
 *
 * Appended as a second pass because the first one exercises the seeded provider
 * only. The bug this guards shipped twice: the engine read
 * `globalThis.Capacitor` to decide whether live data was possible, from inside a
 * Web Worker — the one context guaranteed not to have it — so it silently fell
 * back to simulated prices while every type checked and every test passed.
 *
 * `configureDevicePlatform` is the seam the worker now uses to inject a fetch
 * that proxies to the main thread. Here it is handed Node's own fetch, which
 * validates everything except the `postMessage` hop.
 */
async function checkLivePath() {
  const { configureDevicePlatform, deviceIsLive, deviceQuotes, deviceFeed } = await import(
    "@/lib/mobile/device-engine"
  );

  console.log("\nlive path (platform injected, isNative=true)");
  configureDevicePlatform({
    fetch: (url, init) => fetch(url, init as RequestInit),
    isNative: true,
  });

  const live = await deviceIsLive();
  console.log(`  provider reports isLive=${live}`);
  if (!live) {
    console.error("  FAIL: injected native platform still resolved to seeded data");
    process.exit(1);
  }

  const quotes = await deviceQuotes(["RELIANCE", "TCS", "HUDCO"]);
  for (const q of quotes) {
    console.log(`  ${q.ticker.padEnd(10)} ₹${q.price}`);
  }
  if (quotes.length === 0) {
    console.error("  FAIL: no live quotes");
    process.exit(1);
  }

  const feed = await deviceFeed("swing", "moderate", { force: true });
  console.log(
    `  feed: ${feed.recommendations.length} cards from ${feed.universeSize} instruments, ` +
      `source=${feed.dataSource} isLiveData=${feed.isLiveData}`,
  );
  if (!feed.isLiveData) {
    console.error("  FAIL: feed built from live provider but reports isLiveData=false");
    process.exit(1);
  }

  console.log("\nLIVE PATH PASS");
}

void main().then(() => checkLivePath());
