import type { Candle } from "@/lib/market-data/types";
import type { StrategySignal } from "@/lib/strategies/types";

/**
 * Fill and exit simulation for a backtested signal.
 *
 * The rules here mirror `@/lib/engine/evaluate-trade`, which resolves live
 * recommendations, so a backtested win rate and a realised one measure the same
 * thing. Where they differ it is because a backtest has information the live
 * job does not — it can see every session between entry and exit, not one daily
 * snapshot — and those differences are called out where they occur.
 */

export type Outcome = "won" | "lost" | "expired";

export interface Trade {
  ticker: string;
  strategyId: string;
  signalIndex: number;
  fillIndex: number;
  exitIndex: number;
  entryPrice: number;
  exitPrice: number;
  target: number;
  stop: number;
  outcome: Outcome;
  /** Net of costs, percent. */
  returnPct: number;
  holdSessions: number;
  /**
   * What simply holding the same stock, bought on the same day and sold after
   * the same number of sessions, would have returned — same costs applied.
   *
   * The control the headline numbers are meaningless without. Indian equities
   * rose over most of this sample, so any strategy that buys and holds for
   * weeks shows a profit whether or not its rules contribute anything. The
   * question a backtest has to answer is not "did this make money" but "did it
   * beat owning the same stock over the same days", and only this column can
   * answer it.
   */
  buyHoldPct: number;
  /**
   * NIFTY's return over the same calendar window, same costs.
   *
   * The second control, and it answers a different question from `buyHoldPct`.
   * That one holds the *entry decision* fixed and asks whether the target and
   * stop earned their keep. This one holds the *dates* fixed and asks whether
   * the stock the screen picked beat simply owning the market over those days.
   * A strategy can fail the first and pass the second: its picks are good, its
   * exits are not.
   */
  benchmarkPct: number;
}

export interface CostModel {
  /** Round-trip cost as a fraction of notional: brokerage, STT, stamp, slippage. */
  roundTripPct: number;
}

/**
 * Did the next session trade inside the entry band, and at what price?
 *
 * A signal is computed from day T's close, so the earliest honest fill is T+1.
 * Requiring the band to actually trade matters: strategies place their entry
 * band around the signal-day close, and a stock that gaps straight through it
 * never offered the entry the card advertised. Counting those as trades — at a
 * price nobody could have got — is one of the easiest ways to manufacture a
 * good backtest.
 *
 * Fills at the least favourable price inside the band that the session actually
 * reached, which is the conservative reading of a limit order placed blind.
 */
export function fillPrice(bar: Candle, low: number, high: number): number | null {
  // No overlap between the session's range and the band.
  if (bar.low > high || bar.high < low) return null;

  // Opened inside the band: that is the fill.
  if (bar.open >= low && bar.open <= high) return bar.open;

  // Gapped above and traded back down into the band — filled at the top edge.
  if (bar.open > high) return high;

  // Opened below and rallied into it — filled at the bottom edge.
  return low;
}

/**
 * Walk forward from the fill to an exit.
 *
 * `maxSessions` is in trading sessions, matching how strategies quote
 * `holdDays`; the live evaluator has to approximate this from the calendar
 * because it only sees one snapshot a day, but here the sessions are countable.
 */
/**
 * Which exit rules are armed.
 *
 * The backtest's first run showed every strategy performing worse than simply
 * holding its own pick for the same number of sessions, which points at the
 * exits rather than the entries. Making them switchable turns that from a
 * suspicion into something measurable: run the same signals through each
 * variant and read off which one the rules were actually costing.
 */
export type ExitMode =
  /** Target and stop both armed — what the app does today. */
  | "both"
  /** Stop only. Tests whether the target is cutting winners short. */
  | "no-target"
  /** Target only. Tests whether the stop is selling into noise. */
  | "no-stop"
  /** Neither: hold to the horizon. Equivalent to the buy-and-hold control. */
  | "none";

export const EXIT_MODES: ExitMode[] = ["both", "no-target", "no-stop", "none"];

