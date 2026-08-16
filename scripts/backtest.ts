/**
 * Walk-forward backtest of the technical strategies.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/backtest.ts
 *   ... scripts/backtest.ts --tolerance=aggressive --years=5 --step=5
 *
 * Requires cached history: run `scripts/fetch-history.ts` first.
 *
 * Measures the ten swing and positional strategies. The five long-term ones are
 * excluded by construction — see `bundleAt` in `@/lib/backtest/history` for why
 * feeding them today's fundamentals would produce a number worth nothing.
 *
 * Read the output with its biases in mind; they are printed alongside it.
 */
process.env.MARKET_DATA_PROVIDER = "yahoo";

import type { Candle } from "@/lib/market-data/types";
import type { RiskTolerance, StrategySignal } from "@/lib/strategies/types";
import {
  BENCHMARK_TICKER,
  availableTickers,
  bundleAt,
  loadDaily,
  loadHistory,
} from "@/lib/backtest/history";
import {
  EXIT_MODES,
  poolTailStats,
  simulateTrade,
  summarise,
  type CostModel,
  type ExitMode,
  type Trade,
} from "@/lib/backtest/engine";

export {};

/**
 * Round-trip cost as a percentage of notional.
 *
 * Brokerage, STT, exchange charges, GST, stamp duty and a slippage allowance
 * for a retail-sized order in a liquid NSE name. Applied to every trade, so the
 * returns below are net. Gross figures would overstate a strategy whose edge is
 * a couple of percent per trade, which is most of them.
 */
const DEFAULT_COSTS: CostModel = { roundTripPct: 0.4 };

/** Sessions of history a strategy needs before its first honest evaluation. */
const WARMUP_SESSIONS = 260;

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

