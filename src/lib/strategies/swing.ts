import {
  atr,
  averageVolume,
  bullishReversalCandle,
  bearishReversalCandle,
  closes,
  crossedAbove,
  crossedAboveLevel,
  crossedBelow,
  crossedBelowLevel,
  ema,
  findPriceZones,
  highestHigh,
  last,
  lowestLow,
  macd,
  rsi,
  swingHighs,
  swingLows,
  at,
} from "@/lib/indicators";
import {
  condition,
  longEntryBand,
  money,
  nearestSwingHighAbove,
  nearestSwingLowBelow,
  ratio,
  sanitiseBand,
  shortEntryBand,
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
 * Swing trading strategies — holds of a few days to a few weeks.
 *
 * All five run on daily OHLCV. Each computes its own entry, target and stop
 * from structure in the chart (swing pivots, moving averages, measured moves)
 * rather than a flat percentage, because that's what makes the reward-to-risk
 * figure meaningful.
 */

// ---------------------------------------------------------------------------
// 1. Moving Average Crossover
// ---------------------------------------------------------------------------

const maCrossover: Strategy = {
  id: "swing-ma-crossover",
  name: "Moving Average Crossover",
  style: "swing",
  tagline: "20 EMA crossing above the 50 EMA on rising volume",
  holdPeriodLabel: "5–15 trading days",
  baseRisk: "Medium",
  explainer: {
    summary:
      "Buys the moment a stock's short-term average price crosses above its medium-term average — the classic signal that a new up-leg has started.",
    origin:
      "Moving-average crossovers are among the oldest systematic trading rules, popularised by Richard Donchian in the 1950s and later formalised in trend-following funds. The idea is not to predict a turn but to wait for one to be confirmed by price itself, accepting a late entry in exchange for avoiding most false starts.",
    howItWorks: [
      "A 20-period exponential moving average tracks roughly the last month of trading; a 50-period EMA tracks about the last quarter. When the 20 crosses above the 50, recent prices have decisively outpaced the medium-term trend.",
      "Volume is the confirmation filter. A crossover on thin volume often means the average is drifting up because old low prices are rolling out of the window, not because buyers are stepping in. Rising volume on the cross suggests real participation.",
      "The setup deliberately gives up the bottom of the move. It is designed to capture the middle third of a trend, where the move is most reliable.",
    ],
    signalConditions: [
      "20 EMA crosses above the 50 EMA within the last 5 sessions",
      "Volume on the crossover session above the 20-day average",
      "Price trading above the 20 EMA (no immediate rejection)",
      "50 EMA itself sloping upward over the last 10 sessions",
      "RSI(14) between 45 and 75 — trending but not yet exhausted",
      "Weekly trend is aligned (Weekly 20 EMA > Weekly 50 EMA)",
    ],
    entryLogic:
      "Entry band sits just under the current price, around the crossover zone. Crossovers frequently see a shallow pullback toward the 20 EMA within a few sessions, which is a better fill than chasing the breakout candle.",
    exitLogic:
      "Target is the nearest prior swing high — the first place overhead supply is known to exist. Stop sits below the 50 EMA, because a close beneath it invalidates the premise that the medium-term trend has turned.",
    worksBestWhen: [
      "The broader market is trending rather than range-bound",
      "The stock has a clean, liquid chart without frequent gaps",
      "The crossover happens after a genuine base, not mid-way through a vertical move",
    ],
    failsWhen: [
      "Markets are choppy — crossovers whipsaw repeatedly and each one costs the stop distance",
      "The stock is news-driven, where a single announcement overrides the trend",
      "The 20 and 50 EMAs are already tightly wound together, producing repeated marginal crosses",
    ],
    indicators: ["20 EMA", "50 EMA", "20-day average volume", "RSI(14)"],
  },

  evaluate({ bundle, thresholds }): StrategySignal | null {
    const { daily, quote, instrument } = bundle;
    if (daily.length < 80) return null;

    const price = closes(daily);
    const ema20 = ema(price, 20);
    const ema50 = ema(price, 50);
    const rsi14 = rsi(price, 14);
    const atr14 = atr(daily, 14);
    const avgVolume = averageVolume(daily, 20);

    const weeklyPrice = closes(bundle.weekly);
    const weeklyEma20 = ema(weeklyPrice, 20);
    const weeklyEma50 = ema(weeklyPrice, 50);
    const weeklyTrendUp = bundle.weekly.length >= 50 ? last(weeklyEma20) > last(weeklyEma50) : true; // Allow new stocks to pass

    const crossBarsAgo = crossedAbove(ema20, ema50, 5);
    if (crossBarsAgo < 0) return null;

    const crossIndex = daily.length - 1 - crossBarsAgo;
    const crossVolume = daily[crossIndex].volume;
    const currentPrice = quote.price;
    const ema20Now = last(ema20);
    const ema50Now = last(ema50);
    const ema50Then = at(ema50, 10);
    const rsiNow = last(rsi14);
    const atrNow = last(atr14);

    const conditions: StrategyCondition[] = [
      condition(
        "20 EMA crossed above 50 EMA",
        true,
        `Crossed ${crossBarsAgo === 0 ? "today" : `${crossBarsAgo} session${crossBarsAgo === 1 ? "" : "s"} ago`} — 20 EMA ${money(ema20Now)} vs 50 EMA ${money(ema50Now)}`,
        3,
        true,
      ),
      condition(
        "Volume confirmed the cross",
        crossVolume > avgVolume,
        `${timesAverage(crossVolume, avgVolume)} on the crossover session`,
        2,
      ),
      condition(
        "Price holding above the 20 EMA",
        currentPrice > ema20Now,
        `${money(currentPrice)} vs 20 EMA ${money(ema20Now)}`,
        2,
      ),
      condition(
        "50 EMA sloping upward",
        Number.isFinite(ema50Then) && ema50Now > ema50Then,
        Number.isFinite(ema50Then)
          ? `50 EMA ${ema50Now > ema50Then ? "rose" : "fell"} ${(((ema50Now - ema50Then) / ema50Then) * 100).toFixed(2)}% over 10 sessions`
          : "Not enough history",
        1.5,
      ),
      condition(
        "RSI in the trending band (45–75)",
        rsiNow >= 45 && rsiNow <= 75,
        `RSI(14) at ${ratio(rsiNow, 1)}`,
        1.5,
      ),
      condition(
        "Weekly trend alignment",
        weeklyTrendUp,
        bundle.weekly.length >= 50 ? "Weekly 20 EMA > 50 EMA" : "Stock too new for weekly trend",
        1.5,
      ),
    ];

    if (!requiredConditionsMet(conditions)) return null;

    // Target: the first prior swing high overhead. If price is already at new
    // highs there is no overhead pivot, so use a measured move off the ATR.
    const swingTarget =
      nearestSwingHighAbove(daily, currentPrice) ?? currentPrice + atrNow * 4;
    const entry = sanitiseBand(longEntryBand(currentPrice, 1.6));
    const target = sanitiseBand(targetBand(swingTarget, 2.4));
    // Stop below the 50 EMA — a close under it kills the thesis. But when price
    // has already run well clear of the 50 EMA, that would risk far more than
    // the setup justifies, so cap the distance at the ATR-scaled stop.
    const stopLoss = round2(
      Math.max(ema50Now * 0.995, currentPrice - atrNow * thresholds.stopAtrMultiple),
    );

    // A stop inside the entry band, or a target overlapping it, is not a
    // tradeable setup — and `rewardToRisk` cannot see either, because it
    // works from midpoints. Must run before the reward-to-risk floor.
    if (!bandsAreOrdered(entry, target, stopLoss, "bullish")) return null;
    const rr = rewardToRisk(entry, target, stopLoss, "bullish");
    if (rr < minRewardRiskFor(thresholds, "swing")) return null;

    const confidence = scoreConditions(conditions);
    if (confidence < thresholds.minConfidence) return null;

    return {
      strategyId: maCrossover.id,
      ticker: instrument.ticker,
      style: "swing",
      direction: "bullish",
      confidence,
      conditions,
      reason:
        `${instrument.name.replace(/ Ltd$/, "")}'s 20-day average price has just crossed above its 50-day average` +
        `${crossVolume > avgVolume ? " on heavier-than-usual volume" : ""}, which usually marks the start of a fresh up-leg. ` +
        `The nearest overhead resistance sits around ${money(swingTarget)}, giving roughly ${ratio(rr, 1)}:1 reward for the risk taken.`,
      entry,
      target,
      stopLoss,
      holdDays: { min: 5, max: 15 },
      risk: riskFromStopDistance((entry.low + entry.high) / 2, stopLoss),
      metrics: [
        { label: "20 EMA", value: money(ema20Now) },
        { label: "50 EMA", value: money(ema50Now) },
        { label: "RSI(14)", value: ratio(rsiNow, 1) },
        { label: "Reward:Risk", value: `${ratio(rr, 1)}:1` },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// 2. RSI Reversal
// ---------------------------------------------------------------------------

const rsiReversal: Strategy = {
  id: "swing-rsi-reversal",
  name: "RSI Reversal",
  style: "swing",
  tagline: "RSI turning up from oversold with a confirming candle",
  holdPeriodLabel: "4–12 trading days",
  baseRisk: "Medium",
  explainer: {
    summary:
      "Looks for stocks that have been sold down to an extreme, then waits for momentum to actually turn before buying — never catching the falling knife.",
    origin:
      "J. Welles Wilder introduced the Relative Strength Index in his 1978 book New Concepts in Technical Trading Systems, with 30 and 70 as the conventional oversold and overbought boundaries. Wilder's own warning is the important part: an extreme reading is not a signal by itself, because a strong trend can stay oversold for weeks. The signal is the crossing back out of the extreme.",
    howItWorks: [
      "RSI(14) measures the ratio of average gains to average losses over 14 sessions on a 0–100 scale. Below 30 means selling has overwhelmingly dominated recent trade.",
      "The strategy waits for RSI to cross back up through the oversold line. That crossing says the balance of pressure has shifted, not merely that the stock is cheap relative to its recent range.",
      "A reversal candle — a hammer or a bullish engulfing bar — is required as price confirmation. Momentum indicators can turn on a small bounce; the candle demands that buyers actually closed the session in control.",
    ],
    signalConditions: [
      "RSI(14) crosses up through the oversold threshold within the last 3 sessions",
      "A hammer or bullish engulfing candle at the turn",
      "Volume on the reversal session above the 20-day average",
      "Price within 8% of a recent swing low — the bounce is off a real level",
      "The stock is not in freefall: the 50 EMA has not fallen more than 12% in 20 sessions",
    ],
    entryLogic:
      "Entry band spans the reversal candle's range. Buying the confirmation bar rather than the low means giving up the first few percent, which is the cost of not guessing.",
    exitLogic:
      "First target is the 20 EMA or the nearest overhead swing high, whichever is closer — oversold bounces typically stall at the mean. Stop goes below the reversal candle's low, since a break of that low means the turn failed.",
    worksBestWhen: [
      "The stock is fundamentally sound and the selloff was sentiment-driven",
      "The broader index is stable rather than in its own downtrend",
      "The oversold reading came from a sharp, fast drop rather than a long grind",
    ],
    failsWhen: [
      "The stock is in a structural downtrend — RSI can print oversold repeatedly all the way down",
      "There is unresolved bad news, where each bounce is sold into",
      "The bounce happens on light volume, indicating short covering rather than real accumulation",
    ],
    indicators: ["RSI(14)", "Candlestick reversal patterns", "20 EMA", "20-day average volume"],
  },

  evaluate({ bundle, thresholds }): StrategySignal | null {
    const { daily, quote, instrument } = bundle;
    if (daily.length < 60) return null;

    const price = closes(daily);
    const rsi14 = rsi(price, 14);
    const ema20 = ema(price, 20);
    const ema50 = ema(price, 50);
    const atr14 = atr(daily, 14);
    const avgVolume = averageVolume(daily, 20);
    const lastCandle = daily[daily.length - 1];

    const bullishCross = crossedAboveLevel(rsi14, thresholds.rsiOversold, 3);
    const bearishCross = crossedBelowLevel(rsi14, thresholds.rsiOverbought, 3);
    if (bullishCross < 0 && bearishCross < 0) return null;

    const isBullish = bullishCross >= 0;
    const barsAgo = isBullish ? bullishCross : bearishCross;
    const pattern = isBullish ? bullishReversalCandle(daily) : bearishReversalCandle(daily);
    const rsiNow = last(rsi14);
    const atrNow = last(atr14);
    const currentPrice = quote.price;

    const ema50Now = last(ema50);
    const ema50Then = at(ema50, 20);
    const trendDrop =
      Number.isFinite(ema50Then) && ema50Then !== 0 ? ((ema50Now - ema50Then) / ema50Then) * 100 : 0;

    const recentLow = lowestLow(daily, 20);
    const recentHigh = highestHigh(daily, 20);
    const nearLevel = isBullish
      ? ((currentPrice - recentLow) / recentLow) * 100 <= 8
      : ((recentHigh - currentPrice) / recentHigh) * 100 <= 8;

    const conditions: StrategyCondition[] = [
      condition(
        isBullish ? `RSI crossed up through ${thresholds.rsiOversold}` : `RSI crossed down through ${thresholds.rsiOverbought}`,
        true,
        `${barsAgo === 0 ? "Today" : `${barsAgo} session${barsAgo === 1 ? "" : "s"} ago`} — RSI(14) now ${ratio(rsiNow, 1)}`,
        3,
        true,
      ),
      condition(
        "Price confirmation candle",
        pattern !== null,
        pattern ? `${pattern.charAt(0).toUpperCase()}${pattern.slice(1)} on the latest session` : "No reversal pattern yet",
        2.5,
        true,
      ),
      condition(
        "Volume above average on the turn",
        lastCandle.volume > avgVolume,
        timesAverage(lastCandle.volume, avgVolume),
        1.5,
      ),
      condition(
        isBullish ? "Bouncing off a recent low" : "Rejecting a recent high",
        nearLevel,
        isBullish
          ? `${(((currentPrice - recentLow) / recentLow) * 100).toFixed(1)}% above the 20-day low of ${money(recentLow)}`
          : `${(((recentHigh - currentPrice) / recentHigh) * 100).toFixed(1)}% below the 20-day high of ${money(recentHigh)}`,
        1.5,
      ),
      condition(
        "Not in freefall",
        isBullish ? trendDrop > -12 : trendDrop < 12,
        `50 EMA moved ${trendDrop.toFixed(1)}% over 20 sessions`,
        1.5,
      ),
    ];

    if (!requiredConditionsMet(conditions)) return null;

    const ema20Now = last(ema20);
    let entry, target, stopLoss;

    if (isBullish) {
      const overhead = nearestSwingHighAbove(daily, currentPrice);
      // Oversold bounces typically stall at the mean, so aim at whichever comes
      // first: the 20 EMA or the nearest overhead pivot.
      const candidates = [ema20Now, overhead].filter(
        (v): v is number => v !== null && Number.isFinite(v) && v > currentPrice * 1.01,
      );
      const finalObjective =
        candidates.length > 0 ? Math.min(...candidates) : currentPrice + atrNow * 3;
      entry = sanitiseBand({ low: round2(lastCandle.low), high: round2(Math.max(lastCandle.close, currentPrice)) });
      target = sanitiseBand(targetBand(finalObjective, 2.6));
      stopLoss = round2(lastCandle.low - atrNow * 0.35);
    } else {
      const support = nearestSwingLowBelow(daily, currentPrice);
      const objective = support ?? currentPrice - atrNow * 3;
      entry = sanitiseBand({ low: round2(Math.min(lastCandle.close, currentPrice)), high: round2(lastCandle.high) });
      target = sanitiseBand(targetBand(objective, 2.6));
      stopLoss = round2(lastCandle.high + atrNow * 0.35);
    }

    // A stop inside the entry band, or a target overlapping it, is not a
    // tradeable setup — and `rewardToRisk` cannot see either, because it
    // works from midpoints. Must run before the reward-to-risk floor.
    if (!bandsAreOrdered(entry, target, stopLoss, isBullish ? "bullish" : "bearish")) return null;
    const rr = rewardToRisk(entry, target, stopLoss, isBullish ? "bullish" : "bearish");
    if (rr < minRewardRiskFor(thresholds, "swing")) return null;

    const confidence = scoreConditions(conditions);
    if (confidence < thresholds.minConfidence) return null;

    const shortName = instrument.name.replace(/ Ltd$/, "");

    return {
      strategyId: rsiReversal.id,
      ticker: instrument.ticker,
      style: "swing",
      direction: isBullish ? "bullish" : "bearish",
      confidence,
      conditions,
      reason: isBullish
        ? `${shortName} was sold down to an oversold RSI reading and has now turned back up, with a ${pattern} candle confirming buyers stepped in. ` +
          `Bounces from this condition typically run back toward ${money((target.low + target.high) / 2)} before meeting resistance.`
        : `${shortName} has rolled over from an overbought RSI reading with a ${pattern} candle. ` +
          `This is a caution signal — momentum has shifted against holders in the short term.`,
      entry,
      target,
      stopLoss,
      holdDays: { min: 4, max: 12 },
      risk: riskFromStopDistance((entry.low + entry.high) / 2, stopLoss),
      metrics: [
        { label: "RSI(14)", value: ratio(rsiNow, 1) },
        { label: "Pattern", value: pattern ?? "—" },
        { label: "20 EMA", value: money(ema20Now) },
        { label: "Reward:Risk", value: `${ratio(rr, 1)}:1` },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// 3. Breakout from Consolidation
// ---------------------------------------------------------------------------

const consolidationBreakout: Strategy = {
  id: "swing-consolidation-breakout",
  name: "Breakout from Consolidation",
  style: "swing",
  tagline: "Multi-week range broken on 1.5x+ volume",
  holdPeriodLabel: "6–20 trading days",
  baseRisk: "Medium",
  explainer: {
    summary:
      "Finds stocks that have gone quiet inside a tight multi-week range, then buys the session they break out of it on heavy volume.",
    origin:
      "The idea traces to Richard Wyckoff's accumulation model from the 1930s and was made concrete by Nicolas Darvas in the 1950s, who traded 'boxes' — ranges a stock built before its next advance. The underlying logic is that a long quiet period represents shares changing hands from impatient holders to patient ones; when supply is exhausted, it takes very little buying to move price sharply.",
    howItWorks: [
      "The strategy measures the high-low range of the last 20 sessions, excluding the most recent few, and checks it is tight relative to the stock's own volatility — typically under 12% top to bottom.",
      "It then requires price to close above the range high. A close matters more than an intraday poke through, which often reverses.",
      "Volume on the breakout must be at least 1.5x the 20-day average. Breakouts without volume are the single most common failure mode, because they indicate no new demand has arrived.",
      "The measured-move target adds the height of the range to the breakout point, on the reasoning that the energy stored in the base translates into a move of comparable size.",
    ],
    signalConditions: [
      "20-session range compressed to under 12% high-to-low",
      "Latest close above the consolidation high",
      "Breakout volume at or above the configured multiple of the 20-day average",
      "Price above the 50 EMA — breaking out within an uptrend, not a downtrend",
      "Breakout occurred within the last 4 sessions, so the entry is still fresh",
      "Weekly trend is aligned (Weekly 20 EMA > Weekly 50 EMA)",
    ],
    entryLogic:
      "Entry band is set at the retest zone just above the old range high. Broken resistance frequently becomes support, and waiting for that retest gives a tighter stop than buying the breakout candle's close.",
    exitLogic:
      "Target is a measured move: range height projected up from the breakout level. Stop sits back inside the range, below the breakout point — if price re-enters the base, the breakout has failed by definition.",
    worksBestWhen: [
      "The consolidation is long — several weeks rather than several days",
      "Volume dried up during the range and expanded sharply on the break",
      "The breakout aligns with sector strength rather than being an isolated move",
    ],
    failsWhen: [
      "Broader markets are volatile, producing frequent false breaks",
      "The range is too short to represent genuine accumulation",
      "The stock gaps far above the range, leaving no sensible stop placement",
    ],
    indicators: ["20-session price range", "20-day average volume", "50 EMA", "Measured move projection"],
  },

  evaluate({ bundle, thresholds }): StrategySignal | null {
    const { daily, quote, instrument } = bundle;
    if (daily.length < 70) return null;

    const price = closes(daily);
    const ema50 = ema(price, 50);
    const atr14 = atr(daily, 14);
    const avgVolume = averageVolume(daily, 20);
    const currentPrice = quote.price;

    const weeklyPrice = closes(bundle.weekly);
    const weeklyEma20 = ema(weeklyPrice, 20);
    const weeklyEma50 = ema(weeklyPrice, 50);
    const weeklyTrendUp = bundle.weekly.length >= 50 ? last(weeklyEma20) > last(weeklyEma50) : true;

    // Look for the break within the last 4 sessions; measure the base behind it.
    let breakoutBarsAgo = -1;
    let rangeHigh = NaN;
    let rangeLow = NaN;

    for (let back = 0; back <= 3; back++) {
      const breakIndex = daily.length - 1 - back;
      const baseEnd = breakIndex - 1;
      const baseStart = baseEnd - 19;
      if (baseStart < 0) break;

      const base = daily.slice(baseStart, baseEnd + 1);
      const high = Math.max(...base.map((c) => c.high));
      const low = Math.min(...base.map((c) => c.low));
      const tightness = ((high - low) / low) * 100;

      if (tightness <= 12 && daily[breakIndex].close > high) {
        breakoutBarsAgo = back;
        rangeHigh = high;
        rangeLow = low;
        break;
      }
    }

    if (breakoutBarsAgo < 0) return null;

    const breakoutIndex = daily.length - 1 - breakoutBarsAgo;
    const breakoutCandle = daily[breakoutIndex];
    const rangeHeight = rangeHigh - rangeLow;
    const tightnessPct = ((rangeHigh - rangeLow) / rangeLow) * 100;
    const ema50Now = last(ema50);
    const atrNow = last(atr14);

    const conditions: StrategyCondition[] = [
      condition(
        "Tight multi-week base",
        true,
        `20-session range of ${tightnessPct.toFixed(1)}% between ${money(rangeLow)} and ${money(rangeHigh)}`,
        2.5,
        true,
      ),
      condition(
        "Closed above the range high",
        true,
        `Broke out ${breakoutBarsAgo === 0 ? "today" : `${breakoutBarsAgo} session${breakoutBarsAgo === 1 ? "" : "s"} ago`} at ${money(breakoutCandle.close)}`,
        2.5,
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
        "Trading above the 50 EMA",
        currentPrice > ema50Now,
        `${money(currentPrice)} vs 50 EMA ${money(ema50Now)}`,
        2,
      ),
      condition(
        "Still near the breakout level",
        currentPrice <= rangeHigh * 1.06,
        `${(((currentPrice - rangeHigh) / rangeHigh) * 100).toFixed(1)}% above the breakout point`,
        1.5,
      ),
      condition(
        "Weekly trend alignment",
        weeklyTrendUp,
        bundle.weekly.length >= 50 ? "Weekly 20 EMA > 50 EMA" : "Stock too new for weekly trend",
        1.5,
      ),
    ];

    if (!requiredConditionsMet(conditions)) return null;

    // Retest entry: just above the old range high, which should now act as support.
    const retestAnchor = Math.max(rangeHigh * 1.004, currentPrice * 0.985);
    const entry = sanitiseBand({
      low: round2(rangeHigh * 1.001),
      high: round2(Math.max(retestAnchor, rangeHigh * 1.018)),
    });
    const measuredMove = rangeHigh + rangeHeight;
    const target = sanitiseBand(targetBand(measuredMove, 3));
    const stopLoss = round2(Math.min(rangeHigh * 0.978, rangeHigh - atrNow * 0.8));

    // A stop inside the entry band, or a target overlapping it, is not a
    // tradeable setup — and `rewardToRisk` cannot see either, because it
    // works from midpoints. Must run before the reward-to-risk floor.
    if (!bandsAreOrdered(entry, target, stopLoss, "bullish")) return null;
    const rr = rewardToRisk(entry, target, stopLoss, "bullish");
    if (rr < minRewardRiskFor(thresholds, "swing")) return null;

    const confidence = scoreConditions(conditions);
    if (confidence < thresholds.minConfidence) return null;

    return {
      strategyId: consolidationBreakout.id,
      ticker: instrument.ticker,
      style: "swing",
      direction: "bullish",
      confidence,
      conditions,
      reason:
        `${instrument.name.replace(/ Ltd$/, "")} spent several weeks trapped in a tight ${tightnessPct.toFixed(1)}% range and has now closed above it on ` +
        `${timesAverage(breakoutCandle.volume, avgVolume)}. That combination — a long quiet base broken on genuine volume — projects a measured move toward ${money(measuredMove)}.`,
      entry,
      target,
      stopLoss,
      holdDays: { min: 6, max: 20 },
      risk: riskFromStopDistance((entry.low + entry.high) / 2, stopLoss),
      metrics: [
        { label: "Range high", value: money(rangeHigh) },
        { label: "Range width", value: `${tightnessPct.toFixed(1)}%` },
        { label: "Breakout volume", value: timesAverage(breakoutCandle.volume, avgVolume) },
        { label: "Reward:Risk", value: `${ratio(rr, 1)}:1` },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// 4. Support / Resistance Bounce
// ---------------------------------------------------------------------------

const supportResistanceBounce: Strategy = {
  id: "swing-support-resistance-bounce",
  name: "Support / Resistance Bounce",
  style: "swing",
  tagline: "Reversal candle off a well-tested horizontal level",
  holdPeriodLabel: "4–14 trading days",
  baseRisk: "Low",
  explainer: {
    summary:
      "Identifies horizontal price levels a stock has repeatedly respected, then buys when it bounces off one with a clear reversal candle.",
    origin:
      "Horizontal support and resistance is the oldest concept in technical analysis, described in Edwards and Magee's Technical Analysis of Stock Trends (1948). Levels persist because market participants remember them: buyers who missed a bounce place orders there, and traders who bought at a prior high place stops just below it. The level works because enough people believe it does.",
    howItWorks: [
      "The strategy scans the last 120 sessions for swing pivots and clusters those within 2% of each other into zones. A zone touched three or more times is treated as significant.",
      "It then checks whether current price is sitting within roughly 3% of one of those zones.",
      "The entry trigger is a reversal candle at the level — a hammer or bullish engulfing bar — showing that the level is actively being defended right now, not merely that price happens to be nearby.",
      "The number of prior touches drives the confidence score, because a level defended four times has more evidence behind it than one defended twice.",
    ],
    signalConditions: [
      "A horizontal zone with at least 3 prior touches in the last 120 sessions",
      "Current price within 3% of that zone",
      "Hammer or bullish engulfing candle at the level",
      "Volume on the bounce session at or above the 20-day average",
      "Zone has not already been decisively broken on a closing basis",
    ],
    entryLogic:
      "Entry band spans the zone itself, from just above the level to the reversal candle's close. Buying inside the zone rather than after the bounce keeps the stop tight.",
    exitLogic:
      "Target is the next resistance zone overhead — the level where the previous bounce stalled. Stop goes below the support zone; if price closes beneath a level tested this many times, the character of the chart has changed.",
    worksBestWhen: [
      "The level is round, obvious and widely watched",
      "The stock is range-bound rather than trending hard in either direction",
      "Each prior touch produced a visible bounce rather than a slow grind through",
    ],
    failsWhen: [
      "A strong trend is in force — trending stocks slice through horizontal levels",
      "The level has been tested so many times it is close to exhaustion; each retest weakens it",
      "News breaks while price sits at the level, overwhelming the technical picture",
    ],
    indicators: ["Swing pivot clustering", "Candlestick reversal patterns", "20-day average volume"],
  },

  evaluate({ bundle, thresholds }): StrategySignal | null {
    const { daily, quote, instrument } = bundle;
    if (daily.length < 120) return null;

    const window = daily.slice(-120);
    const currentPrice = quote.price;
    const atr14 = atr(daily, 14);
    const atrNow = last(atr14);
    const avgVolume = averageVolume(daily, 20);
    const lastCandle = daily[daily.length - 1];

    const supportZones = findPriceZones(window, swingLows(window, 3), (c) => c.low, 0.02).filter(
      (z) => z.touches >= 3 && z.level < currentPrice * 1.03,
    );
    const resistanceZones = findPriceZones(window, swingHighs(window, 3), (c) => c.high, 0.02).filter(
      (z) => z.touches >= 2 && z.level > currentPrice * 1.01,
    );

    const support = supportZones
      .filter((z) => Math.abs(currentPrice - z.level) / z.level <= 0.03)
      .sort((a, b) => b.touches - a.touches)[0];

    if (!support) return null;

    const pattern = bullishReversalCandle(daily);
    const distancePct = ((currentPrice - support.level) / support.level) * 100;

    // A zone is spent if price has already closed well below it recently.
    const brokenDown = daily
      .slice(-5)
      .some((c) => c.close < support.level * 0.975);

    const conditions: StrategyCondition[] = [
      condition(
        "Well-tested support zone",
        support.touches >= 3,
        `${support.touches} touches at ${money(support.level)} over the last 120 sessions`,
        3,
        true,
      ),
      condition(
        "Price at the zone",
        Math.abs(distancePct) <= 3,
        `${distancePct >= 0 ? "" : ""}${distancePct.toFixed(1)}% from the level`,
        2,
        true,
      ),
      condition(
        "Reversal candle at the level",
        pattern !== null,
        pattern ? `${pattern.charAt(0).toUpperCase()}${pattern.slice(1)} on the latest session` : "No reversal pattern yet",
        2.5,
        true,
      ),
      condition(
        "Volume supports the bounce",
        lastCandle.volume >= avgVolume,
        timesAverage(lastCandle.volume, avgVolume),
        1.5,
      ),
      condition(
        "Zone still intact",
        !brokenDown,
        brokenDown ? "Price closed below the zone in the last 5 sessions" : "No closes below the zone recently",
        2,
        true,
      ),
    ];

    if (!requiredConditionsMet(conditions)) return null;

    // Take the nearest resistance that actually leaves room to make the trade
    // worthwhile. The most-tested zone is not necessarily the relevant one —
    // if it sits 2% overhead, the setup is a scalp, not a swing.
    const entryCeiling = Math.max(currentPrice, support.level * 1.022);
    const nextResistance =
      resistanceZones
        .filter((z) => z.level >= entryCeiling * 1.04)
        .sort((a, b) => a.level - b.level)[0]?.level ?? currentPrice + atrNow * 4;

    const entry = sanitiseBand({
      low: round2(support.level * 1.002),
      high: round2(entryCeiling),
    });
    const target = sanitiseBand(targetBand(nextResistance, 2.4));
    const stopLoss = round2(Math.min(support.level * 0.975, lastCandle.low - atrNow * 0.3));

    // A stop inside the entry band, or a target overlapping it, is not a
    // tradeable setup — and `rewardToRisk` cannot see either, because it
    // works from midpoints. Must run before the reward-to-risk floor.
    if (!bandsAreOrdered(entry, target, stopLoss, "bullish")) return null;
    const rr = rewardToRisk(entry, target, stopLoss, "bullish");
    if (rr < minRewardRiskFor(thresholds, "swing")) return null;

    const confidence = scoreConditions(conditions);
    if (confidence < thresholds.minConfidence) return null;

    return {
      strategyId: supportResistanceBounce.id,
      ticker: instrument.ticker,
      style: "swing",
      direction: "bullish",
      confidence,
      conditions,
      reason:
        `${instrument.name.replace(/ Ltd$/, "")} has bounced off ${money(support.level)} ${support.touches} separate times over the last six months, and price is back at that level now ` +
        `with a ${pattern} forming. The zone is being defended again, with the next overhead resistance near ${money(nextResistance)}.`,
      entry,
      target,
      stopLoss,
      holdDays: { min: 4, max: 14 },
      risk: riskFromStopDistance((entry.low + entry.high) / 2, stopLoss),
      metrics: [
        { label: "Support level", value: money(support.level) },
        { label: "Times tested", value: String(support.touches) },
        { label: "Pattern", value: pattern ?? "—" },
        { label: "Reward:Risk", value: `${ratio(rr, 1)}:1` },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// 5. MACD Signal Crossover
// ---------------------------------------------------------------------------

const macdCrossover: Strategy = {
  id: "swing-macd-crossover",
  name: "MACD Signal Crossover",
  style: "swing",
  tagline: "MACD crossing its signal line with trend alignment",
  holdPeriodLabel: "5–18 trading days",
  baseRisk: "Medium",
  explainer: {
    summary:
      "Buys when momentum turns positive — the MACD line crossing above its signal line — but only in stocks already trading above their 50-day trend line.",
    origin:
      "Gerald Appel developed the Moving Average Convergence Divergence indicator in the late 1970s. It measures the gap between a 12-period and a 26-period EMA; the 9-period signal line smooths that gap. A crossover therefore marks the point where the rate of change of the trend itself turns. The trend filter is a later refinement — taking MACD crosses in isolation produces a great many signals, most of them noise.",
    howItWorks: [
      "The MACD line is the 12 EMA minus the 26 EMA. When it rises, short-term momentum is accelerating relative to the medium term.",
      "The signal line is a 9-period EMA of the MACD line. A cross above it says momentum has turned up faster than its own recent average.",
      "The trend filter — price above the 50 EMA — is what separates this from a pure oscillator system. A bullish MACD cross beneath the 50 EMA is usually just a pause in a downtrend.",
      "A histogram that has been expanding for consecutive sessions adds confidence, since it shows the momentum shift is building rather than fading.",
    ],
    signalConditions: [
      "MACD line crosses above the signal line within the last 4 sessions",
      "Price trading above the 50 EMA for trend alignment",
      "MACD histogram expanding over the last 2 sessions",
      "The cross happens at or below the zero line — earlier in the move rather than late",
      "Volume at or above the 20-day average",
    ],
    entryLogic:
      "Entry band sits slightly below current price. MACD signals lag by design, so the first pullback after the cross is usually a better entry than the cross candle itself.",
    exitLogic:
      "Target is the nearest overhead swing high. Stop is placed at an ATR multiple below entry, scaled by the selected risk tolerance, and also kept below the 50 EMA where possible.",
    worksBestWhen: [
      "The stock has a smooth, liquid trend rather than a gappy chart",
      "The cross occurs below or near the zero line, catching the move early",
      "The broader sector is also turning up",
    ],
    failsWhen: [
      "Price is chopping sideways — MACD crosses back and forth repeatedly",
      "The cross happens far above the zero line, late in an extended move",
      "Trading a low-liquidity stock where the EMAs are distorted by erratic prints",
    ],
    indicators: ["MACD(12, 26, 9)", "MACD histogram", "50 EMA", "20-day average volume"],
  },

  evaluate({ bundle, thresholds }): StrategySignal | null {
    const { daily, quote, instrument } = bundle;
    if (daily.length < 80) return null;

    const price = closes(daily);
    const { macd: macdLine, signal, histogram } = macd(price, 12, 26, 9);
    const ema50 = ema(price, 50);
    const atr14 = atr(daily, 14);
    const avgVolume = averageVolume(daily, 20);
    const currentPrice = quote.price;

    const bullishCross = crossedAbove(macdLine, signal, 4);
    const bearishCross = crossedBelow(macdLine, signal, 4);
    if (bullishCross < 0 && bearishCross < 0) return null;

    const isBullish = bullishCross >= 0;
    const barsAgo = isBullish ? bullishCross : bearishCross;
    const ema50Now = last(ema50);
    const atrNow = last(atr14);
    const macdNow = last(macdLine);
    const histNow = at(histogram, 0);
    const histPrev = at(histogram, 1);
    const trendAligned = isBullish ? currentPrice > ema50Now : currentPrice < ema50Now;
    const lastCandle = daily[daily.length - 1];

    const conditions: StrategyCondition[] = [
      condition(
        isBullish ? "MACD crossed above signal" : "MACD crossed below signal",
        true,
        `${barsAgo === 0 ? "Today" : `${barsAgo} session${barsAgo === 1 ? "" : "s"} ago`} — MACD ${ratio(macdNow)} vs signal ${ratio(last(signal))}`,
        3,
        true,
      ),
      condition(
        isBullish ? "Price above the 50 EMA" : "Price below the 50 EMA",
        trendAligned,
        `${money(currentPrice)} vs 50 EMA ${money(ema50Now)}`,
        3,
        true,
      ),
      condition(
        "Histogram expanding",
        Number.isFinite(histNow) && Number.isFinite(histPrev) && Math.abs(histNow) > Math.abs(histPrev),
        `Histogram ${ratio(histPrev, 3)} → ${ratio(histNow, 3)}`,
        2,
      ),
      condition(
        isBullish ? "Cross near or below the zero line" : "Cross near or above the zero line",
        isBullish ? macdNow <= Math.abs(macdNow) * 0.5 || macdNow < 0 : macdNow > 0,
        `MACD at ${ratio(macdNow, 3)}`,
        1.5,
      ),
      condition(
        "Volume at or above average",
        lastCandle.volume >= avgVolume,
        timesAverage(lastCandle.volume, avgVolume),
        1.5,
      ),
    ];

    if (!requiredConditionsMet(conditions)) return null;

    let entry, target, stopLoss;
    if (isBullish) {
      const overhead = nearestSwingHighAbove(daily, currentPrice) ?? currentPrice + atrNow * 4;
      entry = sanitiseBand(longEntryBand(currentPrice, 1.8));
      target = sanitiseBand(targetBand(overhead, 2.6));
      // Prefer a stop under the 50 EMA, but never risk more than the
      // ATR-scaled distance the risk tolerance allows.
      stopLoss = round2(
        Math.max(currentPrice - atrNow * thresholds.stopAtrMultiple, ema50Now * 0.99),
      );
    } else {
      const below = nearestSwingLowBelow(daily, currentPrice) ?? currentPrice - atrNow * 4;
      entry = sanitiseBand(shortEntryBand(currentPrice, 1.8));
      target = sanitiseBand(targetBand(below, 2.6));
      stopLoss = round2(
        Math.min(currentPrice + atrNow * thresholds.stopAtrMultiple, ema50Now * 1.01),
      );
    }

    // A stop inside the entry band, or a target overlapping it, is not a
    // tradeable setup — and `rewardToRisk` cannot see either, because it
    // works from midpoints. Must run before the reward-to-risk floor.
    if (!bandsAreOrdered(entry, target, stopLoss, isBullish ? "bullish" : "bearish")) return null;
    const rr = rewardToRisk(entry, target, stopLoss, isBullish ? "bullish" : "bearish");
    if (rr < minRewardRiskFor(thresholds, "swing")) return null;

    const confidence = scoreConditions(conditions);
    if (confidence < thresholds.minConfidence) return null;

    const shortName = instrument.name.replace(/ Ltd$/, "");

    return {
      strategyId: macdCrossover.id,
      ticker: instrument.ticker,
      style: "swing",
      direction: isBullish ? "bullish" : "bearish",
      confidence,
      conditions,
      reason: isBullish
        ? `Momentum in ${shortName} has turned up: the MACD line crossed above its signal line ${barsAgo === 0 ? "today" : `${barsAgo} session${barsAgo === 1 ? "" : "s"} ago`}, ` +
          `and price is holding above its 50-day trend line at ${money(ema50Now)}. Both the short-term and medium-term pictures now point the same way.`
        : `Momentum in ${shortName} has rolled over — MACD crossed below its signal line while price sits under the 50-day trend line. This is a caution signal for existing holders.`,
      entry,
      target,
      stopLoss,
      holdDays: { min: 5, max: 18 },
      risk: riskFromStopDistance((entry.low + entry.high) / 2, stopLoss),
      metrics: [
        { label: "MACD", value: ratio(macdNow, 3) },
        { label: "Signal", value: ratio(last(signal), 3) },
        { label: "50 EMA", value: money(ema50Now) },
        { label: "Reward:Risk", value: `${ratio(rr, 1)}:1` },
      ],
    };
  },
};

export const SWING_STRATEGIES: Strategy[] = [
  maCrossover,
  rsiReversal,
  consolidationBreakout,
  supportResistanceBounce,
  macdCrossover,
];
