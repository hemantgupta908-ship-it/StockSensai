import {
  atr,
  averageVolume,
  closes,
  crossedAbove,
  ema,
  highestHigh,
  last,
  lowestLow,
  percentChange,
  rsi,
  sma,
  at,
} from "@/lib/indicators";
import {
  condition,
  longEntryBand,
  money,
  nearestSwingHighAbove,
  ratio,
  sanitiseBand,
  targetBand,
  timesAverage,
} from "./helpers";
import {
  bandsAreOrdered,
  minRewardRiskFor,
  requiredConditionsMet,
  rewardToRisk,
  riskFromStopDistance,
  round2,
  scoreConditions,
  type Strategy,
  type StrategyCondition,
  type StrategySignal,
} from "./types";

/**
 * Positional strategies — holds of one to six months.
 *
 * These sit between the swing screens and the long-term ones. Swing trades one
 * leg of a move and exits at the next pivot; long-term buys a business and
 * ignores the chart. Positional holds the *primary trend* through its pullbacks,
 * so every strategy here is built on the slow averages — the 50, 150 and 200 —
 * and on where price sits inside its 52-week range. Nothing here fires off a
 * single session's behaviour, which is the point.
 *
 * All five run on daily bars. The 200-period averages need roughly a year of
 * history, so each guards on bar count before computing anything.
 */

/** Trading sessions in a year, near enough for 52-week high/low windows. */
const YEAR_BARS = 250;

// ---------------------------------------------------------------------------
// 1. Stage 2 Uptrend
// ---------------------------------------------------------------------------