async function main() {
  const tolerance = arg("tolerance", "moderate") as RiskTolerance;
  const years = Number(arg("years", "10"));
  /** Evaluate every Nth session. 1 is exhaustive; higher trades resolution for time. */
  const step = Number(arg("step", "1"));

  const { ALL_STRATEGIES } = await import("@/lib/strategies");
  const { THRESHOLD_PRESETS } = await import("@/lib/strategies/types");
  const thresholds = THRESHOLD_PRESETS[tolerance];

  // Long-term strategies self-exclude via null fundamentals; filtering here as
  // well makes the intent explicit rather than incidental.
  const strategies = ALL_STRATEGIES.filter((s) => s.style !== "long-term");

  const benchmark = loadDaily(BENCHMARK_TICKER);
  if (!benchmark) {
    console.error("No benchmark history. Run scripts/fetch-history.ts first.");
    process.exit(1);
  }

  const tickers = availableTickers();
  if (tickers.length === 0) {
    console.error("No cached history. Run scripts/fetch-history.ts first.");
    process.exit(1);
  }

  const cutoff = Math.floor(Date.now() / 1000) - years * 365 * 24 * 60 * 60;

  console.log(
    `backtest · ${tickers.length} stocks · ${strategies.length} strategies · ` +
      `${tolerance} · last ${years}y · step ${step}\n`,
  );

  const tradesByMode = new Map<ExitMode, Map<string, Trade[]>>();
  for (const mode of EXIT_MODES) {
    tradesByMode.set(mode, new Map(strategies.map((s) => [s.id, [] as Trade[]])));
  }
  const signalsByStrategy = new Map<string, number>();
  /** Daily series per ticker, so a trade's fill date can be recovered. */
  const monthLookup = new Map<string, Candle[]>();
  for (const s of strategies) {
    signalsByStrategy.set(s.id, 0);
  }

  const started = Date.now();
  let evaluated = 0;
  let processed = 0;

  for (const ticker of tickers) {
    const history = loadHistory(ticker);
    processed++;
    if (!history) continue;

    const { daily } = history;
    monthLookup.set(ticker, daily);
    const first = Math.max(WARMUP_SESSIONS, daily.findIndex((c) => c.time >= cutoff));
    if (first < 0 || first >= daily.length - 2) continue;

    for (let i = first; i < daily.length - 1; i += step) {
      const bundle = bundleAt(history, i, benchmark);

      for (const strategy of strategies) {
        let signal: StrategySignal | null = null;
        try {
          signal = strategy.evaluate({ bundle, thresholds });
        } catch {
          continue; // A throwing strategy is its own bug, not a trade.
        }
        evaluated++;
        if (!signal || signal.direction !== "bullish") continue;

        signalsByStrategy.set(signal.strategyId, (signalsByStrategy.get(signal.strategyId) ?? 0) + 1);

        // Same signal through every exit variant. Only the close differs, and
        // strategy evaluation — not trade simulation — is what costs time, so
        // four variants are near enough free once the signal exists.
        for (const mode of EXIT_MODES) {
          const trade = simulateTrade(
            ticker,
            signal,
            daily,
            i,
            DEFAULT_COSTS,
            benchmark,
            mode,
          );
          if (trade) tradesByMode.get(mode)?.get(signal.strategyId)?.push(trade);
        }
      }
    }

    if (processed % 25 === 0) {
      const elapsed = (Date.now() - started) / 1000;
      console.log(`  ${processed}/${tickers.length} stocks · ${elapsed.toFixed(0)}s elapsed`);
    }
  }

  const elapsed = (Date.now() - started) / 1000;
  console.log(`\nevaluated ${evaluated.toLocaleString()} strategy-days in ${elapsed.toFixed(0)}s\n`);

  const monthOf = (t: Trade) => {
    const daily = monthLookup.get(t.ticker);
    const time = daily?.[t.fillIndex]?.time ?? 0;
    return new Date(time * 1000).toISOString().slice(0, 7);
  };

  const statsFor = (mode: ExitMode) =>
    strategies.map((s) =>
      summarise(
        s.id,
        signalsByStrategy.get(s.id) ?? 0,
        tradesByMode.get(mode)?.get(s.id) ?? [],
        monthOf,
      ),
    );

  const byMode = new Map(EXIT_MODES.map((m) => [m, statsFor(m)]));

  // Headline comparison: the same signals, closed four different ways, scored
  // against the index. This is the question the first run raised.
  const MODE_LABEL: Record<ExitMode, string> = {
    both: "target+stop",
    "no-target": "stop only",
    "no-stop": "target only",
    none: "hold to horizon",
  };

  console.log("vsINDEX per trade, by exit rule (higher is better)\n");
  const cmpHeader =
    `${"strategy".padEnd(32)}` + EXIT_MODES.map((m) => MODE_LABEL[m].padStart(16)).join("");
  console.log(cmpHeader);
  console.log("-".repeat(cmpHeader.length));

  for (const s of strategies) {
    const cells = EXIT_MODES.map((m) => {
      const r = byMode.get(m)!.find((x) => x.strategyId === s.id)!;
      return `${r.vsIndexPct >= 0 ? "+" : ""}${r.vsIndexPct.toFixed(2)}%`.padStart(16);
    });
    console.log(s.id.padEnd(32) + cells.join(""));
  }

  console.log("-".repeat(cmpHeader.length));
  const weighted = (rows: ReturnType<typeof statsFor>) => {
    const n = rows.reduce((a, r) => a + r.filled, 0);
    return n > 0 ? rows.reduce((a, r) => a + r.vsIndexPct * r.filled, 0) / n : 0;
  };
  console.log(
    "ALL (trade-weighted)".padEnd(32) +
      EXIT_MODES.map((m) => {
        const v = weighted(byMode.get(m)!);
        return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`.padStart(16);
      }).join(""),
  );

  // Risk, immediately below return, deliberately not on a separate screen.
  //
  // Removing a stop raises average return by declining to realise losses, so
  // the exit comparison above is actively misleading on its own: the variant
  // that looks best there is the one that lets a single position run furthest
  // against you. These two tables only mean anything read together.
  console.log(`\n\nWhat the bad trades looked like, same exit rules\n`);

  const riskHeader =
    `${"".padEnd(20)}${"trades".padStart(9)}${"mean".padStart(9)}` +
    `${"worst".padStart(10)}${"1-in-20".padStart(10)}${"lost>20%".padStart(10)}${"stdev".padStart(9)}`;
  console.log(riskHeader);
  console.log("-".repeat(riskHeader.length));

  for (const mode of EXIT_MODES) {
    const pooled = poolTailStats(
      strategies.flatMap((s) => tradesByMode.get(mode)?.get(s.id) ?? []),
    );
    console.log(
      MODE_LABEL[mode].padEnd(20) +
        pooled.count.toLocaleString().padStart(9) +
        `${pooled.meanPct >= 0 ? "+" : ""}${pooled.meanPct.toFixed(2)}%`.padStart(9) +
        `${pooled.worstPct.toFixed(1)}%`.padStart(10) +
        `${pooled.p05Pct.toFixed(1)}%`.padStart(10) +
        `${pooled.bigLossRate.toFixed(1)}%`.padStart(10) +
        `${pooled.stdevPct.toFixed(1)}%`.padStart(9),
    );
  }

  console.log(`
worst    = the single worst trade in the whole run.
1-in-20  = 5th-percentile trade. One trade in twenty was at least this bad.
lost>20% = share of trades that lost more than a fifth of the position.
stdev    = spread of outcomes. Higher means a rougher ride for the same mean.

A higher mean bought with a worse tail is not a free improvement. Whether that
trade is worth making depends on capital and temperament, which a backtest
cannot know.`);

  console.log(`\n\nDetail for current behaviour (target+stop):\n`);

  const rows = byMode
    .get("both")!
    .slice()
    // Ranked by edge over the control, not by raw return. In a decade when the
    // index roughly tripled, ranking by expectancy ranks by holding period.
    .sort((a, b) => b.edgePct - a.edgePct);

  const header =
    `${"strategy".padEnd(32)}${"fills".padStart(7)}${"occas".padStart(7)}` +
    `${"win%".padStart(7)}${"expect".padStart(8)}${"vsHOLD".padStart(9)}` +
    `${"vsINDEX".padStart(9)}${"PF".padStart(7)}${"hold".padStart(6)}`;
  console.log(header);
  console.log("-".repeat(header.length));

  for (const r of rows) {
    console.log(
      r.strategyId.padEnd(32) +
        String(r.filled).padStart(7) +
        String(r.occasions).padStart(7) +
        `${r.winRate.toFixed(1)}%`.padStart(7) +
        `${r.expectancyPct >= 0 ? "+" : ""}${r.expectancyPct.toFixed(2)}%`.padStart(8) +
        `${r.edgePct >= 0 ? "+" : ""}${r.edgePct.toFixed(2)}%`.padStart(9) +
        `${r.vsIndexPct >= 0 ? "+" : ""}${r.vsIndexPct.toFixed(2)}%`.padStart(9) +
        (Number.isFinite(r.profitFactor) ? r.profitFactor.toFixed(2) : "—").padStart(7) +
        r.avgHoldSessions.toFixed(0).padStart(6),
    );
  }

  const allTrades = rows.reduce((n, r) => n + r.filled, 0);
  const totalExpectancy =
    allTrades > 0
      ? rows.reduce((sum, r) => sum + r.expectancyPct * r.filled, 0) / allTrades
      : 0;

  console.log("-".repeat(header.length));
  console.log(
    `${"ALL".padEnd(32)}${String(rows.reduce((n, r) => n + r.signals, 0)).padStart(7)}` +
      `${String(allTrades).padStart(7)}${"".padStart(8)}${"".padStart(8)}${"".padStart(9)}` +
      `${`${totalExpectancy >= 0 ? "+" : ""}${totalExpectancy.toFixed(2)}%`.padStart(8)}`,
  );

  console.log(`
expect  = average net return per filled trade, after ${DEFAULT_COSTS.roundTripPct}% round-trip costs.
vsHOLD  = expect minus holding the SAME stock, bought the SAME day, for the
          SAME number of sessions, with no target and no stop.
          Isolates the EXIT rules: did the target and stop earn their keep?
vsINDEX = expect minus NIFTY over the same calendar window.
          Isolates the ENTRY rules: were these better picks than owning the market?
occas   = distinct (stock, month) pairs behind the fills.

The two controls answer different questions and a strategy can pass one and
fail the other. Raw 'expect' answers neither: Indian equities rose through most
of this decade, so anything holding stocks for weeks shows a profit whether its
rules contribute or not.

Four things flatter every number above:

  1. Survivorship. The universe is TODAY'S Nifty 200. Companies that collapsed
     or left the index are absent, so the sample is drawn from survivors.
  2. Overlapping trades. A screen describing a *state* re-fires every session
     that state holds, so one trend becomes hundreds of rows that are all the
     same bet. Compare 'fills' against 'occas' — where they diverge sharply,
     the effective sample is far smaller than the fill count suggests, and the
     win rate is correspondingly less certain.
  3. No capital constraint. One position per signal, unlimited money, no
     sizing, no cap on concurrent positions.
  4. Fundamentals excluded. The five long-term strategies are not measured
     here at all, so this says nothing about them.

None of this is a recommendation to trade any of these strategies.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
