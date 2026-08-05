import type { Candle } from "@/lib/market-data/types";
import {
  atr,
  averageVolume,
  bullishReversalCandle,
  closes,
  ema,
  last,
  sessionVwap,
} from "@/lib/indicators";
import {
  averageBarVolume,
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
 * Intraday strategies — opened and closed inside a single session.
 *
 * Every one of these needs five-minute bars. When the active provider supplies
 * none, or the session is too young for the reading to mean anything, they
 * stand down rather than approximating from daily data.
 *
 * Two of them — VWAP Mean Reversion and Intraday Range Fade — additionally
 * require time left on the clock, because both target a level on the far side
 * of the current price and neither can get there in the closing minutes. The
 * practical consequence is that they are silent against a completed session,
 * which is what the seeded demo provider always supplies. That is the correct
 * behaviour, not a gap: neither setup is tradeable after the bell.
 *
 * These deliberately do not overlap with the short-term screens. Those hold
 * across the close and are allowed to reason about the *next* session; these
 * are square by the bell, so their targets are scaled to what a single session
 * can plausibly deliver and their stops to what an intraday structure defines.
 */

/** The NSE cash session is 09:15–15:30 IST: 75 five-minute bars. */
const BARS_PER_SESSION = 75;

/** Minutes elapsed in the session at bar index `i`, for readable detail strings. */
function minutesIn(barIndex: number): number {
  return (barIndex + 1) * 5;
}

function clockAt(barIndex: number): string {
  const minutes = 9 * 60 + 15 + minutesIn(barIndex);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * A bullish reversal candle on any of the last `lookback` bars, whose low has
 * not been taken out since.
 *
 * On a five-minute chart, insisting the pattern land on the very last bar
 * discards the setup for the sake of a few minutes — the turn is still the
 * turn. But a reversal bar that later trades through its own low is not a stale
 * signal, it is a failed one, and the levels built from it would put the stop
 * above where price has already been. Returns the freshest surviving pattern.
 */
function recentBullishReversal(
  bars: Candle[],
  lookback = 3,
): { pattern: string; barsAgo: number; bar: Candle; lowSince: number } | null {
  for (let back = 0; back < lookback; back++) {
    const index = bars.length - 1 - back;
    if (index < 1) break;
    const pattern = bullishReversalCandle(back === 0 ? bars : bars.slice(0, index + 1));
    if (!pattern) continue;

    const bar = bars[index];
    const after = bars.slice(index + 1);
    // A *close* beneath the reversal bar's low is failure; a wick through it is
    // ordinary five-minute noise, the same distinction the breakout screens
    // make. `lowSince` carries the deepest print through so the caller can put
    // its stop under everything that actually traded.
    if (after.some((c) => c.close < bar.low)) continue;
    const lowSince = Math.min(bar.low, ...after.map((c) => c.low));
    return { pattern, barsAgo: back, bar, lowSince };
  }
  return null;
}

/** Mean high-low range across a set of bars. */
function averageBarRange(bars: Candle[]): number {
  if (bars.length === 0) return NaN;
  return bars.reduce((sum, c) => sum + (c.high - c.low), 0) / bars.length;
}

// ---------------------------------------------------------------------------
// 1. VWAP Mean Reversion
// ---------------------------------------------------------------------------

const vwapReversion: Strategy = {
  id: "id-vwap-reversion",
  name: "VWAP Mean Reversion",
  style: "intraday",
  tagline: "Stretched below session VWAP, turning back toward it",
  holdPeriodLabel: "Same session",
  baseRisk: "Medium",
  explainer: {
    summary:
      "Buys a stock that has been pushed unusually far below its volume-weighted average price during the session, once it starts turning back toward that average.",
    origin:
      "This is the counterpart to VWAP trend-following, and it exists for the same institutional reason. A fund working a large buy order through the day is measured against VWAP, so when price falls well below it those orders become more aggressive — buying below VWAP is how the desk beats its benchmark. The effect is strongest in liquid names where a genuine institutional order is likely to be present at all.",
    howItWorks: [
      "VWAP is recomputed from the session open, so it represents the average price everyone who traded today actually paid.",
      "The strategy measures how far current price sits below VWAP, then compares that gap against how far this stock has typically strayed from its own VWAP earlier in the same session. A 1% gap means very different things in a quiet counter and a volatile one.",
      "It only takes the setup when price is also near the session low, because that is what bounds the risk: the stop has somewhere obvious to go. Buying a stretched reading in the middle of the session range means guessing where the low will be.",
      "A reversal candle is required. Stretched can always get more stretched, and the candle is the evidence that this particular attempt is being bought.",
      "The daily trend must be intact — price above its 50-day EMA. A stock below VWAP inside a daily downtrend is not stretched, it is falling.",
    ],
    signalConditions: [
      "Price at least 0.75% below session VWAP",
      "The gap is at least 1.5x this session's own typical distance from VWAP",
      "Price within 3% of the session low, so the stop has a reference",
      "A hammer or bullish engulfing bar in the last five five-minute candles",
      "Daily close above the 50 EMA — the larger trend is still up",
    ],
    entryLogic:
      "Entry band spans the reversal bar, from its low to its close. There is no waiting for a pullback here — the pullback is the setup — but entering at the bar rather than chasing above it is what makes the risk smaller than the reward.",
    exitLogic:
      "Target is VWAP itself. That is the whole thesis: the gap closes. Holding for more than the mean is a different trade with a different edge. Stop goes below the reversal bar's low, since taking out the bar that marked the turn means the reversion attempt has failed.",
    worksBestWhen: [
      "The stock is liquid, so VWAP is built from enough trades to be a real reference",
      "The selloff is broad-market rather than stock-specific news",
      "The setup appears in the middle of the session, leaving time for the gap to close",
    ],
    failsWhen: [
      "The stock is trending down hard all session — VWAP keeps falling toward price rather than price rising to VWAP",
      "There is stock-specific bad news, where every bounce is sold",
      "Applied in the last half hour, when there is no time left for reversion",
    ],
    indicators: ["Session-anchored VWAP", "Session range", "Candlestick reversal patterns", "50 EMA (daily)"],
  },

  evaluate({ bundle, thresholds }): StrategySignal | null {
    const { daily, intraday, quote, instrument } = bundle;
    // At least an hour of trade: VWAP from a handful of bars is just the price.
    const session = latestSession(intraday, 12);
    if (!session || daily.length < 60) return null;

    const vwapSeries = sessionVwap(session);
    const vwapNow = last(vwapSeries);
    if (!Number.isFinite(vwapNow) || vwapNow <= 0) return null;

    const currentPrice = quote.price;
    const gapPct = ((vwapNow - currentPrice) / vwapNow) * 100;
    // 0.75% is roughly where a large-cap's dislocation from VWAP stops being
    // spread and starts being a move. The relative test below is what actually
    // decides whether it is unusual for *this* stock.
    if (gapPct < 0.75) return null;

    // How far this stock has typically strayed from its own VWAP today.
    const deviations = session
      .map((c, i) => (Number.isFinite(vwapSeries[i]) ? Math.abs(c.close - vwapSeries[i]) / vwapSeries[i] : NaN))
      .filter(Number.isFinite);
    if (deviations.length < 8) return null;
    const typicalDeviationPct =
      (deviations.reduce((sum, d) => sum + d, 0) / deviations.length) * 100;

    const sessionLow = Math.min(...session.map((c) => c.low));
    const sessionHigh = Math.max(...session.map((c) => c.high));
    const distanceFromLowPct = ((currentPrice - sessionLow) / sessionLow) * 100;

    // Five bars, not three: a reversal that printed twenty-five minutes ago is
    // still the turn, and the near-low condition below is what keeps the entry
    // from drifting away from it.
    const reversal = recentBullishReversal(session, 5);
    const ema50Now = last(ema(closes(daily), 50));
    const barsElapsed = session.length;

    const conditions: StrategyCondition[] = [
      condition(
        "Stretched below session VWAP",
        true,
        `${money(currentPrice)} is ${gapPct.toFixed(2)}% under VWAP ${money(vwapNow)}`,
        3,
        true,
      ),
      condition(
        "Gap is unusual for this session",
        typicalDeviationPct > 0 && gapPct >= typicalDeviationPct * 1.5,
        `${gapPct.toFixed(2)}% against a session average of ${typicalDeviationPct.toFixed(2)}%`,
        2.5,
        true,
      ),
      condition(
        "Sitting near the session low",
        distanceFromLowPct <= 3,
        `${distanceFromLowPct.toFixed(2)}% above the session low of ${money(sessionLow)}`,
        2.5,
        true,
      ),
      condition(
        "Reversal candle on the turn",
        reversal !== null,
        reversal
          ? `${reversal.pattern.charAt(0).toUpperCase()}${reversal.pattern.slice(1)} ${reversal.barsAgo === 0 ? "on the latest bar" : `${reversal.barsAgo} bars ago`}`
          : "No reversal pattern yet",
        2.5,
        true,
      ),
      condition(
        "Daily trend still up",
        Number.isFinite(ema50Now) && currentPrice > ema50Now,
        Number.isFinite(ema50Now)
          ? `${money(currentPrice)} vs 50 EMA ${money(ema50Now)}`
          : "Not enough daily history",
        2,
      ),
      // Required, not merely scored: a trade whose entire thesis is "the gap to
      // VWAP closes" needs time for that to happen. With an hour gone it is a
      // setup; with ten minutes left it is a hope. This is also why the screen
      // stands down against a completed session — outside market hours there is
      // no time left in the session by definition.
      condition(
        "Time left in the session",
        barsElapsed <= BARS_PER_SESSION - 12,
        `About ${Math.max(0, BARS_PER_SESSION - barsElapsed) * 5} minutes of trade remaining`,
        1.5,
        true,
      ),
    ];

    if (!requiredConditionsMet(conditions)) return null;

    // Both bands anchor to the reversal bar rather than to spot, matching how
    // the swing RSI-reversal screen builds its levels. It is not cosmetic: with
    // the entry at spot and the stop under the session low, the risk is the
    // whole distance back to the low while the reward is only the gap to VWAP,
    // so the setup reads as sub-1:1 exactly when it is at its most attractive.
    const reversalBar = reversal!.bar;
    const entry = sanitiseBand({
      low: round2(reversalBar.low),
      high: round2(Math.max(reversalBar.close, currentPrice)),
    });
    const target = sanitiseBand(targetBand(vwapNow, 0.7));
    // Under everything that has traded since the turn, not merely under the
    // reversal bar itself.
    const stopLoss = round2(reversal!.lowSince * 0.998);

    const rr = rewardToRisk(entry, target, stopLoss, "bullish");
    if (rr < minRewardRiskFor(thresholds, "intraday")) return null;

    const confidence = scoreConditions(conditions);
    if (confidence < thresholds.minConfidence) return null;

    return {
      strategyId: vwapReversion.id,
      ticker: instrument.ticker,
      style: "intraday",
      direction: "bullish",
      confidence,
      conditions,
      reason:
        `${instrument.name.replace(/ Ltd$/, "")} has been pushed ${gapPct.toFixed(2)}% below the average price everyone paid today, roughly twice as far as it has strayed at any other point this session, ` +
        `and it is turning back up off the session low with a ${reversal?.pattern ?? "reversal"}. The trade is simply that the gap to VWAP at ${money(vwapNow)} closes before the bell.`,
      entry,
      target,
      stopLoss,
      holdDays: { min: 0, max: 1 },
      risk: riskFromStopDistance((entry.low + entry.high) / 2, stopLoss),
      metrics: [
        { label: "VWAP", value: money(vwapNow) },
        { label: "Gap to VWAP", value: `${gapPct.toFixed(2)}%` },
        { label: "Session range", value: `${money(sessionLow)} – ${money(sessionHigh)}` },
        { label: "Reward:Risk", value: `${ratio(rr, 1)}:1` },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// 2. Momentum Burst
// ---------------------------------------------------------------------------

const momentumBurst: Strategy = {
  id: "id-momentum-burst",
  name: "Momentum Burst",
  style: "intraday",
  tagline: "One outsized five-minute bar on 2.5x volume, holding its gains",
  holdPeriodLabel: "Same session",
  baseRisk: "High",
  explainer: {
    summary:
      "Catches the moment a stock suddenly trades several times its normal volume in a single five-minute bar, and rides the move while it holds.",
    origin:
      "The burst is the intraday footprint of an order that is too large to hide. Linda Raschke described the pattern as a momentum 'thrust' — a bar whose range and volume are statistical outliers against the immediately preceding bars. The reasoning is straightforward: normal five-minute trade is noise, and a bar that breaks the noise floor by a wide margin is information about size arriving, which rarely completes in one bar.",
    howItWorks: [
      "The strategy scans the last ten bars for one whose volume is at least 2x, and whose range at least 1.5x, the average of the twenty bars before it. Both must exceed together — volume without range is absorption, range without volume is a thin print.",
      "The bar must also close in the top third of its own range. A wide, heavy bar that closes at its low is distribution, not a burst.",
      "Price then has to have held above the burst bar's midpoint. Bursts that give back more than half of themselves within a few bars are being sold into.",
      "Price above session VWAP is required as a session-level filter, so the burst is happening from a position of strength rather than as a bounce inside a down day.",
    ],
    signalConditions: [
      "A bar in the last ten with volume ≥ 2x the preceding twenty-bar average",
      "That bar's range ≥ 1.5x the preceding twenty-bar average range",
      "The burst bar closed in the top third of its range",
      "Price has held above the burst bar's midpoint since",
      "Price trading above session VWAP",
    ],
    entryLogic:
      "Entry band spans the burst bar's midpoint to its high. Bursts commonly retrace into their own body within a few bars, and that retrace is the entry — chasing the bar itself means paying for the whole move and stopping out on the ordinary pullback.",
    exitLogic:
      "Target projects the burst bar's own range roughly one and three-quarter times beyond its high, since the size that produced the bar tends to keep working. Stop sits under the burst bar's low: below there, the bar was a spike rather than a start.",
    worksBestWhen: [
      "The burst comes early enough in the session for the move to develop",
      "Volume stays elevated in the bars after the burst rather than collapsing",
      "The stock is a liquid name where a 2.5x volume reading is a genuine outlier",
    ],
    failsWhen: [
      "The burst is a single block trade that leaves no follow-through",
      "The bar prints into a major overhead level, which caps the move immediately",
      "Applied to an illiquid counter where any order looks like a burst",
    ],
    indicators: ["Five-minute relative volume", "Bar range vs trailing average", "Session VWAP"],
  },

  evaluate({ bundle, thresholds }): StrategySignal | null {
    const { intraday, quote, instrument, daily } = bundle;
    const session = latestSession(intraday, 24);
    if (!session || daily.length < 30) return null;

    const vwapSeries = sessionVwap(session);
    const vwapNow = last(vwapSeries);
    const currentPrice = quote.price;

    // Scan the last ten bars for the burst, most recent first — the freshest
    // qualifying bar is the relevant one.
    let burstIndex = -1;
    let burstVolumeMultiple = 0;
    let burstRangeMultiple = 0;

    for (let i = session.length - 1; i >= Math.max(20, session.length - 10); i--) {
      const bar = session[i];
      const priorBars = session.slice(Math.max(0, i - 20), i);
      if (priorBars.length < 10) continue;

      const avgVol = averageBarVolume(priorBars);
      const avgRange = averageBarRange(priorBars);
      const range = bar.high - bar.low;
      if (!Number.isFinite(avgVol) || avgVol <= 0 || !Number.isFinite(avgRange) || avgRange <= 0) continue;
      if (range <= 0) continue;

      const volumeMultiple = bar.volume / avgVol;
      const rangeMultiple = range / avgRange;
      const closedStrong = bar.close >= bar.low + range * 0.66;

      if (volumeMultiple >= 2 && rangeMultiple >= 1.5 && closedStrong) {
        burstIndex = i;
        burstVolumeMultiple = volumeMultiple;
        burstRangeMultiple = rangeMultiple;
        break;
      }
    }

    if (burstIndex < 0) return null;

    const burst = session[burstIndex];
    const burstRange = burst.high - burst.low;
    const burstMid = burst.low + burstRange / 2;
    const barsSince = session.length - 1 - burstIndex;
    // Bars *after* the burst — the burst bar's own low is below its midpoint by
    // definition, so including it would make the give-back test unsatisfiable.
    const barsAfter = session.slice(burstIndex + 1);
    const lowSince = barsAfter.length > 0 ? Math.min(...barsAfter.map((c) => c.low)) : burst.close;

    const conditions: StrategyCondition[] = [
      condition(
        "Outsized volume on a single bar",
        true,
        `${burstVolumeMultiple.toFixed(1)}x the preceding twenty-bar average at ${clockAt(burstIndex)}`,
        3,
        true,
      ),
      condition(
        "Range expanded with the volume",
        true,
        `Bar range ${burstRangeMultiple.toFixed(1)}x normal — ${money(burst.low)} to ${money(burst.high)}`,
        2.5,
        true,
      ),
      condition(
        "Closed in the top third of the bar",
        true,
        `Closed at ${money(burst.close)} against a high of ${money(burst.high)}`,
        2,
        true,
      ),
      condition(
        "Holding above the burst midpoint",
        lowSince >= burstMid * 0.998 && currentPrice > burstMid,
        barsAfter.length > 0
          ? `Lowest print since is ${money(lowSince)} against a midpoint of ${money(burstMid)}`
          : `Burst is the latest bar — nothing given back yet, midpoint ${money(burstMid)}`,
        3,
        true,
      ),
      condition(
        "Above session VWAP",
        Number.isFinite(vwapNow) && currentPrice > vwapNow,
        Number.isFinite(vwapNow) ? `${money(currentPrice)} vs VWAP ${money(vwapNow)}` : "VWAP unavailable",
        2,
        true,
      ),
      condition(
        "Burst is still fresh",
        barsSince <= 6,
        `${barsSince === 0 ? "Printed on the latest bar" : `${barsSince * 5} minutes ago`}`,
        1.5,
      ),
    ];

    if (!requiredConditionsMet(conditions)) return null;

    const entry = sanitiseBand({ low: round2(burstMid), high: round2(burst.high) });
    const target = sanitiseBand(targetBand(burst.high + burstRange * 1.75, 1.2));
    const stopLoss = round2(burst.low * 0.998);

    const rr = rewardToRisk(entry, target, stopLoss, "bullish");
    if (rr < minRewardRiskFor(thresholds, "intraday")) return null;

    const confidence = scoreConditions(conditions);
    if (confidence < thresholds.minConfidence) return null;

    return {
      strategyId: momentumBurst.id,
      ticker: instrument.ticker,
      style: "intraday",
      direction: "bullish",
      confidence,
      conditions,
      reason:
        `${instrument.name.replace(/ Ltd$/, "")} traded ${burstVolumeMultiple.toFixed(1)} times its normal five-minute volume in one bar at ${clockAt(burstIndex)}, on a range ${burstRangeMultiple.toFixed(1)}x wider than the bars around it. ` +
        `It has held above that bar's midpoint since, which is what separates size arriving from a one-off print.`,
      entry,
      target,
      stopLoss,
      holdDays: { min: 0, max: 1 },
      risk: riskFromStopDistance((entry.low + entry.high) / 2, stopLoss),
      metrics: [
        { label: "Burst volume", value: `${burstVolumeMultiple.toFixed(1)}x` },
        { label: "Burst range", value: `${burstRangeMultiple.toFixed(1)}x` },
        { label: "Burst bar", value: `${money(burst.low)} – ${money(burst.high)}` },
        { label: "Reward:Risk", value: `${ratio(rr, 1)}:1` },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// 3. Intraday Range Fade
// ---------------------------------------------------------------------------

const rangeFade: Strategy = {
  id: "id-range-fade",
  name: "Intraday Range Fade",
  style: "intraday",
  tagline: "Buying the floor of a range that has held all session",
  holdPeriodLabel: "Same session",
  baseRisk: "Low",
  explainer: {
    summary:
      "On quiet, directionless days, buys the bottom of an intraday range that buyers have already defended more than once, aiming for the other side of the range.",
    origin:
      "Most sessions are not trend days. The market-maker's model of a balanced session — price rotating between an accepted high and low, with volume building in the middle — is the oldest description of this behaviour, and it underpins the auction-market framework taught by Peter Steidlmayer. The practical consequence is that on a balanced day, the edges are where the odds sit, and the middle is where they do not.",
    howItWorks: [
      "The strategy first establishes that this is a balanced session and not a trend day: the session's whole range has to be narrow relative to the stock's average daily range.",
      "It then requires the range to have been genuinely defended — at least two separate visits to the lower edge that each produced a bounce, not one long drift along the floor.",
      "Price must currently be in the bottom fifth of the range, which is the only part of it that offers an asymmetric trade.",
      "A reversal candle at the edge confirms this particular visit is being bought, rather than being the one that breaks the range.",
    ],
    signalConditions: [
      "At least two hours of trade, so the range is established",
      "Session range under 0.85x the daily ATR — a balanced, non-trending day",
      "Range wide enough to be worth trading: at least 0.6% top to bottom",
      "Two or more separate touches of the lower edge",
      "Price in the bottom fifth of the range with a bullish reversal candle",
    ],
    entryLogic:
      "Entry band sits in the bottom quarter of the range, from just above the floor upward. The whole point of a fade is buying the edge, so entering above the quarter mark gives away most of the reward and keeps all the risk.",
    exitLogic:
      "Target is just below the top of the range, not at it — the last tick of a range is where everyone else's limit sells are sitting. Stop goes a quarter of the range height below the floor, wide enough to survive a wick but decisive about a genuine breakdown.",
    worksBestWhen: [
      "The index itself is flat and there is no macro event pending",
      "The stock has no news, so nothing is likely to break the balance",
      "The range is wide enough that the round trip covers costs comfortably",
    ],
    failsWhen: [
      "A trend day is under way — every fade attempt gets run over",
      "The range breaks late in the session as positions square up",
      "The range is so tight that brokerage and impact cost eat the move",
    ],
    indicators: ["Session range", "ATR(14) daily", "Touch counting at the range edge", "Candlestick reversal patterns"],
  },

  evaluate({ bundle, thresholds }): StrategySignal | null {
    const { daily, intraday, quote, instrument } = bundle;
    const session = latestSession(intraday, 24);
    if (!session || daily.length < 30) return null;

    const rangeHigh = Math.max(...session.map((c) => c.high));
    const rangeLow = Math.min(...session.map((c) => c.low));
    const height = rangeHigh - rangeLow;
    if (height <= 0) return null;

    const atrNow = last(atr(daily, 14));
    if (!Number.isFinite(atrNow) || atrNow <= 0) return null;

    const heightVsAtr = height / atrNow;
    const heightPct = (height / rangeLow) * 100;
    const currentPrice = quote.price;
    const positionInRange = (currentPrice - rangeLow) / height;

    // Count *separate* visits to the floor: a touch is only counted when price
    // has left the zone since the previous one. A long drift along the lows is
    // one visit, not thirty, and it means the floor is giving way.
    const floorZone = rangeLow + height * 0.15;
    let touches = 0;
    let inZone = false;
    for (const bar of session) {
      if (bar.low <= floorZone) {
        if (!inZone) touches += 1;
        inZone = true;
      } else if (bar.low > rangeLow + height * 0.3) {
        inZone = false;
      }
    }

    const reversal = recentBullishReversal(session);

    const conditions: StrategyCondition[] = [
      condition(
        "Balanced session, not a trend day",
        heightVsAtr <= 0.85,
        `Session range is ${ratio(heightVsAtr)}x the daily ATR`,
        2.5,
        true,
      ),
      condition(
        "Range worth trading",
        heightPct >= 0.6,
        `${money(rangeLow)} – ${money(rangeHigh)}, a spread of ${heightPct.toFixed(2)}%`,
        2,
        true,
      ),
      condition(
        "Floor defended more than once",
        touches >= 2,
        `${touches} separate ${touches === 1 ? "visit" : "visits"} to the lower edge`,
        3,
        true,
      ),
      condition(
        "Price at the bottom of the range",
        positionInRange <= 0.2,
        `Sitting at ${(positionInRange * 100).toFixed(0)}% of the range`,
        2.5,
        true,
      ),
      condition(
        "Reversal candle at the edge",
        reversal !== null,
        reversal
          ? `${reversal.pattern.charAt(0).toUpperCase()}${reversal.pattern.slice(1)} ${reversal.barsAgo === 0 ? "on the latest bar" : `${reversal.barsAgo} bars ago`}`
          : "No reversal pattern yet",
        2.5,
        true,
      ),
      // Required for the same reason as the VWAP reversion screen: the target
      // is the far side of the range, and there has to be enough session left
      // to travel there.
      condition(
        "Time left to reach the other side",
        session.length <= BARS_PER_SESSION - 12,
        `About ${Math.max(0, BARS_PER_SESSION - session.length) * 5} minutes of trade remaining`,
        1.5,
        true,
      ),
    ];

    if (!requiredConditionsMet(conditions)) return null;

    const entry = sanitiseBand({
      low: round2(rangeLow * 1.0005),
      high: round2(rangeLow + height * 0.25),
    });
    const target = sanitiseBand(targetBand(rangeHigh - height * 0.1, 0.5));
    const stopLoss = round2(rangeLow - height * 0.25);

    const rr = rewardToRisk(entry, target, stopLoss, "bullish");
    if (rr < minRewardRiskFor(thresholds, "intraday")) return null;

    const confidence = scoreConditions(conditions);
    if (confidence < thresholds.minConfidence) return null;

    return {
      strategyId: rangeFade.id,
      ticker: instrument.ticker,
      style: "intraday",
      direction: "bullish",
      confidence,
      conditions,
      reason:
        `${instrument.name.replace(/ Ltd$/, "")} has spent the session rotating inside a ${heightPct.toFixed(2)}% band between ${money(rangeLow)} and ${money(rangeHigh)}, with buyers stepping in at the floor ${touches} separate times. ` +
        `Price is back at that floor with a ${reversal?.pattern ?? "reversal"} forming, and the trade is the rotation back toward the top of the range.`,
      entry,
      target,
      stopLoss,
      holdDays: { min: 0, max: 1 },
      risk: riskFromStopDistance((entry.low + entry.high) / 2, stopLoss),
      metrics: [
        { label: "Session range", value: `${money(rangeLow)} – ${money(rangeHigh)}` },
        { label: "Range vs ATR", value: `${ratio(heightVsAtr)}x` },
        { label: "Floor touches", value: String(touches) },
        { label: "Reward:Risk", value: `${ratio(rr, 1)}:1` },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// 4. Previous-Day High Break
// ---------------------------------------------------------------------------

const previousDayBreak: Strategy = {
  id: "id-previous-day-break",
  name: "Previous-Day High Break",
  style: "intraday",
  tagline: "Clearing yesterday's high on volume and holding above VWAP",
  holdPeriodLabel: "Same session",
  baseRisk: "Medium",
  explainer: {
    summary:
      "Takes the break of the previous session's high — the single most watched intraday level — when volume and VWAP both agree.",
    origin:
      "Previous-day high and low are reference levels precisely because everyone can see them without drawing anything. They mark where the last session's auction ended, so they carry accumulated resting orders: stops from yesterday's shorts above the high, and limit buys from anyone who missed the move. Floor traders worked these levels long before charts were electronic, and the mechanics have not changed.",
    howItWorks: [
      "The previous session's high and low are taken from the actual intraday bars, not the daily candle, so the level matches what an intraday chart shows.",
      "The strategy waits for a five-minute bar to close above the previous day's high. A wick through it is the most common false signal at this level, because that is exactly where the resting stops sit and clearing them takes no real buying.",
      "Price must still be above the level now. A break that has already been reclaimed by sellers is a failed break, which is a bearish tell rather than a setup.",
      "Session VWAP must be below price. Breaking yesterday's high while trading under today's average price means the break is being sold, and those reverse quickly.",
      "Session volume has to be running above the stock's own daily norm, otherwise the level was cleared on nothing.",
    ],
    signalConditions: [
      "A five-minute bar closed above the previous session's high",
      "Price still holding above that level",
      "Price above session VWAP",
      "Session volume above the configured multiple of the 20-day average",
      "The break happened with time left in the session",
    ],
    entryLogic:
      "Entry band is pinned to the level itself — from just below it to a fraction above. Broken resistance becomes support, and the retest is both the best fill and the cleanest place to define risk. The band deliberately does not stretch up to wherever price has since travelled.",
    exitLogic:
      "Target adds three quarters of yesterday's range to the level, on the reasoning that a session which clears the prior high tends to expand toward a comparable range of its own. Stop sits back under the level: below it, the break has failed and the level flips back to resistance.",
    worksBestWhen: [
      "The break happens in the first half of the session, with time to extend",
      "The stock opened above yesterday's midpoint, so the day was already strong",
      "The index is also making progress, not fighting the move",
    ],
    failsWhen: [
      "The break happens in the last hour, when squaring-up flow dominates",
      "Price is far extended above VWAP already, leaving the stop impractically wide",
      "The market is choppy and the level is broken and reclaimed repeatedly",
    ],
    indicators: ["Previous session high/low", "Session VWAP", "Relative volume"],
  },

  evaluate({ bundle, thresholds }): StrategySignal | null {
    const { daily, intraday, quote, instrument } = bundle;
    const session = latestSession(intraday, 6);
    const prev = previousSession(intraday);
    if (!session || !prev || prev.length < 20 || daily.length < 30) return null;

    const pdHigh = Math.max(...prev.map((c) => c.high));
    const pdLow = Math.min(...prev.map((c) => c.low));
    const pdRange = pdHigh - pdLow;
    if (pdRange <= 0) return null;

    // First bar of the session that closes above the level.
    const breakIndex = session.findIndex((c) => c.close > pdHigh);
    if (breakIndex < 0) return null;

    const breakBar = session[breakIndex];
    const currentPrice = quote.price;
    const vwapNow = last(sessionVwap(session));
    const sessionVolume = session.reduce((sum, c) => sum + c.volume, 0);
    const avgVolume = averageVolume(daily, 20);
    const extensionPct = ((currentPrice - pdHigh) / pdHigh) * 100;

    const conditions: StrategyCondition[] = [
      condition(
        "Closed above the previous day's high",
        true,
        `Cleared ${money(pdHigh)} at ${clockAt(breakIndex)}, closing at ${money(breakBar.close)}`,
        3,
        true,
      ),
      condition(
        "Level still holding",
        currentPrice > pdHigh,
        currentPrice > pdHigh
          ? `${extensionPct.toFixed(2)}% above the level`
          : "Price has fallen back below the level",
        3,
        true,
      ),
      condition(
        "Above session VWAP",
        Number.isFinite(vwapNow) && currentPrice > vwapNow,
        Number.isFinite(vwapNow) ? `${money(currentPrice)} vs VWAP ${money(vwapNow)}` : "VWAP unavailable",
        2.5,
        true,
      ),
      condition(
        `Session volume ≥ ${thresholds.volumeSurgeMultiple}x average`,
        sessionVolume >= avgVolume * thresholds.volumeSurgeMultiple,
        timesAverage(sessionVolume, avgVolume),
        2.5,
      ),
      condition(
        "Not already extended from the level",
        extensionPct <= 2.5,
        `${extensionPct.toFixed(2)}% above ${money(pdHigh)}`,
        2,
      ),
      condition(
        "Broke with time left in the session",
        breakIndex <= BARS_PER_SESSION - 18,
        `Broke ${minutesIn(breakIndex)} minutes into the session`,
        1.5,
      ),
    ];

    if (!requiredConditionsMet(conditions)) return null;

    const entry = sanitiseBand({ low: round2(pdHigh * 0.999), high: round2(pdHigh * 1.005) });
    const target = sanitiseBand(targetBand(pdHigh + pdRange * 0.75, 1));
    // Back inside yesterday's range by a third of it — decisively failed, but
    // clear of the wick that a retest of the level normally produces.
    const stopLoss = round2(pdHigh - Math.max(pdRange * 0.3, pdHigh * 0.004));

    // When yesterday's range was narrow, projecting three quarters of it lands
    // inside the entry band and the card reads "already at or above the target
    // zone" — a setup with nowhere to go. Reward-to-risk alone does not catch
    // this because it compares midpoints, so the geometry is checked directly.
    if (!bandsAreOrdered(entry, target, stopLoss, "bullish")) return null;

    const rr = rewardToRisk(entry, target, stopLoss, "bullish");
    if (rr < minRewardRiskFor(thresholds, "intraday")) return null;

    const confidence = scoreConditions(conditions);
    if (confidence < thresholds.minConfidence) return null;

    return {
      strategyId: previousDayBreak.id,
      ticker: instrument.ticker,
      style: "intraday",
      direction: "bullish",
      confidence,
      conditions,
      reason:
        `${instrument.name.replace(/ Ltd$/, "")} has closed a bar above yesterday's high of ${money(pdHigh)} on ${timesAverage(sessionVolume, avgVolume)} and is holding above it, with session VWAP underneath at ${money(vwapNow)}. ` +
        `That level is where yesterday's sellers were in control, and taking it usually opens up a move of comparable size to yesterday's ${money(pdRange)} range.`,
      entry,
      target,
      stopLoss,
      holdDays: { min: 0, max: 1 },
      risk: riskFromStopDistance((entry.low + entry.high) / 2, stopLoss),
      metrics: [
        { label: "Prev day high", value: money(pdHigh) },
        { label: "Prev day range", value: `${money(pdLow)} – ${money(pdHigh)}` },
        { label: "Rel. volume", value: timesAverage(sessionVolume, avgVolume) },
        { label: "Reward:Risk", value: `${ratio(rr, 1)}:1` },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// 5. Closing-Hour Trend
// ---------------------------------------------------------------------------

const closingHourTrend: Strategy = {
  id: "id-closing-hour-trend",
  name: "Closing-Hour Trend",
  style: "intraday",
  tagline: "Trend day holding its highs into the last hour",
  holdPeriodLabel: "Same session",
  baseRisk: "Medium",
  explainer: {
    summary:
      "Late in the session, buys stocks that have trended up all day and are still sitting at their highs, riding the last leg into the close.",
    origin:
      "The closing hour behaves differently from the rest of the session. Index funds, ETFs and anyone benchmarked to the closing price must transact near it, so a disproportionate share of the day's volume arrives in the final thirty minutes. On a day where one side has been in control throughout, that flow tends to arrive in the same direction — a stock that has been bid all day is rarely the one sold into the close.",
    howItWorks: [
      "The strategy only looks at sessions that are already at least four and a half hours old, so 'the day's character' is a settled fact rather than a guess.",
      "It requires price above VWAP and in the top quarter of the session range. Both together describe a stock that has not merely risen but has held everything it took.",
      "Higher lows across the recent bars are the structural requirement: the lowest print of the last six bars must be above the lowest print of the six before them. That is what distinguishes a trend still in force from one that topped an hour ago.",
      "Session volume must be above the stock's daily norm — a drifting, low-volume rise into the close is not the same flow and does not carry.",
    ],
    signalConditions: [
      "At least four and a half hours of trade completed",
      "Price above session VWAP",
      "Price in the top quarter of the session range",
      "Higher lows across the last twelve bars",
      "Session volume above the 20-day average",
    ],
    entryLogic:
      "Entry band sits just below current price. There is no waiting for a deep pullback with an hour left on the clock — the setup is that the trend holds, so the entry has to be near where it is.",
    exitLogic:
      "Target extends half the session's range beyond the high, which is roughly what a trend day adds in its final leg. Stop goes under the last six bars' low: losing that means the higher-low structure has broken and the reason for the trade is gone.",
    worksBestWhen: [
      "The whole market is trending the same way, so closing flow reinforces it",
      "The stock has held above VWAP without a single meaningful test all session",
      "Volume is building into the close rather than fading",
    ],
    failsWhen: [
      "It is an expiry or rebalance day, where closing flow is mechanical and can cut either way",
      "The stock is extended far above VWAP, leaving no sensible stop",
      "The trend has already been rolling over and the higher-low structure is marginal",
    ],
    indicators: ["Session VWAP", "Session range position", "Higher-low structure", "Relative volume"],
  },

  evaluate({ bundle, thresholds }): StrategySignal | null {
    const { daily, intraday, quote, instrument } = bundle;
    // Four and a half hours in — roughly 13:45 IST onward.
    const session = latestSession(intraday, 54);
    if (!session || daily.length < 30) return null;

    const vwapNow = last(sessionVwap(session));
    if (!Number.isFinite(vwapNow)) return null;

    const sessionHigh = Math.max(...session.map((c) => c.high));
    const sessionLow = Math.min(...session.map((c) => c.low));
    const height = sessionHigh - sessionLow;
    if (height <= 0) return null;

    const currentPrice = quote.price;
    const positionInRange = (currentPrice - sessionLow) / height;

    const recentSix = session.slice(-6);
    const priorSix = session.slice(-12, -6);
    if (priorSix.length < 6) return null;
    const recentLow = Math.min(...recentSix.map((c) => c.low));
    const priorLow = Math.min(...priorSix.map((c) => c.low));

    const sessionVolume = session.reduce((sum, c) => sum + c.volume, 0);
    const avgVolume = averageVolume(daily, 20);
    const prevDaily = daily[daily.length - 2];

    const conditions: StrategyCondition[] = [
      condition(
        "Above session VWAP",
        currentPrice > vwapNow,
        `${money(currentPrice)} vs VWAP ${money(vwapNow)}`,
        3,
        true,
      ),
      condition(
        "Holding the top of the session range",
        positionInRange >= 0.75,
        `At ${(positionInRange * 100).toFixed(0)}% of the ${money(sessionLow)} – ${money(sessionHigh)} range`,
        3,
        true,
      ),
      condition(
        "Higher lows into the close",
        recentLow > priorLow,
        `Last six bars bottomed at ${money(recentLow)} against ${money(priorLow)} before them`,
        2.5,
        true,
      ),
      condition(
        "Session volume above average",
        sessionVolume >= avgVolume,
        timesAverage(sessionVolume, avgVolume),
        2,
      ),
      condition(
        "Session is up on the previous close",
        prevDaily ? currentPrice > prevDaily.close : false,
        prevDaily
          ? `${(((currentPrice - prevDaily.close) / prevDaily.close) * 100).toFixed(2)}% vs the previous close`
          : "No previous session data",
        1.5,
      ),
    ];

    if (!requiredConditionsMet(conditions)) return null;

    const entry = sanitiseBand(longEntryBand(currentPrice, 0.5, 0.15));
    const target = sanitiseBand(targetBand(sessionHigh + height * 0.5, 0.8));
    const stopLoss = round2(recentLow * 0.998);

    const rr = rewardToRisk(entry, target, stopLoss, "bullish");
    if (rr < minRewardRiskFor(thresholds, "intraday")) return null;

    const confidence = scoreConditions(conditions);
    if (confidence < thresholds.minConfidence) return null;

    return {
      strategyId: closingHourTrend.id,
      ticker: instrument.ticker,
      style: "intraday",
      direction: "bullish",
      confidence,
      conditions,
      reason:
        `${instrument.name.replace(/ Ltd$/, "")} has been bid all session and is still sitting at ${(positionInRange * 100).toFixed(0)}% of its range with VWAP well below at ${money(vwapNow)}, making higher lows into the final stretch. ` +
        `The closing hour carries a disproportionate share of the day's volume, and on a day with one side clearly in control that flow usually arrives the same way.`,
      entry,
      target,
      stopLoss,
      holdDays: { min: 0, max: 1 },
      risk: riskFromStopDistance((entry.low + entry.high) / 2, stopLoss),
      metrics: [
        { label: "VWAP", value: money(vwapNow) },
        { label: "Range position", value: `${(positionInRange * 100).toFixed(0)}%` },
        { label: "Rel. volume", value: timesAverage(sessionVolume, avgVolume) },
        { label: "Reward:Risk", value: `${ratio(rr, 1)}:1` },
      ],
    };
  },
};

export const INTRADAY_STRATEGIES: Strategy[] = [
  vwapReversion,
  momentumBurst,
  rangeFade,
  previousDayBreak,
  closingHourTrend,
];