const stageTwoTrend: Strategy = {
  id: "pos-stage-two-trend",
  name: "Stage 2 Uptrend",
  style: "positional",
  tagline: "Above a rising 150-day average, inside the 52-week upper range",
  holdPeriodLabel: "2–6 months",
  baseRisk: "Medium",
  explainer: {
    summary:
      "Identifies stocks in a confirmed advancing phase — above a rising long-term average and near the top of their yearly range — and holds them while that phase lasts.",
    origin:
      "Stan Weinstein's Secrets for Profiting in Bull and Bear Markets (1988) divides every stock's life into four stages: basing, advancing, topping and declining. His argument is that the great majority of money is made by owning stocks only in stage 2, and that the 30-week moving average tells you which stage you are in. Mark Minervini's later trend template adds the 52-week range conditions used here, which filter out stocks that are technically above their average but going nowhere.",
    howItWorks: [
      "The 150-day simple moving average is the 30-week average Weinstein used, in trading days. Price above it, and the average itself rising, is the definition of an advancing phase.",
      "The 50-day EMA must sit above the 150-day average. When the faster average is beneath the slower one the stock is either basing or topping, whatever price is doing this week.",
      "Price must be within 25% of its 52-week high. A stock 40% off its high is in a downtrend that happens to have bounced.",
      "Price must also be at least 30% above its 52-week low, which excludes stocks that have merely stopped falling and are still building a base.",
      "Together these describe a stock the market has already decided about. The strategy is not looking for a turn, it is looking for a trend to join.",
    ],
    signalConditions: [
      "Price above the 150-day simple moving average",
      "150-day average rising over the last 20 sessions",
      "50 EMA above the 150-day average",
      "Price within 25% of the 52-week high",
      "Price at least 30% above the 52-week low",
    ],
    entryLogic:
      "Entry band sits just below current price. In an established stage-2 trend there is no low-risk entry that waits for a deep pullback — deep pullbacks in stage 2 are rare, and waiting for one is how the whole advance gets missed.",
    exitLogic:
      "Target is roughly a fifth above the entry, which is a normal advance for a stage-2 leg over a few months. Stop sits below the 150-day average: a decisive close under it is Weinstein's own definition of stage 2 ending, and it is the only exit that matters.",
    worksBestWhen: [
      "The broader market is itself in an uptrend — stage 2 is far more reliable in a bull phase",
      "The stock's sector is also advancing rather than the stock being an isolated mover",
      "The advance is orderly, with pullbacks that hold the 50 EMA",
    ],
    failsWhen: [
      "The overall market rolls over, at which point most stage-2 stocks top together",
      "The stock is very late in a multi-year advance, where stage 3 arrives without warning",
      "Applied to a low-liquidity counter whose averages are distorted by erratic trade",
    ],
    indicators: ["150-day SMA", "50 EMA", "52-week high/low range", "ATR(14)"],
  },

  evaluate({ bundle, thresholds }): StrategySignal | null {
    const { daily, quote, instrument } = bundle;
    if (daily.length < 200) return null;

    const price = closes(daily);
    const sma150 = sma(price, 150);
    const ema50 = ema(price, 50);
    const atr14 = atr(daily, 14);

    const sma150Now = last(sma150);
    const sma150Then = at(sma150, 20);
    const ema50Now = last(ema50);
    const atrNow = last(atr14);
    const currentPrice = quote.price;

    if (!Number.isFinite(sma150Now) || !Number.isFinite(ema50Now)) return null;

    const lookback = Math.min(YEAR_BARS, daily.length);
    const yearHigh = highestHigh(daily, lookback);
    const yearLow = lowestLow(daily, lookback);
    const offHighPct = ((yearHigh - currentPrice) / yearHigh) * 100;
    const aboveLowPct = ((currentPrice - yearLow) / yearLow) * 100;
    const slopePct = Number.isFinite(sma150Then)
      ? ((sma150Now - sma150Then) / sma150Then) * 100
      : NaN;

    const conditions: StrategyCondition[] = [
      condition(
        "Above the 150-day average",
        currentPrice > sma150Now,
        `${money(currentPrice)} vs 150-day ${money(sma150Now)}`,
        3,
        true,
      ),
      condition(
        "150-day average rising",
        Number.isFinite(slopePct) && slopePct > 0,
        Number.isFinite(slopePct)
          ? `Rose ${slopePct.toFixed(2)}% over the last 20 sessions`
          : "Not enough history",
        3,
        true,
      ),
      condition(
        "50 EMA above the 150-day average",
        ema50Now > sma150Now,
        `50 EMA ${money(ema50Now)} vs 150-day ${money(sma150Now)}`,
        2.5,
        true,
      ),
      condition(
        "Within 25% of the 52-week high",
        offHighPct <= 25,
        `${offHighPct.toFixed(1)}% below the 52-week high of ${money(yearHigh)}`,
        2.5,
        true,
      ),
      condition(
        "At least 30% above the 52-week low",
        aboveLowPct >= 30,
        `${aboveLowPct.toFixed(1)}% above the 52-week low of ${money(yearLow)}`,
        2,
      ),
    ];

    if (!requiredConditionsMet(conditions)) return null;

    const entry = sanitiseBand(longEntryBand(currentPrice, 2.4, 0.8));
    const target = sanitiseBand(targetBand(currentPrice * 1.2, 3.5));
    // Below the 150-day average, but never risking more than an ATR-scaled
    // distance — in a stock that has run far ahead of its average, the average
    // can sit 20% away, which is not a stop, it is a hope.
    const stopLoss = round2(
      Math.max(sma150Now * 0.97, currentPrice - atrNow * thresholds.stopAtrMultiple * 2.5),
    );

    // A stop inside the entry band, or a target overlapping it, is not a
    // tradeable setup — and `rewardToRisk` cannot see either, because it
    // works from midpoints. Must run before the reward-to-risk floor.
    if (!bandsAreOrdered(entry, target, stopLoss, "bullish")) return null;
    const rr = rewardToRisk(entry, target, stopLoss, "bullish");
    if (rr < minRewardRiskFor(thresholds, "positional")) return null;

    const confidence = scoreConditions(conditions);
    if (confidence < thresholds.minConfidence) return null;

    return {
      strategyId: stageTwoTrend.id,
      ticker: instrument.ticker,
      style: "positional",
      direction: "bullish",
      confidence,
      conditions,
      reason:
        `${instrument.name.replace(/ Ltd$/, "")} is in a confirmed advancing phase: price sits above a 150-day average that is itself rising, the 50-day average is above it, and the stock is only ${offHighPct.toFixed(1)}% off its 52-week high while ${aboveLowPct.toFixed(0)}% above its low. ` +
        `This is a trend to join rather than a turn to predict, and it is held until the 150-day average gives way.`,
      entry,
      target,
      stopLoss,
      holdDays: { min: 40, max: 120 },
      risk: riskFromStopDistance((entry.low + entry.high) / 2, stopLoss),
      metrics: [
        { label: "150-day SMA", value: money(sma150Now) },
        { label: "50 EMA", value: money(ema50Now) },
        { label: "Off 52w high", value: `${offHighPct.toFixed(1)}%` },
        { label: "Reward:Risk", value: `${ratio(rr, 1)}:1` },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// 2. 52-Week High Breakout
// ---------------------------------------------------------------------------

const yearHighBreakout: Strategy = {
  id: "pos-52w-high-breakout",
  name: "52-Week High Breakout",
  style: "positional",
  tagline: "New yearly high on volume, out of a multi-month base",
  holdPeriodLabel: "3–6 months",
  baseRisk: "Medium",
  explainer: {
    summary:
      "Buys stocks making a new 52-week high on heavy volume after months of going nowhere — the point at which every previous holder is finally in profit.",
    origin:
      "Buying at new highs is counter-intuitive enough that it has been studied repeatedly. George, in a 2004 Journal of Finance paper, found that proximity to the 52-week high predicted future returns better than past returns themselves did. The behavioural explanation is anchoring: investors treat the old high as a ceiling and under-react when it is exceeded, so the adjustment happens gradually rather than at once. The base requirement is Darvas's contribution — a high made straight after a vertical move is a different, far worse setup.",
    howItWorks: [
      "The strategy requires the latest close to be a new high for the entire 52-week window, not merely near one.",
      "Before that, the preceding thirty sessions — about six weeks — must have been a genuine base: a range of under 25% top to bottom. A stock that has risen 60% in two months and then makes a new high is extended, not breaking out.",
      "Volume on the breakout has to clear the configured surge multiple. At a 52-week high there is no overhead supply left, so the only question is whether demand actually arrived — and volume is the only evidence of that.",
      "Price above the 200-day EMA confirms this is a breakout inside a long-term uptrend rather than a violent counter-trend rally.",
    ],
    signalConditions: [
      "Latest close is a new 52-week high",
      "The preceding thirty sessions formed a base under 25% wide",
      "Breakout volume at or above the configured multiple of the 20-day average",
      "Price above the 200-day EMA",
      "The breakout happened within the last five sessions",
    ],
    entryLogic:
      "Entry band sits at the old high, which the breakout has just converted from resistance into support. A first retest is common within a few weeks and is a much better fill than the breakout bar.",
    exitLogic:
      "Target projects the base's own height above the breakout point — the standard measured move, on the reasoning that the time spent building the base is proportional to the move that follows it. Stop goes back inside the base: re-entering it means the breakout failed.",
    worksBestWhen: [
      "The base is long and orderly, with volume drying up through it",
      "The broader market is also near its highs",
      "The stock is a leader in a sector that is itself making new highs",
    ],
    failsWhen: [
      "The market turns down shortly after the breakout — most fail together",
      "The breakout comes on a results gap that has already priced everything in",
      "The base is shallow or short, meaning there was never real accumulation",
    ],
    indicators: ["52-week high", "40-session base range", "20-day average volume", "200 EMA"],
  },

  evaluate({ bundle, thresholds }): StrategySignal | null {
    const { daily, quote, instrument } = bundle;
    if (daily.length < 260) return null;

    const price = closes(daily);
    const ema200 = ema(price, 200);
    const ema200Now = last(ema200);
    const avgVolume = averageVolume(daily, 20);
    const currentPrice = quote.price;

    // Find the breakout: a session in the last five that closed above the prior
    // 52-week high, measured excluding the breakout bar itself.
    let breakoutBarsAgo = -1;
    let priorHigh = NaN;
    for (let back = 0; back <= 4; back++) {
      const index = daily.length - 1 - back;
      const priorEnd = index - 1;
      if (priorEnd < YEAR_BARS) break;
      const high = highestHigh(daily, YEAR_BARS, priorEnd);
      if (daily[index].close > high) {
        breakoutBarsAgo = back;
        priorHigh = high;
        break;
      }
    }
    if (breakoutBarsAgo < 0) return null;

    const breakoutIndex = daily.length - 1 - breakoutBarsAgo;
    const breakoutCandle = daily[breakoutIndex];

    // The base is the thirty sessions — roughly six weeks — before the breakout.
    const baseEnd = breakoutIndex - 1;
    const baseStart = baseEnd - 29;
    if (baseStart < 0) return null;
    const base = daily.slice(baseStart, baseEnd + 1);
    const baseHigh = Math.max(...base.map((c) => c.high));
    const baseLow = Math.min(...base.map((c) => c.low));
    const baseWidthPct = ((baseHigh - baseLow) / baseLow) * 100;
    const baseHeight = baseHigh - baseLow;

    const conditions: StrategyCondition[] = [
      condition(
        "New 52-week high",
        true,
        `Closed at ${money(breakoutCandle.close)}, above the previous year's high of ${money(priorHigh)}`,
        3,
        true,
      ),
      condition(
        "Built a base first, not a vertical run",
        baseWidthPct <= 25,
        `Thirty sessions between ${money(baseLow)} and ${money(baseHigh)} — a ${baseWidthPct.toFixed(1)}% range`,
        3,
        true,
      ),
      condition(
        `Breakout volume ≥ ${thresholds.volumeSurgeMultiple}x average`,
        breakoutCandle.volume >= avgVolume * thresholds.volumeSurgeMultiple,
        timesAverage(breakoutCandle.volume, avgVolume),
        3,
        true,
      ),
      condition(
        "Above the 200-day EMA",
        Number.isFinite(ema200Now) && currentPrice > ema200Now,
        Number.isFinite(ema200Now)
          ? `${money(currentPrice)} vs 200 EMA ${money(ema200Now)}`
          : "Not enough history",
        2,
        true,
      ),
      condition(
        "Still near the breakout level",
        currentPrice <= priorHigh * 1.08,
        `${(((currentPrice - priorHigh) / priorHigh) * 100).toFixed(1)}% above the breakout point`,
        1.5,
      ),
    ];

    if (!requiredConditionsMet(conditions)) return null;

    const entry = sanitiseBand({
      low: round2(priorHigh * 0.998),
      high: round2(priorHigh * 1.025),
    });
    const measuredMove = priorHigh + baseHeight;
    const target = sanitiseBand(targetBand(measuredMove, 3.5));
    const stopLoss = round2(Math.max(baseHigh * 0.94, priorHigh * 0.92));

    // A stop inside the entry band, or a target overlapping it, is not a
    // tradeable setup — and `rewardToRisk` cannot see either, because it
    // works from midpoints. Must run before the reward-to-risk floor.
    if (!bandsAreOrdered(entry, target, stopLoss, "bullish")) return null;
    const rr = rewardToRisk(entry, target, stopLoss, "bullish");
    if (rr < minRewardRiskFor(thresholds, "positional")) return null;

    const confidence = scoreConditions(conditions);
    if (confidence < thresholds.minConfidence) return null;

    return {
      strategyId: yearHighBreakout.id,
      ticker: instrument.ticker,
      style: "positional",
      direction: "bullish",
      confidence,
      conditions,
      reason:
        `${instrument.name.replace(/ Ltd$/, "")} spent roughly six weeks inside a ${baseWidthPct.toFixed(1)}% range and has now closed at a new 52-week high on ${timesAverage(breakoutCandle.volume, avgVolume)}. ` +
        `Above ${money(priorHigh)} there is no trapped supply left from the last year, and the base projects a measured move toward ${money(measuredMove)}.`,
      entry,
      target,
      stopLoss,
      holdDays: { min: 60, max: 130 },
      risk: riskFromStopDistance((entry.low + entry.high) / 2, stopLoss),
      metrics: [
        { label: "52-week high", value: money(priorHigh) },
        { label: "Base width", value: `${baseWidthPct.toFixed(1)}%` },
        { label: "Breakout volume", value: timesAverage(breakoutCandle.volume, avgVolume) },
        { label: "Reward:Risk", value: `${ratio(rr, 1)}:1` },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// 3. Pullback to the Rising 50 EMA
// ---------------------------------------------------------------------------

const emaPullback: Strategy = {
  id: "pos-ema-pullback",
  name: "Pullback to the Rising 50 EMA",
  style: "positional",
  tagline: "Trend intact, price resting on the 50-day on light volume",
  holdPeriodLabel: "2–5 months",
  baseRisk: "Low",
  explainer: {
    summary:
      "Waits for a stock in a long-term uptrend to pull back to its 50-day average on fading volume, and buys the trend at the one place it offers a discount.",
    origin:
      "Buying pullbacks within a trend is the oldest form of trend-following, and the 50-day average became its standard reference simply because enough institutions watch it that the level becomes self-fulfilling. The volume condition is what separates a pullback from a distribution: Richard Wyckoff's principle that price and volume must agree means a healthy retracement comes on *less* trade than the advance, because sellers are absent rather than aggressive.",
    howItWorks: [
      "The trend must be established first: price above the 200-day EMA and the 50-day EMA rising over the past twenty sessions. Without both, this is not a pullback, it is a downtrend.",
      "Price must have been meaningfully extended above the 50-day average — at least 6% — at some point in the last forty sessions. Otherwise the stock has simply been drifting along its average and there is no pullback to buy.",
      "Price must now be within 4% of that average, approaching from above.",
      "Volume over the pullback must be *below* the twenty-day norm. Heavy volume into a decline means institutions are selling, and the average will not hold.",
      "RSI between 38 and 58 confirms momentum has genuinely reset without breaking — the point of the whole exercise.",
    ],
    signalConditions: [
      "Price above the 200-day EMA",
      "50 EMA rising over the last 20 sessions",
      "Price was at least 6% above the 50 EMA within the last 40 sessions",
      "Price now within 4% of the 50 EMA",
      "Pullback volume below the 20-day average, and RSI(14) between 38 and 58",
    ],
    entryLogic:
      "Entry band brackets the 50-day average itself. This is the level the whole setup is about, so entering away from it means paying for the setup without getting it.",
    exitLogic:
      "Target is the high of the move this pullback interrupted, since a trend that resumes normally makes a new high first. Stop sits below the pullback's own low — that is the level which has to hold for this to be a pullback at all, and it keeps the risk to a fraction of what anchoring at the 200-day average would cost.",
    worksBestWhen: [
      "The pullback is shallow and orderly, taking weeks rather than days",
      "Volume contracts steadily through the decline",
      "The broader market is also merely pausing rather than breaking down",
    ],
    failsWhen: [
      "The pullback is news-driven, where the 50-day average means nothing",
      "The stock has already tested the 50-day several times recently — repeated tests weaken it",
      "The trend was very steep, in which case the first pullback often overshoots far below the average",
    ],
    indicators: ["50 EMA", "200 EMA", "RSI(14)", "20-day average volume"],
  },

  evaluate({ bundle, thresholds }): StrategySignal | null {
    const { daily, quote, instrument } = bundle;
    if (daily.length < 220) return null;

    const price = closes(daily);
    const ema50 = ema(price, 50);
    const ema200 = ema(price, 200);
    const rsi14 = rsi(price, 14);
    const atr14 = atr(daily, 14);

    const ema50Now = last(ema50);
    const ema50Then = at(ema50, 20);
    const ema200Now = last(ema200);
    const rsiNow = last(rsi14);
    const atrNow = last(atr14);
    const currentPrice = quote.price;

    if (!Number.isFinite(ema50Now) || !Number.isFinite(ema200Now)) return null;

    const distanceToEma = ((currentPrice - ema50Now) / ema50Now) * 100;
    // Approaching from above: a stock crossing up through the average is a
    // different setup with a different failure mode.
    if (distanceToEma < -4 || distanceToEma > 4) return null;

    // Was the stock genuinely extended before this pullback? Measured over two
    // months, not one: a pullback to the 50-day from a run that peaked six weeks
    // ago is the same setup, and a 25-session window quietly required the whole
    // round trip to happen inside five weeks.
    let maxExtensionPct = 0;
    for (let back = 1; back <= 40; back++) {
      const index = daily.length - 1 - back;
      if (index < 0) break;
      const emaThen = ema50[index];
      if (!Number.isFinite(emaThen) || emaThen <= 0) continue;
      maxExtensionPct = Math.max(maxExtensionPct, ((daily[index].close - emaThen) / emaThen) * 100);
    }

    const avgVolume = averageVolume(daily, 20);
    const pullbackVolume =
      daily.slice(-5).reduce((sum, c) => sum + c.volume, 0) / 5;
    const slopePct = Number.isFinite(ema50Then) ? ((ema50Now - ema50Then) / ema50Then) * 100 : NaN;

    const conditions: StrategyCondition[] = [
      condition(
        "Above the 200-day EMA",
        currentPrice > ema200Now,
        `${money(currentPrice)} vs 200 EMA ${money(ema200Now)}`,
        3,
        true,
      ),
      condition(
        "50 EMA rising",
        Number.isFinite(slopePct) && slopePct > 0,
        Number.isFinite(slopePct)
          ? `Rose ${slopePct.toFixed(2)}% over the last 20 sessions`
          : "Not enough history",
        3,
        true,
      ),
      condition(
        "Was extended before the pullback",
        maxExtensionPct >= 6,
        `Reached ${maxExtensionPct.toFixed(1)}% above the 50 EMA in the last 40 sessions`,
        2.5,
        true,
      ),
      condition(
        "Now resting on the 50 EMA",
        Math.abs(distanceToEma) <= 4,
        `${distanceToEma >= 0 ? "" : ""}${distanceToEma.toFixed(2)}% from the 50 EMA at ${money(ema50Now)}`,
        3,
        true,
      ),
      condition(
        "Pullback on lighter volume",
        pullbackVolume < avgVolume,
        `Last five sessions averaged ${timesAverage(pullbackVolume, avgVolume)}`,
        2.5,
      ),
      condition(
        "Momentum reset, not broken",
        rsiNow >= 38 && rsiNow <= 58,
        `RSI(14) at ${ratio(rsiNow, 1)}`,
        2,
      ),
    ];

    if (!requiredConditionsMet(conditions)) return null;

    // The thesis is that the trend resumes and makes a *new* high, so the
    // objective is the high of the move this pullback interrupted — not the
    // nearest pivot overhead, which on a shallow pullback sits a couple of
    // percent away and describes a scalp rather than a months-long hold.
    const priorHigh = highestHigh(daily, 60);
    const overhead = Math.max(
      nearestSwingHighAbove(daily, currentPrice, 120) ?? 0,
      priorHigh * 1.02,
      currentPrice * 1.12,
    );
    const entry = sanitiseBand({
      low: round2(ema50Now * 0.985),
      high: round2(Math.max(currentPrice, ema50Now * 1.015)),
    });
    const target = sanitiseBand(targetBand(overhead, 3));
    // The pullback low is the level that has to hold for the setup to be what
    // it claims. Anchoring there rather than at the 200-day gives a stop that
    // is both structurally meaningful and a fraction of the width — the 200-day
    // can sit 20% below in a stock that has trended for a year.
    const pullbackLow = lowestLow(daily, 10);
    const structuralStop = Math.min(pullbackLow * 0.985, ema50Now * 0.97);
    const stopLoss = round2(
      Math.max(structuralStop, currentPrice - atrNow * thresholds.stopAtrMultiple * 1.5),
    );

    // A stop inside the entry band, or a target overlapping it, is not a
    // tradeable setup — and `rewardToRisk` cannot see either, because it
    // works from midpoints. Must run before the reward-to-risk floor.
    if (!bandsAreOrdered(entry, target, stopLoss, "bullish")) return null;
    const rr = rewardToRisk(entry, target, stopLoss, "bullish");
    if (rr < minRewardRiskFor(thresholds, "positional")) return null;

    const confidence = scoreConditions(conditions);
    if (confidence < thresholds.minConfidence) return null;

    return {
      strategyId: emaPullback.id,
      ticker: instrument.ticker,
      style: "positional",
      direction: "bullish",
      confidence,
      conditions,
      reason:
        `${instrument.name.replace(/ Ltd$/, "")} ran ${maxExtensionPct.toFixed(1)}% clear of its 50-day average and has drifted back to it on ${timesAverage(pullbackVolume, avgVolume)}, with the average itself still rising and price well above its 200-day. ` +
        `A pullback on fading volume is sellers being absent rather than active, which is the one point in a trend that offers a discount without a broken thesis.`,
      entry,
      target,
      stopLoss,
      holdDays: { min: 40, max: 100 },
      risk: riskFromStopDistance((entry.low + entry.high) / 2, stopLoss),
      metrics: [
        { label: "50 EMA", value: money(ema50Now) },
        { label: "200 EMA", value: money(ema200Now) },
        { label: "RSI(14)", value: ratio(rsiNow, 1) },
        { label: "Reward:Risk", value: `${ratio(rr, 1)}:1` },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// 4. Golden Cross Trend
// ---------------------------------------------------------------------------

const goldenCross: Strategy = {
  id: "pos-golden-cross",
  name: "Golden Cross Trend",
  style: "positional",
  tagline: "50-day crossing above the 200-day with both averages rising",
  holdPeriodLabel: "3–6 months",
  baseRisk: "Medium",
  explainer: {
    summary:
      "Takes the classic long-horizon trend signal — the 50-day average crossing above the 200-day — filtered so that only crosses inside a genuinely turning trend qualify.",
    origin:
      "The 50/200 crossover is the most widely reported technical signal in finance, to the point that its occurrence is itself news. That publicity is a double-edged thing: the signal is well known because it captured most major trend changes historically, and unreliable in isolation because it lags badly. The filters here — both averages rising, price above both, volume confirming — address the standard criticism, which is that a cross computed on two falling averages means nothing at all.",
    howItWorks: [
      "The 50-day EMA crossing above the 200-day EMA says the last quarter's prices have decisively overtaken the last year's. Structurally, it is the point at which the medium-term trend stops being a rally inside a downtrend.",
      "Both averages must be rising. A cross where the 200-day is still falling happens frequently in the middle of bear markets and resolves downward more often than not.",
      "Price has to be above both averages, not caught between them.",
      "Volume above the twenty-day norm on the crossing sessions confirms that participation arrived with the signal.",
      "The signal is only taken within forty sessions of the cross, and only while price is still within 12% of the 200-day average. Beyond that the entry has moved so far that the stop is no longer defensible.",
    ],
    signalConditions: [
      "50 EMA crossed above the 200 EMA within the last 40 sessions",
      "Both the 50 and 200 EMAs rising over the last 20 sessions",
      "Price trading above both averages",
      "Volume above the 20-day average around the cross",
      "Price not more than 12% extended above the 200 EMA",
    ],
    entryLogic:
      "Entry band sits modestly below current price. Golden crosses lag by construction, and the first pullback after one is both common and a far better place to take the position than the crossing session.",
    exitLogic:
      "Target is a fifth above entry, a normal advance for the first leg after a trend change. Stop sits below the 200-day average — if price closes back under the slower average, the cross was noise and the trend has not in fact turned.",
    worksBestWhen: [
      "The cross follows a long basing period rather than a sharp V-shaped rally",
      "The broader index has already turned, so the stock is not doing it alone",
      "The gap between the two averages widens steadily after the cross",
    ],
    failsWhen: [
      "Markets are range-bound, producing crosses and re-crosses that each cost the stop",
      "The cross comes after a near-vertical rally, leaving price far above the 200-day and the stop unusable",
      "It is a low-liquidity stock where the averages are distorted",
    ],
    indicators: ["50 EMA", "200 EMA", "20-day average volume"],
  },

  evaluate({ bundle, thresholds }): StrategySignal | null {
    const { daily, quote, instrument } = bundle;
    if (daily.length < 230) return null;

    const price = closes(daily);
    const ema50 = ema(price, 50);
    const ema200 = ema(price, 200);
    const atr14 = atr(daily, 14);

    // Two months, not two weeks. A golden cross is a slow signal on a slow
    // horizon; a fifteen-session window is a swing trader's idea of fresh and
    // discards almost every genuine occurrence. The extension gate below is what
    // actually stops a stale, already-run entry being taken.
    const crossBarsAgo = crossedAbove(ema50, ema200, 40);
    if (crossBarsAgo < 0) return null;

    const ema50Now = last(ema50);
    const ema200Now = last(ema200);
    const ema50Then = at(ema50, 20);
    const ema200Then = at(ema200, 20);
    const atrNow = last(atr14);
    const currentPrice = quote.price;

    const crossIndex = daily.length - 1 - crossBarsAgo;
    const avgVolume = averageVolume(daily, 20);
    const crossVolume =
      daily.slice(Math.max(0, crossIndex - 2), crossIndex + 1).reduce((sum, c) => sum + c.volume, 0) /
      Math.min(3, crossIndex + 1);

    const extensionPct = ((currentPrice - ema200Now) / ema200Now) * 100;
    const fastRising = Number.isFinite(ema50Then) && ema50Now > ema50Then;
    const slowRising = Number.isFinite(ema200Then) && ema200Now > ema200Then;

    const conditions: StrategyCondition[] = [
      condition(
        "50 EMA crossed above the 200 EMA",
        true,
        `Crossed ${crossBarsAgo === 0 ? "today" : `${crossBarsAgo} session${crossBarsAgo === 1 ? "" : "s"} ago`} — 50 EMA ${money(ema50Now)} vs 200 EMA ${money(ema200Now)}`,
        3,
        true,
      ),
      condition(
        "Both averages rising",
        fastRising && slowRising,
        `50 EMA ${fastRising ? "rising" : "flat or falling"}, 200 EMA ${slowRising ? "rising" : "flat or falling"} over 20 sessions`,
        3,
        true,
      ),
      condition(
        "Price above both averages",
        currentPrice > ema50Now && currentPrice > ema200Now,
        `${money(currentPrice)} against ${money(ema50Now)} and ${money(ema200Now)}`,
        2.5,
        true,
      ),
      condition(
        "Volume confirmed the cross",
        crossVolume > avgVolume,
        timesAverage(crossVolume, avgVolume),
        2,
      ),
      condition(
        "Not overextended from the 200 EMA",
        extensionPct <= 12,
        `${extensionPct.toFixed(1)}% above the 200 EMA`,
        2,
      ),
    ];

    if (!requiredConditionsMet(conditions)) return null;

    const entry = sanitiseBand(longEntryBand(currentPrice, 2.4, 0.9));
    const target = sanitiseBand(targetBand(currentPrice * 1.2, 3.5));
    const stopLoss = round2(
      Math.max(ema200Now * 0.97, currentPrice - atrNow * thresholds.stopAtrMultiple * 2.5),
    );

    // A stop inside the entry band, or a target overlapping it, is not a
    // tradeable setup — and `rewardToRisk` cannot see either, because it
    // works from midpoints. Must run before the reward-to-risk floor.
    if (!bandsAreOrdered(entry, target, stopLoss, "bullish")) return null;
    const rr = rewardToRisk(entry, target, stopLoss, "bullish");
    if (rr < minRewardRiskFor(thresholds, "positional")) return null;

    const confidence = scoreConditions(conditions);
    if (confidence < thresholds.minConfidence) return null;

    return {
      strategyId: goldenCross.id,
      ticker: instrument.ticker,
      style: "positional",
      direction: "bullish",
      confidence,
      conditions,
      reason:
        `${instrument.name.replace(/ Ltd$/, "")}'s 50-day average has crossed above its 200-day, with both averages rising and price above each of them — the version of the signal that historically meant something, rather than a cross between two falling lines. ` +
        `The position is held while price stays above the 200-day at ${money(ema200Now)}.`,
      entry,
      target,
      stopLoss,
      holdDays: { min: 60, max: 130 },
      risk: riskFromStopDistance((entry.low + entry.high) / 2, stopLoss),
      metrics: [
        { label: "50 EMA", value: money(ema50Now) },
        { label: "200 EMA", value: money(ema200Now) },
        { label: "Above 200 EMA", value: `${extensionPct.toFixed(1)}%` },
        { label: "Reward:Risk", value: `${ratio(rr, 1)}:1` },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// 5. Relative Strength Leader
// ---------------------------------------------------------------------------

const relativeStrengthLeader: Strategy = {
  id: "pos-relative-strength-leader",
  name: "Relative Strength Leader",
  style: "positional",
  tagline: "Beating NIFTY over six months and still leading now",
  holdPeriodLabel: "3–6 months",
  baseRisk: "Medium",
  explainer: {
    summary:
      "Finds the stocks that have beaten the index over the last six months and are still beating it this month, then holds them while that leadership persists.",
    origin:
      "Jegadeesh and Titman's 1993 study is the foundation: stocks ranked on three-to-twelve-month relative returns continued to outperform over the following months, an effect robust enough across markets and decades that momentum became one of the standard equity factors. The two-window construction used here — a long ranking window plus a short confirmation window — addresses the factor's main weakness, which is that momentum reverses sharply and the reversal shows up in the recent window first.",
    howItWorks: [
      "The stock's 120-session return is compared with the NIFTY 50's over the same window. The gap has to be wide — several times the short-term margin — because over six months small differences are noise.",
      "A second, shorter check over twenty sessions requires the stock to still be ahead of the index. Leadership that has quietly ended a month ago is exactly what the long window cannot see.",
      "Price above both the 50 and 200-day averages ensures the outperformance is a trend rather than a stock that fell less than the index in a bad market.",
      "An RSI ceiling excludes names that have gone parabolic, where the trade is a blow-off rather than a trend.",
    ],
    signalConditions: [
      "120-session return exceeds NIFTY 50's by four times the configured margin",
      "20-session return still ahead of the index",
      "Absolute 120-session return positive",
      "Price above both the 50 and 200-day EMAs",
      "RSI(14) below 82 — leading, not parabolic",
    ],
    entryLogic:
      "Entry band sits a little below current price. Leaders rarely offer deep pullbacks, so the band is set at the sort of shallow dip that actually occurs rather than one that would look better on paper.",
    exitLogic:
      "Target extends roughly a third of the six-month move beyond current price, which is what the momentum literature suggests a continuation leg is worth. Stop sits below the 50-day average, since leadership that loses the fast average has generally ended.",
    worksBestWhen: [
      "A clear sector rotation is under way and the stock is the leader within it",
      "The index is trending, so relative and absolute strength point the same way",
      "Outperformance has been steady across the window rather than one large gap",
    ],
    failsWhen: [
      "Momentum reverses market-wide, which it does abruptly and usually after a sharp rally",
      "The stock's outperformance came entirely from a single re-rating event months ago",
      "The market rotates to value, where six-month leaders are the first to be sold",
    ],
    indicators: ["120-session return vs NIFTY 50", "20-session relative return", "50 EMA", "200 EMA", "RSI(14)"],
  },

  evaluate({ bundle, thresholds }): StrategySignal | null {
    const { daily, benchmarkDaily, quote, instrument } = bundle;
    if (daily.length < 220 || benchmarkDaily.length < 130) return null;

    const price = closes(daily);
    const benchmark = closes(benchmarkDaily);

    const stockLong = percentChange(price, 120);
    const indexLong = percentChange(benchmark, 120);
    const stockShort = percentChange(price, 20);
    const indexShort = percentChange(benchmark, 20);
    if (![stockLong, indexLong, stockShort, indexShort].every(Number.isFinite)) return null;

    const longSpread = stockLong - indexLong;
    const shortSpread = stockShort - indexShort;
    // Over six months, the short-horizon margin is noise — require a much
    // wider gap before calling anything leadership.
    const requiredSpread = thresholds.relativeStrengthMargin * 4;
    if (longSpread < requiredSpread || stockLong <= 0) return null;

    const ema50 = ema(price, 50);
    const ema200 = ema(price, 200);
    const ema50Now = last(ema50);
    const ema200Now = last(ema200);
    const rsiNow = last(rsi(price, 14));
    const atrNow = last(atr(daily, 14));
    const currentPrice = quote.price;

    if (!Number.isFinite(ema50Now) || !Number.isFinite(ema200Now)) return null;

    const conditions: StrategyCondition[] = [
      condition(
        `Beating NIFTY by ≥ ${requiredSpread}pp over six months`,
        true,
        `${stockLong.toFixed(1)}% vs NIFTY ${indexLong.toFixed(1)}% over 120 sessions (spread ${longSpread.toFixed(1)}pp)`,
        3,
        true,
      ),
      condition(
        "Still leading over the last month",
        shortSpread > 0,
        `${stockShort.toFixed(1)}% vs NIFTY ${indexShort.toFixed(1)}% over 20 sessions`,
        3,
        true,
      ),
      condition(
        "Above the 50-day average",
        currentPrice > ema50Now,
        `${money(currentPrice)} vs 50 EMA ${money(ema50Now)}`,
        2.5,
        true,
      ),
      condition(
        "Above the 200-day average",
        currentPrice > ema200Now,
        `${money(currentPrice)} vs 200 EMA ${money(ema200Now)}`,
        2.5,
        true,
      ),
      condition(
        "Not parabolic (RSI < 82)",
        rsiNow < 82,
        `RSI(14) at ${ratio(rsiNow, 1)}`,
        1.5,
      ),
    ];

    if (!requiredConditionsMet(conditions)) return null;

    const entry = sanitiseBand(longEntryBand(currentPrice, 2.2, 0.9));
    const projected = currentPrice * (1 + (stockLong / 100) * 0.33);
    const target = sanitiseBand(targetBand(projected, 3));
    const stopLoss = round2(
      Math.max(ema50Now * 0.96, currentPrice - atrNow * thresholds.stopAtrMultiple * 2.2),
    );

    // A stop inside the entry band, or a target overlapping it, is not a
    // tradeable setup — and `rewardToRisk` cannot see either, because it
    // works from midpoints. Must run before the reward-to-risk floor.
    if (!bandsAreOrdered(entry, target, stopLoss, "bullish")) return null;
    const rr = rewardToRisk(entry, target, stopLoss, "bullish");
    if (rr < minRewardRiskFor(thresholds, "positional")) return null;

    const confidence = scoreConditions(conditions);
    if (confidence < thresholds.minConfidence) return null;

    return {
      strategyId: relativeStrengthLeader.id,
      ticker: instrument.ticker,
      style: "positional",
      direction: "bullish",
      confidence,
      conditions,
      reason:
        `${instrument.name.replace(/ Ltd$/, "")} is up ${stockLong.toFixed(1)}% over the last six months against the NIFTY 50's ${indexLong.toFixed(1)}%, and it is still ahead of the index over the last month — leadership that is current rather than historical. ` +
        `Momentum of this kind in ${instrument.sector.toLowerCase()} has historically persisted for months rather than weeks.`,
      entry,
      target,
      stopLoss,
      holdDays: { min: 60, max: 130 },
      risk: riskFromStopDistance((entry.low + entry.high) / 2, stopLoss),
      metrics: [
        { label: "6-month return", value: `${stockLong >= 0 ? "+" : ""}${stockLong.toFixed(1)}%` },
        { label: "NIFTY 6-month", value: `${indexLong >= 0 ? "+" : ""}${indexLong.toFixed(1)}%` },
        { label: "Spread", value: `${longSpread.toFixed(1)} pp` },
        { label: "Reward:Risk", value: `${ratio(rr, 1)}:1` },
      ],
    };
  },
};

export const POSITIONAL_STRATEGIES: Strategy[] = [
  stageTwoTrend,
  yearHighBreakout,
  emaPullback,
  goldenCross,
  relativeStrengthLeader,
];
