/**
 * Assert that a point-in-time bundle contains nothing from after its own date.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/check-lookahead.ts
 *
 * A backtest is only worth reading if the strategies could not see the future,
 * and lookahead does not announce itself: it throws no error, breaks no type,
 * and shows up only as unusually good results. This walks real bundles at real
 * dates and checks every series the strategies read.
 *
 * The subtle case it exists for is the rolled-up weekly bar. Deriving weekly
 * candles from the full daily history and slicing by timestamp yields, for any
 * mid-week date, a bar carrying that week's *closing* price — days that had not
 * happened yet. That passed every other check in this repo.
 */
process.env.MARKET_DATA_PROVIDER = "yahoo";

import { BENCHMARK_TICKER, bundleAt, loadDaily, loadHistory } from "@/lib/backtest/history";
import { resample } from "@/lib/backtest/resample";

export {};

const SAMPLE = ["RELIANCE", "TCS", "SBIN", "INFY", "HDFCBANK", "ITC"];
/** Dates to probe per stock, spread across the cached span. */
const PROBES = 40;

function main() {
  const benchmark = loadDaily(BENCHMARK_TICKER);
  if (!benchmark) {
    // The history cache is gitignored, so a fresh clone has none. Skipping is
    // right here — this check is about the backtest's honesty, and there is no
    // backtest to be dishonest about until someone fetches data.
    console.log("skipped: no cached history (run `npm run backtest:fetch`)");
    return;
  }

  let checked = 0;
  const violations: string[] = [];

  for (const ticker of SAMPLE) {
    const history = loadHistory(ticker);
    if (!history) {
      console.log(`  ${ticker}: no cached history`);
      continue;
    }

    const first = 300;
    const last = history.daily.length - 2;
    if (last <= first) continue;

    const stride = Math.max(1, Math.floor((last - first) / PROBES));

    for (let index = first; index <= last; index += stride) {
      const asOf = history.daily[index].time;
      const asOfLabel = new Date(asOf * 1000).toISOString().slice(0, 10);
      const bundle = bundleAt(history, index, benchmark);
      checked++;

      const note = (what: string, detail: string) =>
        violations.length < 15 && violations.push(`${ticker} @${asOfLabel} ${what}: ${detail}`);

      // 1. No series may carry a bar stamped after the as-of date.
      for (const [name, series] of [
        ["daily", bundle.daily],
        ["weekly", bundle.weekly],
        ["monthly", bundle.monthly],
        ["benchmark", bundle.benchmarkDaily],
      ] as const) {
        const future = series.filter((c) => c.time > asOf);
        if (future.length > 0) {
          note(name, `${future.length} bar(s) stamped after as-of`);
        }
      }

      // 2. The quote must be that session's own close, not a later one.
      if (bundle.quote.price !== history.daily[index].close) {
        note("quote.price", `${bundle.quote.price} vs close ${history.daily[index].close}`);
      }

      // 3. The 52-week extremes must not exceed the trailing window's own range.
      const from = Math.max(0, index - 249);
      let high = -Infinity;
      let low = Infinity;
      for (let i = from; i <= index; i++) {
        high = Math.max(high, history.daily[i].high);
        low = Math.min(low, history.daily[i].low);
      }
      if (bundle.quote.week52High > high) note("week52High", "exceeds trailing window");
      if (bundle.quote.week52Low < low) note("week52Low", "below trailing window");

      // 4. The decisive one: the newest weekly bar must equal a rollup of the
      //    sessions up to as-of, not of the whole calendar week.
      const truthful = resample(history.daily.slice(0, index + 1), "1wk");
      const expected = truthful[truthful.length - 1];
      const actual = bundle.weekly[bundle.weekly.length - 1];
      if (expected && actual) {
        if (actual.close !== expected.close) {
          note(
            "weekly close",
            `bundle ${actual.close} vs point-in-time ${expected.close} — LOOKAHEAD`,
          );
        }
        if (actual.high !== expected.high || actual.low !== expected.low) {
          note("weekly range", "in-progress bar rolled up beyond as-of");
        }
      }

      // 5. Same for monthly.
      const truthfulM = resample(history.daily.slice(0, index + 1), "1mo");
      const expectedM = truthfulM[truthfulM.length - 1];
      const actualM = bundle.monthly[bundle.monthly.length - 1];
      if (expectedM && actualM && actualM.close !== expectedM.close) {
        note("monthly close", `bundle ${actualM.close} vs point-in-time ${expectedM.close}`);
      }
    }
  }

  console.log(`\nprobed ${checked} point-in-time bundles across ${SAMPLE.length} stocks`);

  if (violations.length > 0) {
    console.log(`\n${violations.length} LOOKAHEAD VIOLATION(S):`);
    for (const v of violations) console.log(`  ${v}`);
    process.exit(1);
  }

  if (checked === 0) {
    console.log("skipped: no cached history for the sample tickers.");
    return;
  }

  console.log("OK: no bundle contained data from after its own date.");
}

main();
