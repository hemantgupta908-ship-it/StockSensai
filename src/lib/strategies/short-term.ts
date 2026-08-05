import {
  atr,
  averageVolume,
  bollinger,
  closes,
  ema,
  last,
  lowestLow,
  percentChange,
  rsi,
  sessionVwap,
} from "@/lib/indicators";
import {
  condition,
  latestSession,
  longEntryBand,
  money,
  previousSession,
  ratio,
  sanitiseBand,
  targetBand,
  timesAverage,
} from "./helpers";
import {
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
 * Short-term strategies — intraday to a couple of sessions.
 *
 * Four of the five need intraday bars. When the active provider supplies none
 * (or the market has not opened yet) those strategies stand down rather than
 * approximating from daily data, which would silently change what they mean.
 */

// ---------------------------------------------------------------------------
// 1. Gap Up / Down Continuation
// ---------------------------------------------------------------------------

const gapContinuation: Strategy = {
  id: "st-gap-continuation",
  name: "Gap Up / Down Continuation",
  style: "short-term",
  tagline: "Significant gap that keeps running past the first 30 minutes",
  holdPeriodLabel: "1–3 trading days",
  baseRisk: "High",
  explainer: {
    summary:
      "Trades stocks that open sharply away from the previous close on news or results, and then keep moving in the direction of the gap instead of filling it.",
    origin:
      "Gap trading became a distinct discipline with the rise of electronic order books, though the underlying observation is older: a gap represents information that arrived while the market was shut, and it cannot be traded through gradually. The key statistical distinction is between gaps that fill — price returning to the prior close — and gaps that continue. Volume and the behaviour of the first half-hour are the practical discriminators.",
    howItWorks: [
      "The strategy requires a gap of at least 1.5% between the previous close and the opening print. Smaller gaps are ordinary overnight drift and carry no information.",
      "It then measures the first 30 minutes of trade — six five-minute bars — and treats that as the opening range.",
      "Continuation is confirmed only when price trades beyond the opening range in the direction of the gap. A gap up that spends the morning sinking back into its opening range is a fill setup, not a continuation setup, and produces no signal.",
      "Volume must be running well above normal, because a gap on ordinary volume usually means nobody of consequence traded it.",
    ],
    signalConditions: [
      "Opening gap of at least 1.5% versus the previous close",
      "Price beyond the first 30-minute range in the gap direction",
      "Session volume tracking above the 20-day average",
      "The gap has not been filled back to the previous close",
      "Close in the upper (or lower) third of the session range, showing the direction held",
    ],
    entryLogic:
      "Entry band spans the opening-range boundary that was broken. Once that level gives way it tends to act as a floor for the rest of the session, so it is both the trigger and the reference for risk.",
    exitLogic:
      "Target projects the gap's own size beyond the opening range, on the reasoning that the repricing event has a scale and the move often extends by a comparable amount. Stop is the opposite side of the opening range — re-entering it means the continuation has failed.",
    worksBestWhen: [
      "The gap follows a genuine catalyst: results, an order win, a rating change",
      "Volume in the first hour is a large multiple of normal",
      "The broader index is moving the same way, not fighting the gap",
    ],
    failsWhen: [
      "The gap is small or has no identifiable cause — those fill more often than not",
      "The stock gaps into a major prior level, which caps the move immediately",
      "Liquidity is thin, making the opening range unreliable and slippage expensive",
    ],
    indicators: ["Opening gap percentage", "First 30-minute range", "Relative volume"],
  },

  evaluate({ bundle, thresholds }): StrategySignal | null {
    const { daily, intraday, quote, instrument } = bundle;
    const session = latestSession(intraday);
    if (!session || daily.length < 30) return null;

    const prevDaily = daily[daily.length - 2];
    if (!prevDaily) return null;

    const sessionOpen = session[0].open;
    const gapPct = ((sessionOpen - prevDaily.close) / prevDaily.close) * 100;
    if (Math.abs(gapPct) < 1.5) return null;

    const isUp = gapPct > 0;
    const openingRange = session.slice(0, 6); // first 30 minutes
    const orHigh = Math.max(...openingRange.map((c) => c.high));
    const orLow = Math.min(...openingRange.map((c) => c.low));

    const after = session.slice(6);
    if (after.length === 0) return null;

    const brokeOut = isUp
      ? Math.max(...after.map((c) => c.high)) > orHigh
      : Math.min(...after.map((c) => c.low)) < orLow;

    const sessionVolume = session.reduce((sum, c) => sum + c.volume, 0);
    const avgVolume = averageVolume(daily, 20);
    const sessionHigh = Math.max(...session.map((c) => c.high));
    const sessionLow = Math.min(...session.map((c) => c.low));
    const currentPrice = quote.price;
    const closePosition =
      sessionHigh > sessionLow ? (currentPrice - sessionLow) / (sessionHigh - sessionLow) : 0.5;

    const gapFilled = isUp ? currentPrice <= prevDaily.close : currentPrice >= prevDaily.close;

    const conditions: StrategyCondition[] = [
      condition(
        `Gapped ${isUp ? "up" : "down"} ${Math.abs(gapPct).toFixed(1)}%`,
        true,
        `Opened at ${money(sessionOpen)} against a previous close of ${money(prevDaily.close)}`,
        3,
        true,
      ),
      condition(
        "Broke the first 30-minute range",
        brokeOut,
        `Opening range ${money(orLow)} – ${money(orHigh)}`,
        3,
        true,
      ),
      condition(
        "Volume above average",
        sessionVolume >= avgVolume * thresholds.volumeSurgeMultiple,
        timesAverage(sessionVolume, avgVolume),
        2.5,
      ),
      condition(
        "Gap not filled",
        !gapFilled,
        gapFilled ? "Price has returned to the previous close" : `Holding ${Math.abs(((currentPrice - prevDaily.close) / prevDaily.close) * 100).toFixed(1)}% from the previous close`,
        2,
        true,
      ),
      condition(
        `Closing in the ${isUp ? "upper" : "lower"} third of the range`,
        isUp ? closePosition >= 0.66 : closePosition <= 0.34,
        `Sitting at ${(closePosition * 100).toFixed(0)}% of the session range`,
        1.5,
      ),
    ];

    if (!requiredConditionsMet(conditions)) return null;

    const gapSize = Math.abs(sessionOpen - prevDaily.close);
    let entry, target, stopLoss;

    if (isUp) {
      // Pinned to the opening-range boundary rather than the current price —
      // see the note in the opening-range strategy.
      entry = sanitiseBand({ low: round2(orHigh * 0.999), high: round2(orHigh * 1.008) });
      target = sanitiseBand(targetBand(orHigh + gapSize * 1.5, 2));
      stopLoss = round2(orLow * 0.997);
    } else {
      entry = sanitiseBand({ low: round2(orLow * 0.992), high: round2(orLow * 1.001) });
      target = sanitiseBand(targetBand(orLow - gapSize * 1.5, 2));
      stopLoss = round2(orHigh * 1.003);
    }

    const rr = rewardToRisk(entry, target, stopLoss, isUp ? "bullish" : "bearish");
    if (rr < minRewardRiskFor(thresholds, "short-term")) return null;

    const confidence = scoreConditions(conditions);
    if (confidence < thresholds.minConfidence) return null;

    const shortName = instrument.name.replace(/ Ltd$/, "");

    return {
      strategyId: gapContinuation.id,
      ticker: instrument.ticker,
      style: "short-term",
      direction: isUp ? "bullish" : "bearish",
      confidence,
      conditions,
      reason: isUp
        ? `${shortName} opened ${Math.abs(gapPct).toFixed(1)}% above its previous close and, rather than filling the gap, pushed above its first 30-minute high on ${timesAverage(sessionVolume, avgVolume)}. ` +
          `Gaps that hold their opening range through the morning tend to carry into the next session.`
        : `${shortName} gapped down ${Math.abs(gapPct).toFixed(1)}% and has continued lower, breaking beneath its opening range. This is a caution signal — sellers are in control of the session.`,
      entry,
      target,
      stopLoss,
      holdDays: { min: 1, max: 3 },
      risk: riskFromStopDistance((entry.low + entry.high) / 2, stopLoss),
      metrics: [
        { label: "Gap", value: `${gapPct >= 0 ? "+" : ""}${gapPct.toFixed(1)}%` },
        { label: "Opening range", value: `${money(orLow)} – ${money(orHigh)}` },
        { label: "Rel. volume", value: timesAverage(sessionVolume, avgVolume) },
        { label: "Reward:Risk", value: `${ratio(rr, 1)}:1` },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// 2. VWAP Momentum
// ---------------------------------------------------------------------------

const vwapMomentum: Strategy = {
  id: "st-vwap-momentum",
  name: "VWAP Momentum",
  style: "short-term",
  tagline: "Holding above session VWAP on strong relative volume",
  holdPeriodLabel: "1–2 trading days",
  baseRisk: "Medium",
  explainer: {
    summary:
      "Follows stocks that spend the session trading above their volume-weighted average price — the benchmark institutions measure their own fills against.",
    origin:
      "VWAP exists because large institutions cannot buy a position in one trade. A fund accumulating over a day is judged on whether it beat the day's volume-weighted average price, so VWAP became a genuine reference point rather than merely a chart line. When a stock holds above VWAP all session, every institutional buyer that day is in profit and every seller is not — which tends to be self-reinforcing.",
    howItWorks: [
      "VWAP is the cumulative value traded divided by cumulative volume, reset at each session open. Unlike a moving average, it weights every price by how much actually changed hands there.",
      "The strategy requires price to have spent at least 70% of the session's bars above VWAP, not merely to be above it right now — persistence is the signal.",
      "Relative volume must be elevated. VWAP on a quiet day describes very little because the average is built from too few trades.",
      "The distance of price above VWAP is capped: a stock 6% above its VWAP is extended, and entering there means taking on the entire pullback risk.",
    ],
    signalConditions: [
      "Price above session VWAP right now",
      "At least 70% of the session's bars closed above VWAP",
      "Session volume above the 20-day average",
      "Price not more than 5% extended above VWAP",
      "The session's low held above the previous session's VWAP region",
    ],
    entryLogic:
      "Entry band sits between VWAP and current price. VWAP is where buyers have repeatedly stepped in during the session, so a drift back toward it is the natural place to add rather than chase.",
    exitLogic:
      "Target is a projection of the session's range above the high. Stop sits below VWAP — losing VWAP means the institutional bid that defined the session has gone.",
    worksBestWhen: [
      "The stock is liquid enough for VWAP to be statistically meaningful",
      "There is a clear intraday trend rather than a wide, choppy range",
      "The session's volume is genuinely elevated versus its own recent norm",
    ],
    failsWhen: [
      "The stock is range-bound around VWAP, producing repeated whipsaws",
      "Volume is thin, letting a handful of trades distort the average",
      "Entering late in the session, when there is little time left for the move to develop",
    ],
    indicators: ["Session-anchored VWAP", "Relative volume", "Session range"],
  },

  evaluate({ bundle, thresholds }): StrategySignal | null {
    const { daily, intraday, quote, instrument } = bundle;
    const session = latestSession(intraday);
    if (!session || daily.length < 30) return null;

    const vwapSeries = sessionVwap(session);
    const vwapNow = last(vwapSeries);
    if (!Number.isFinite(vwapNow)) return null;

    const barsAbove = session.filter((c, i) => Number.isFinite(vwapSeries[i]) && c.close > vwapSeries[i]).length;
    const shareAbove = barsAbove / session.length;

    const currentPrice = quote.price;
    const isAbove = currentPrice > vwapNow;
    if (!isAbove || shareAbove < 0.6) return null;

    const extensionPct = ((currentPrice - vwapNow) / vwapNow) * 100;
    const sessionVolume = session.reduce((sum, c) => sum + c.volume, 0);
    const avgVolume = averageVolume(daily, 20);
    const sessionHigh = Math.max(...session.map((c) => c.high));
    const sessionLow = Math.min(...session.map((c) => c.low));

    const prev = previousSession(intraday);
    const prevVwap = prev ? last(sessionVwap(prev)) : NaN;

    const conditions: StrategyCondition[] = [
      condition(
        "Trading above session VWAP",
        true,
        `${money(currentPrice)} vs VWAP ${money(vwapNow)}`,
        3,
        true,
      ),
      condition(
        "Held above VWAP through the session",
        shareAbove >= 0.75,
        `${(shareAbove * 100).toFixed(0)}% of session bars closed above VWAP`,
        3,
        true,
      ),
      condition(
        "Relative volume elevated",
        sessionVolume >= avgVolume * thresholds.volumeSurgeMultiple,
        timesAverage(sessionVolume, avgVolume),
        2.5,
        // Required: VWAP computed from a quiet session describes almost
        // nothing, and without this gate the screen returns a third of the
        // universe on any mildly positive day.
        true,
      ),
      condition(
        "Not overextended from VWAP",
        extensionPct <= 5,
        `${extensionPct.toFixed(2)}% above VWAP`,
        2,
        true,
      ),
      condition(
        "Above the previous session's VWAP",
        Number.isFinite(prevVwap) ? currentPrice > prevVwap : false,
        Number.isFinite(prevVwap) ? `Previous VWAP ${money(prevVwap)}` : "No previous session data",
        1.5,
      ),
    ];

    if (!requiredConditionsMet(conditions)) return null;

    const sessionRange = sessionHigh - sessionLow;
    const entry = sanitiseBand({
      low: round2(vwapNow * 1.001),
      high: round2(Math.max(currentPrice, vwapNow * 1.012)),
    });
    const target = sanitiseBand(targetBand(sessionHigh + sessionRange * 0.75, 1.8));
    const stopLoss = round2(vwapNow * 0.994);

    const rr = rewardToRisk(entry, target, stopLoss, "bullish");
    if (rr < minRewardRiskFor(thresholds, "short-term")) return null;

    const confidence = scoreConditions(conditions);
    if (confidence < thresholds.minConfidence) return null;

    return {
      strategyId: vwapMomentum.id,
      ticker: instrument.ticker,
      style: "short-term",
      direction: "bullish",
      confidence,
      conditions,
      reason:
        `${instrument.name.replace(/ Ltd$/, "")} has traded above its volume-weighted average price for ${(shareAbove * 100).toFixed(0)}% of the session on ${timesAverage(sessionVolume, avgVolume)}. ` +
        `VWAP at ${money(vwapNow)} is where the session's buyers have been defending, and price has not lost it.`,
      entry,
      target,
      stopLoss,
      holdDays: { min: 1, max: 2 },
      risk: riskFromStopDistance((entry.low + entry.high) / 2, stopLoss),
      metrics: [
        { label: "VWAP", value: money(vwapNow) },
        { label: "Bars above VWAP", value: `${(shareAbove * 100).toFixed(0)}%` },
        { label: "Rel. volume", value: timesAverage(sessionVolume, avgVolume) },
        { label: "Reward:Risk", value: `${ratio(rr, 1)}:1` },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// 3. Bollinger Band Squeeze Breakout
// ---------------------------------------------------------------------------

const bollingerSqueeze: Strategy = {
  id: "st-bollinger-squeeze",
  name: "Bollinger Band Squeeze Breakout",
  style: "short-term",
  tagline: "Bands at a multi-week low, then expansion on volume",
  holdPeriodLabel: "2–6 trading days",
  baseRisk: "Medium",
  explainer: {
    summary:
      "Finds stocks whose volatility has collapsed to a multi-week low, then trades the expansion when price finally breaks out of the compressed bands.",
    origin:
      "John Bollinger designed his bands in the early 1980s as a volatility envelope: a moving average plus and minus two standard deviations of price. His central observation, which he called The Squeeze, is that volatility is mean-reverting — periods of unusually low volatility are reliably followed by periods of high volatility. Notably, the squeeze predicts that a large move is coming without predicting its direction; the breakout supplies that.",
    howItWorks: [
      "Bandwidth is the distance between the upper and lower band divided by the middle band. It is a pure measure of how volatile the stock has recently been, normalised for price.",
      "The strategy requires current bandwidth to sit in the bottom 20% of its readings over the last 60 sessions — a genuine multi-week compression, not a mildly quiet week.",
      "The trigger is a close outside the band with volume expansion. Because the squeeze is directionally neutral, the breakout itself supplies the direction.",
      "Volume confirmation is essential here. Price can leak outside a very narrow band on no volume at all, and those breaks reverse immediately.",
    ],
    signalConditions: [
      "Bollinger bandwidth in the bottom 20% of its 60-session range",
      "Latest close above the upper band (or below the lower band)",
      "Volume at or above the configured multiple of the 20-day average",
      "Bandwidth now expanding versus the prior session",
      "Price above the 20-period middle band, confirming direction",
    ],
    entryLogic:
      "Entry band spans the middle band to current price. Squeeze breakouts often retest the upper band from above within a session or two, and that retest is a cleaner entry.",
    exitLogic:
      "Target is the squeeze range projected from the breakout point — compressed volatility tends to resolve into a move at least as large as the compression itself. Stop sits at the middle band, since falling back inside means the expansion has aborted.",
    worksBestWhen: [
      "The squeeze has lasted several weeks rather than a few days",
      "The breakout direction agrees with the stock's larger trend",
      "Volume expands dramatically rather than incrementally",
    ],
    failsWhen: [
      "The stock is structurally low-volatility, so a squeeze reading means little",
      "The break occurs on an ex-dividend or index-rebalance print rather than real demand",
      "The move exhausts within a single session, leaving the entry stranded",
    ],
    indicators: ["Bollinger Bands(20, 2)", "Bandwidth percentile", "20-day average volume"],
  },

  evaluate({ bundle, thresholds }): StrategySignal | null {
    const { daily, quote, instrument } = bundle;
    if (daily.length < 90) return null;

    const price = closes(daily);
    const { upper, middle, lower, bandwidth } = bollinger(price, 20, 2);
    const avgVolume = averageVolume(daily, 20);
    const lastCandle = daily[daily.length - 1];
    const currentPrice = quote.price;

    const recentBandwidth = bandwidth.slice(-60).filter(Number.isFinite);
    if (recentBandwidth.length < 40) return null;

    const bwNow = last(bandwidth);
    const bwPrev = bandwidth[bandwidth.length - 2];
    const sorted = [...recentBandwidth].sort((a, b) => a - b);
    // Compare against the squeeze reading a few bars back — by the time price
    // breaks out, bandwidth is already expanding again.
    const bwAtSqueeze = Math.min(...bandwidth.slice(-6, -1).filter(Number.isFinite));
    const percentileCutoff = sorted[Math.floor(sorted.length * 0.2)];
    const wasSqueezed = Number.isFinite(bwAtSqueeze) && bwAtSqueeze <= percentileCutoff;

    const upperNow = last(upper);
    const middleNow = last(middle);
    const lowerNow = last(lower);
    const brokeUp = lastCandle.close > upperNow;
    const brokeDown = lastCandle.close < lowerNow;

    if (!wasSqueezed || (!brokeUp && !brokeDown)) return null;

    const isBullish = brokeUp;
    const squeezeRange = upperNow - lowerNow;

    const conditions: StrategyCondition[] = [
      condition(
        "Bands squeezed to a multi-week low",
        true,
        `Bandwidth reached ${(bwAtSqueeze * 100).toFixed(2)}%, inside the quietest 20% of the last 60 sessions`,
        3,
        true,
      ),
      condition(
        `Closed ${isBullish ? "above the upper" : "below the lower"} band`,
        true,
        `${money(lastCandle.close)} vs ${isBullish ? `upper ${money(upperNow)}` : `lower ${money(lowerNow)}`}`,
        3,
        true,
      ),
      condition(
        `Volume ≥ ${thresholds.volumeSurgeMultiple}x average`,
        lastCandle.volume >= avgVolume * thresholds.volumeSurgeMultiple,
        timesAverage(lastCandle.volume, avgVolume),
        3,
        true,
      ),
      condition(
        "Bandwidth expanding",
        Number.isFinite(bwPrev) && bwNow > bwPrev,
        `Bandwidth ${(bwPrev * 100).toFixed(2)}% → ${(bwNow * 100).toFixed(2)}%`,
        2,
      ),
      condition(
        `Price ${isBullish ? "above" : "below"} the middle band`,
        isBullish ? currentPrice > middleNow : currentPrice < middleNow,
        `Middle band at ${money(middleNow)}`,
        1.5,
      ),
    ];

    if (!requiredConditionsMet(conditions)) return null;

    let entry, target, stopLoss;
    if (isBullish) {
      entry = sanitiseBand({ low: round2(Math.max(middleNow, currentPrice * 0.982)), high: round2(currentPrice * 1.004) });
      target = sanitiseBand(targetBand(upperNow + squeezeRange * 1.1, 2.2));
      stopLoss = round2(middleNow * 0.992);
    } else {
      entry = sanitiseBand({ low: round2(currentPrice * 0.996), high: round2(Math.min(middleNow, currentPrice * 1.018)) });
      target = sanitiseBand(targetBand(lowerNow - squeezeRange * 1.1, 2.2));
      stopLoss = round2(middleNow * 1.008);
    }

    const rr = rewardToRisk(entry, target, stopLoss, isBullish ? "bullish" : "bearish");
    if (rr < minRewardRiskFor(thresholds, "short-term")) return null;

    const confidence = scoreConditions(conditions);
    if (confidence < thresholds.minConfidence) return null;

    const shortName = instrument.name.replace(/ Ltd$/, "");

    return {
      strategyId: bollingerSqueeze.id,
      ticker: instrument.ticker,
      style: "short-term",
      direction: isBullish ? "bullish" : "bearish",
      confidence,
      conditions,
      reason: isBullish
        ? `Volatility in ${shortName} collapsed to its quietest level in three months, and price has now broken out above the upper Bollinger band on ${timesAverage(lastCandle.volume, avgVolume)}. ` +
          `Compressed volatility usually resolves into a move of similar scale to the compression.`
        : `${shortName} has broken down out of a multi-week volatility squeeze on heavy volume. This is a caution signal — the resolution has come to the downside.`,
      entry,
      target,
      stopLoss,
      holdDays: { min: 2, max: 6 },
      risk: riskFromStopDistance((entry.low + entry.high) / 2, stopLoss),
      metrics: [
        { label: "Bandwidth", value: `${(bwNow * 100).toFixed(2)}%` },
        { label: "Upper band", value: money(upperNow) },
        { label: "Middle band", value: money(middleNow) },
        { label: "Reward:Risk", value: `${ratio(rr, 1)}:1` },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// 4. Relative Strength vs NIFTY 50
// ---------------------------------------------------------------------------

const relativeStrength: Strategy = {
  id: "st-relative-strength",
  name: "Relative Strength vs NIFTY",
  style: "short-term",
  tagline: "Outperforming the index by a clear margin over 5 sessions",
  holdPeriodLabel: "2–5 trading days",
  baseRisk: "Medium",
  explainer: {
    summary:
      "Compares each stock's five-day move against the NIFTY 50's, surfacing the names money is actively rotating into.",
    origin:
      "Relative strength as an investment concept dates to H.M. Gartley in the 1930s and was given empirical weight by Jegadeesh and Titman's 1993 study showing that stocks outperforming over three to twelve months tended to keep doing so. The short-horizon version used here is a sector-rotation tool rather than a momentum-factor model: over a single week, persistent outperformance usually means institutional accumulation is under way.",
    howItWorks: [
      "The strategy computes the stock's percentage change over the last five sessions and subtracts the NIFTY 50's change over the same window. The difference is the relative-strength spread.",
      "A spread wider than the configured margin — three percentage points at moderate risk tolerance — indicates the move is stock-specific rather than the whole market drifting up.",
      "A rising 20 EMA is required so the outperformance sits inside an established uptrend rather than being a one-day spike off a low base.",
      "Volume expansion supports the case that the outperformance is being driven by real accumulation.",
    ],
    signalConditions: [
      "Five-session return exceeds NIFTY 50's by the configured margin",
      "Stock's own five-session return is positive",
      "Price trading above a rising 20 EMA",
      "Volume above the 20-day average",
      "RSI(14) below 80 — outperforming but not yet blown off",
    ],
    entryLogic:
      "Entry band sits just below current price, around the 20 EMA where pullbacks in a leading stock are typically bought.",
    exitLogic:
      "Target extends the recent five-session move by roughly two thirds. Stop goes below the five-session low, which marks the point where the outperformance narrative breaks.",
    worksBestWhen: [
      "A clear sector rotation is under way and the stock is a leader within it",
      "The index itself is flat or mildly positive, so the spread is genuine alpha",
      "Outperformance is steady across several sessions rather than one gap",
    ],
    failsWhen: [
      "The whole market is rallying hard, making relative comparisons less meaningful",
      "Outperformance comes from a single news-driven session that then mean-reverts",
      "The stock is already extended, with the spread reflecting a move that is over",
    ],
    indicators: ["5-session relative return vs NIFTY 50", "20 EMA", "RSI(14)", "20-day average volume"],
  },

  evaluate({ bundle, thresholds }): StrategySignal | null {
    const { daily, benchmarkDaily, quote, instrument } = bundle;
    if (daily.length < 40 || benchmarkDaily.length < 10) return null;

    const price = closes(daily);
    const benchmark = closes(benchmarkDaily);
    const stockReturn = percentChange(price, 5);
    const indexReturn = percentChange(benchmark, 5);
    if (!Number.isFinite(stockReturn) || !Number.isFinite(indexReturn)) return null;

    const spread = stockReturn - indexReturn;
    if (spread < thresholds.relativeStrengthMargin || stockReturn <= 0) return null;

    const ema20 = ema(price, 20);
    const ema20Now = last(ema20);
    const ema20Prev = ema20[ema20.length - 6];
    const rsi14 = rsi(price, 14);
    const rsiNow = last(rsi14);
    const avgVolume = averageVolume(daily, 20);
    const lastCandle = daily[daily.length - 1];
    const currentPrice = quote.price;
    const fiveDayLow = lowestLow(daily, 5);
    const atrNow = last(atr(daily, 14));

    const conditions: StrategyCondition[] = [
      condition(
        `Outperforming NIFTY by ≥ ${thresholds.relativeStrengthMargin}pp`,
        true,
        `${stockReturn.toFixed(1)}% vs NIFTY ${indexReturn.toFixed(1)}% over 5 sessions (spread ${spread.toFixed(1)}pp)`,
        3,
        true,
      ),
      condition(
        "Positive absolute return",
        stockReturn > 0,
        `Up ${stockReturn.toFixed(1)}% over 5 sessions`,
        2,
        true,
      ),
      condition(
        "Above a rising 20 EMA",
        currentPrice > ema20Now && Number.isFinite(ema20Prev) && ema20Now > ema20Prev,
        `20 EMA ${money(ema20Now)}, ${Number.isFinite(ema20Prev) && ema20Now > ema20Prev ? "rising" : "flat or falling"}`,
        2.5,
      ),
      condition(
        "Volume above average",
        lastCandle.volume >= avgVolume,
        timesAverage(lastCandle.volume, avgVolume),
        1.5,
      ),
      condition(
        "Not blown off (RSI < 80)",
        rsiNow < 80,
        `RSI(14) at ${ratio(rsiNow, 1)}`,
        1.5,
      ),
    ];

    if (!requiredConditionsMet(conditions)) return null;

    const entry = sanitiseBand(longEntryBand(currentPrice, 1.6, 0.5));
    const projected = currentPrice * (1 + (stockReturn / 100) * 0.65);
    const target = sanitiseBand(targetBand(projected, 2));
    // After a fast five-day run the five-day low can sit 10%+ below spot, which
    // would risk far more than the trade is worth. Cap at the ATR-scaled stop.
    const stopLoss = round2(
      Math.max(fiveDayLow * 0.995, currentPrice - atrNow * thresholds.stopAtrMultiple),
    );

    const rr = rewardToRisk(entry, target, stopLoss, "bullish");
    if (rr < minRewardRiskFor(thresholds, "short-term")) return null;

    const confidence = scoreConditions(conditions);
    if (confidence < thresholds.minConfidence) return null;

    return {
      strategyId: relativeStrength.id,
      ticker: instrument.ticker,
      style: "short-term",
      direction: "bullish",
      confidence,
      conditions,
      reason:
        `${instrument.name.replace(/ Ltd$/, "")} is up ${stockReturn.toFixed(1)}% over the last five sessions while the NIFTY 50 moved ${indexReturn.toFixed(1)}% — a ${spread.toFixed(1)} point spread. ` +
        `That kind of persistent outperformance in ${instrument.sector.toLowerCase()} usually signals money rotating into the sector rather than a one-off move.`,
      entry,
      target,
      stopLoss,
      holdDays: { min: 2, max: 5 },
      risk: riskFromStopDistance((entry.low + entry.high) / 2, stopLoss),
      metrics: [
        { label: "5-day return", value: `${stockReturn >= 0 ? "+" : ""}${stockReturn.toFixed(1)}%` },
        { label: "NIFTY 5-day", value: `${indexReturn >= 0 ? "+" : ""}${indexReturn.toFixed(1)}%` },
        { label: "Spread", value: `${spread.toFixed(1)} pp` },
        { label: "Reward:Risk", value: `${ratio(rr, 1)}:1` },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// 5. Opening Range Breakout
// ---------------------------------------------------------------------------

const openingRangeBreakout: Strategy = {
  id: "st-opening-range-breakout",
  name: "Opening Range Breakout",
  style: "short-term",
  tagline: "Break of the first 15 minutes' range with volume",
  holdPeriodLabel: "1–2 trading days",
  baseRisk: "High",
  explainer: {
    summary:
      "Marks the high and low of the first fifteen minutes of trade and takes the break of that range, with volume confirming.",
    origin:
      "Opening range breakout was formalised by Toby Crabel in Day Trading With Short Term Price Patterns and Opening Range Breakout (1990). The rationale is that the opening period absorbs all the orders accumulated overnight, so the range it establishes represents a genuine equilibrium between buyers and sellers. A decisive break of that equilibrium, once the overnight order flow is cleared, tends to set the direction for the remainder of the session.",
    howItWorks: [
      "The opening range is the high and low of the first three five-minute bars — 09:15 to 09:30 IST on the NSE.",
      "The strategy then watches for a bar that closes beyond that range. A close outside is required rather than a wick through, because wicks through the opening range are extremely common and mean very little.",
      "Volume on the breakout bar must exceed the session's own running average, confirming that the break brought participation with it.",
      "The opening range must also be reasonably tight relative to the stock's average true range. A very wide opening range means the equilibrium is poorly defined and the stop would be impractically far away.",
    ],
    signalConditions: [
      "Opening range established from the first 15 minutes",
      "A bar closes beyond the opening range high or low",
      "Breakout bar volume above the session's running average",
      "Opening range width under 1.5x the daily ATR — a well-defined range",
      "Price has held beyond the range since the break",
    ],
    entryLogic:
      "Entry band spans the broken opening-range boundary. That level is the reference for the whole setup, so entering near it keeps risk defined and small.",
    exitLogic:
      "Target is the second range extension — the opening range's height projected twice beyond the breakout point. Because the range itself defines the risk, a single-range target offers barely better than one-to-one before costs, so the wider objective is the one that makes the setup worth taking. Stop sits at the opposite side of the opening range.",
    worksBestWhen: [
      "Traded in the first hour or two, while the session still has time to develop",
      "The stock is liquid, with tight spreads",
      "There is a catalyst giving the session direction",
    ],
    failsWhen: [
      "The market is range-bound, producing breaks in both directions on the same day",
      "The opening range is unusually wide, which makes stops expensive",
      "Applied late in the session with no room left for the move to run",
    ],
    indicators: ["First 15-minute range", "Intraday volume", "ATR(14)"],
  },

  evaluate({ bundle, thresholds }): StrategySignal | null {
    const { daily, intraday, quote, instrument } = bundle;
    const session = latestSession(intraday);
    if (!session || session.length < 10 || daily.length < 30) return null;

    const openingRange = session.slice(0, 3); // 09:15–09:30
    const orHigh = Math.max(...openingRange.map((c) => c.high));
    const orLow = Math.min(...openingRange.map((c) => c.low));
    const orWidth = orHigh - orLow;
    if (orWidth <= 0) return null;

    const rest = session.slice(3);
    const atrNow = last(atr(daily, 14));
    const currentPrice = quote.price;

    // Find the first bar that closes outside the range.
    let breakoutIndex = -1;
    let isBullish = false;
    for (let i = 0; i < rest.length; i++) {
      if (rest[i].close > orHigh) {
        breakoutIndex = i;
        isBullish = true;
        break;
      }
      if (rest[i].close < orLow) {
        breakoutIndex = i;
        isBullish = false;
        break;
      }
    }
    if (breakoutIndex < 0) return null;

    const breakoutBar = rest[breakoutIndex];
    // Compare against the five bars immediately before the break, not the whole
    // session so far. Volume is heaviest at the opening auction and decays
    // through the morning, so a session-wide average makes every mid-morning
    // breakout look below par purely because of the time of day.
    const absoluteIndex = 3 + breakoutIndex;
    const trailingBars = session.slice(Math.max(0, absoluteIndex - 5), absoluteIndex);
    const runningAvgVolume =
      trailingBars.reduce((sum, c) => sum + c.volume, 0) / Math.max(trailingBars.length, 1);

    const held = isBullish ? currentPrice > orHigh : currentPrice < orLow;
    const widthVsAtr = orWidth / atrNow;

    const conditions: StrategyCondition[] = [
      condition(
        `Closed ${isBullish ? "above" : "below"} the opening range`,
        true,
        `Opening range ${money(orLow)} – ${money(orHigh)}, broken at ${money(breakoutBar.close)}`,
        3,
        true,
      ),
      condition(
        "Breakout volume above the session average",
        breakoutBar.volume > runningAvgVolume,
        timesAverage(breakoutBar.volume, runningAvgVolume),
        2.5,
        true,
      ),
      condition(
        "Well-defined opening range",
        widthVsAtr <= 1.5,
        `Range width is ${ratio(widthVsAtr)}x the daily ATR`,
        2,
      ),
      condition(
        "Held beyond the range",
        held,
        held ? `Still ${isBullish ? "above" : "below"} the range at ${money(currentPrice)}` : "Price has returned inside the range",
        2.5,
        true,
      ),
      condition(
        "Breakout came early in the session",
        breakoutIndex <= 24,
        `Broke out ${(breakoutIndex + 3) * 5} minutes into the session`,
        1.5,
      ),
    ];

    if (!requiredConditionsMet(conditions)) return null;

    let entry, target, stopLoss;
    if (isBullish) {
      // The entry zone stays pinned to the broken boundary. Stretching it up to
      // wherever price has since travelled would quote an average fill nobody
      // could have achieved, and on a strong trend day it lands above the
      // target — the setup is entered at the level or not at all.
      entry = sanitiseBand({ low: round2(orHigh * 0.999), high: round2(orHigh * 1.006) });
      // Second range extension: the opening range projected twice from the
      // break. A 1x projection barely clears the stop once the range itself is
      // the risk, which is why ORB is normally traded to the wider objective.
      target = sanitiseBand(targetBand(orHigh + orWidth * 2, 1.8));
      stopLoss = round2(orLow * 0.998);
    } else {
      entry = sanitiseBand({ low: round2(orLow * 0.994), high: round2(orLow * 1.001) });
      target = sanitiseBand(targetBand(orLow - orWidth * 2, 1.8));
      stopLoss = round2(orHigh * 1.002);
    }

    const rr = rewardToRisk(entry, target, stopLoss, isBullish ? "bullish" : "bearish");
    if (rr < minRewardRiskFor(thresholds, "short-term")) return null;

    const confidence = scoreConditions(conditions);
    if (confidence < thresholds.minConfidence) return null;

    const shortName = instrument.name.replace(/ Ltd$/, "");

    return {
      strategyId: openingRangeBreakout.id,
      ticker: instrument.ticker,
      style: "short-term",
      direction: isBullish ? "bullish" : "bearish",
      confidence,
      conditions,
      reason: isBullish
        ? `${shortName} set a ${money(orLow)}–${money(orHigh)} range in its first fifteen minutes and broke above it on ${timesAverage(breakoutBar.volume, runningAvgVolume)}, holding the level since. ` +
          `The standard objective projects the range height to about ${money(orHigh + orWidth)}.`
        : `${shortName} broke below its opening range on above-average volume and has stayed there. This is a caution signal for the session.`,
      entry,
      target,
      stopLoss,
      holdDays: { min: 1, max: 2 },
      risk: riskFromStopDistance((entry.low + entry.high) / 2, stopLoss),
      metrics: [
        { label: "Opening range", value: `${money(orLow)} – ${money(orHigh)}` },
        { label: "Range width", value: `${((orWidth / orLow) * 100).toFixed(2)}%` },
        { label: "Breakout volume", value: timesAverage(breakoutBar.volume, runningAvgVolume) },
        { label: "Reward:Risk", value: `${ratio(rr, 1)}:1` },
      ],
    };
  },
};

export const SHORT_TERM_STRATEGIES: Strategy[] = [
  gapContinuation,
  vwapMomentum,
  bollingerSqueeze,
  relativeStrength,
  openingRangeBreakout,
];