export function resolveExit(
  daily: Candle[],
  fillIndex: number,
  target: number | null,
  stop: number | null,
  maxSessions: number,
): { exitIndex: number; exitPrice: number; outcome: Outcome } {
  const lastIndex = Math.min(daily.length - 1, fillIndex + maxSessions);

  for (let i = fillIndex; i <= lastIndex; i++) {
    const bar = daily[i];
    const hitTarget = target !== null && bar.high >= target;
    const hitStop = stop !== null && bar.low <= stop;

    // Both levels traded in one session. Daily bars do not record which came
    // first, and calling it a win would flatter every strategy whose stop and
    // target sit within one session's range. Same rule the live evaluator uses.
    if (hitTarget && hitStop) return { exitIndex: i, exitPrice: stop!, outcome: "lost" };
    if (hitTarget) return { exitIndex: i, exitPrice: target!, outcome: "won" };
    if (hitStop) return { exitIndex: i, exitPrice: stop!, outcome: "lost" };
  }

  // Held to the horizon without resolving: closed at the last available close.
  return { exitIndex: lastIndex, exitPrice: daily[lastIndex].close, outcome: "expired" };
}

/**
 * Turn one signal into a trade, or null when it never filled.
 *
 * `signalIndex` is the session whose close produced the signal.
 */
/** Last index in `series` at or before `time`, or -1. */
function indexAtOrBefore(series: Candle[], time: number): number {
  let lo = 0;
  let hi = series.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].time <= time) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export function simulateTrade(
  ticker: string,
  signal: StrategySignal,
  daily: Candle[],
  signalIndex: number,
  costs: CostModel,
  benchmark: Candle[],
  mode: ExitMode = "both",
): Trade | null {
  const fillIndex = signalIndex + 1;
  if (fillIndex >= daily.length) return null;

  const entryPrice = fillPrice(daily[fillIndex], signal.entry.low, signal.entry.high);
  if (entryPrice === null) return null;

  // Target band's near edge, matching what the card presents as the first
  // objective and what `analyzePosition` treats as "target reached".
  const target = signal.target.low;
  const stop = signal.stopLoss;
  if (!(stop < entryPrice && target > entryPrice)) return null;

  // The entry gate stays identical across modes — same signals, same fills, so
  // the only thing varying between runs is how the position is closed.
  const armedTarget = mode === "both" || mode === "no-stop" ? target : null;
  const armedStop = mode === "both" || mode === "no-target" ? stop : null;

  const { exitIndex, exitPrice, outcome } = resolveExit(
    daily,
    fillIndex,
    armedTarget,
    armedStop,
    signal.holdDays.max,
  );

  const gross = ((exitPrice - entryPrice) / entryPrice) * 100;
  const holdSessions = exitIndex - fillIndex;

  // Control: same stock, same entry, same holding period, no target or stop.
  const buyHoldExit = daily[Math.min(daily.length - 1, fillIndex + holdSessions)].close;
  const buyHoldGross = ((buyHoldExit - entryPrice) / entryPrice) * 100;

  // Control two: the index over the same calendar window. Costs are applied to
  // it as well, so the comparison is like for like rather than penalising the
  // strategy for brokerage the benchmark never paid.
  const benchStart = indexAtOrBefore(benchmark, daily[fillIndex].time);
  const benchEnd = indexAtOrBefore(benchmark, daily[exitIndex].time);
  const benchmarkGross =
    benchStart >= 0 && benchEnd > benchStart
      ? ((benchmark[benchEnd].close - benchmark[benchStart].close) /
          benchmark[benchStart].close) *
        100
      : 0;

  return {
    ticker,
    strategyId: signal.strategyId,
    signalIndex,
    fillIndex,
    exitIndex,
    entryPrice,
    exitPrice,
    target,
    stop,
    outcome,
    returnPct: gross - costs.roundTripPct,
    holdSessions,
    buyHoldPct: buyHoldGross - costs.roundTripPct,
    benchmarkPct: benchmarkGross - costs.roundTripPct,
  };
}

export interface StrategyStats {
  strategyId: string;
  signals: number;
  filled: number;
  won: number;
  lost: number;
  expired: number;
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  expectancyPct: number;
  profitFactor: number;
  avgHoldSessions: number;
  /** Average return of the same-stock, same-days buy-and-hold control. */
  buyHoldPct: number;
  /** Expectancy minus the buy-and-hold control: what the *exits* contributed. */
  edgePct: number;
  /** Average index return over the same windows. */
  benchmarkPct: number;
  /** Expectancy minus the index: what the *picks* contributed. */
  vsIndexPct: number;
  /**
   * Distinct (stock, month) pairs the trades came from.
   *
   * Signal counts overstate independence badly. A screen that describes a
   * *state* — "price is above a rising 150-day average" — fires again every
   * session the state persists, so one trend can produce a hundred rows that
   * are all the same bet. This counts how many genuinely separate occasions
   * are behind the numbers.
   */
  occasions: number;
  /** Worst single trade, percent. */
  worstPct: number;
  /** 5th-percentile trade: one in twenty was at least this bad. */
  p05Pct: number;
  /** Share of trades losing more than 20%. */
  bigLossRate: number;
  /** Standard deviation of trade returns. */
  stdevPct: number;
}

/**
 * Tail statistics for a set of trades.
 *
 * Average return says what a strategy did across many trades; these say what
 * the bad ones looked like. The distinction decides whether a result is usable:
 * removing a stop loss raises the mean precisely by refusing to realise losses,
 * so a variant can look better on expectancy while being far harder to survive.
 * Reporting one without the other would be misleading.
 */
function tailStats(returns: number[]) {
  if (returns.length === 0) {
    return { worstPct: 0, p05Pct: 0, bigLossRate: 0, stdevPct: 0 };
  }

  const sorted = [...returns].sort((a, b) => a - b);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / returns.length;

  return {
    worstPct: sorted[0],
    p05Pct: sorted[Math.floor(sorted.length * 0.05)],
    bigLossRate: (returns.filter((r) => r < -20).length / returns.length) * 100,
    stdevPct: Math.sqrt(variance),
  };
}

/** Pooled tail statistics across every trade in a set. Exported for the runner. */
export function poolTailStats(trades: Trade[]) {
  const returns = trades.map((t) => t.returnPct);
  const mean = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  return { ...tailStats(returns), meanPct: mean, count: trades.length };
}

export function summarise(
  strategyId: string,
  signals: number,
  trades: Trade[],
  /** Session timestamps, to bucket trades into distinct months per stock. */
  monthOf?: (t: Trade) => string,
): StrategyStats {
  const wins = trades.filter((t) => t.returnPct > 0);
  const losses = trades.filter((t) => t.returnPct <= 0);

  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const grossWin = sum(wins.map((t) => t.returnPct));
  const grossLoss = Math.abs(sum(losses.map((t) => t.returnPct)));

  return {
    strategyId,
    signals,
    filled: trades.length,
    ...tailStats(trades.map((t) => t.returnPct)),
    won: trades.filter((t) => t.outcome === "won").length,
    lost: trades.filter((t) => t.outcome === "lost").length,
    expired: trades.filter((t) => t.outcome === "expired").length,
    // On net return, not on which level was touched: an "expired" trade closed
    // above its entry is money made, and a strategy that mostly expires slightly
    // green deserves to be told apart from one that mostly stops out.
    winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
    avgWinPct: wins.length > 0 ? grossWin / wins.length : 0,
    avgLossPct: losses.length > 0 ? -grossLoss / losses.length : 0,
    expectancyPct: trades.length > 0 ? sum(trades.map((t) => t.returnPct)) / trades.length : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    avgHoldSessions:
      trades.length > 0 ? sum(trades.map((t) => t.holdSessions)) / trades.length : 0,
    buyHoldPct:
      trades.length > 0 ? sum(trades.map((t) => t.buyHoldPct)) / trades.length : 0,
    edgePct:
      trades.length > 0
        ? (sum(trades.map((t) => t.returnPct)) - sum(trades.map((t) => t.buyHoldPct))) /
          trades.length
        : 0,
    benchmarkPct:
      trades.length > 0 ? sum(trades.map((t) => t.benchmarkPct)) / trades.length : 0,
    vsIndexPct:
      trades.length > 0
        ? (sum(trades.map((t) => t.returnPct)) - sum(trades.map((t) => t.benchmarkPct))) /
          trades.length
        : 0,
    occasions: monthOf ? new Set(trades.map((t) => `${t.ticker}:${monthOf(t)}`)).size : 0,
    ...tailStats(trades.map((t) => t.returnPct)),
  };
}
