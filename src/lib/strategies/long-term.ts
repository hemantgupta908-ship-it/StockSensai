import type { Fundamentals } from "@/lib/market-data/types";
import { closes, ema, highestHigh, last, lowestLow, percentChange, rsi } from "@/lib/indicators";
import { condition, money, ratio, sanitiseBand, targetBand } from "./helpers";
import {
  bandsAreOrdered,
  minRewardRiskFor,
  requiredConditionsMet,
  rewardToRisk,
  riskFromStopDistance,
  round2,
  scoreConditions,
  stopClearOfEntry,
  type Strategy,
  type StrategyCondition,
  type StrategySignal,
} from "./types";

/**
 * Long-term investing strategies — holds of one to five-plus years.
 *
 * These score business quality and valuation rather than chart patterns, so
 * they need a fundamentals feed. When `fundamentals` is null (brokerage APIs
 * generally don't carry it) every strategy here returns null rather than
 * scoring on price alone, which would quietly turn a value screen into a
 * momentum screen.
 *
 * Note on ranges: for a multi-year hold, an "entry band" is an accumulation
 * zone, not a trade trigger. Targets are derived from a re-rating toward fair
 * value, and the stop is a thesis-invalidation level rather than a tight
 * technical stop — hence the much wider bands than the swing strategies use.
 */

/** Compound annual growth rate implied by a series, oldest first. */
function cagr(series: number[]): number {
  if (series.length < 2) return NaN;
  const first = series[0];
  const lastValue = series[series.length - 1];
  if (first <= 0 || lastValue <= 0) return NaN;
  const years = series.length - 1;
  return (Math.pow(lastValue / first, 1 / years) - 1) * 100;
}

/** True when every value is greater than the one before it. */
function isMonotonicRising(series: number[]): boolean {
  return series.every((v, i) => i === 0 || v > series[i - 1]);
}

/** Count of years where the value rose versus the prior year. */
function risingYears(series: number[]): number {
  return series.reduce((count, v, i) => (i > 0 && v > series[i - 1] ? count + 1 : count), 0);
}

/**
 * Long-horizon accumulation band: wide by design, centred just under spot.
 *
 * At roughly 8.5% wide this is far wider than any trading band here, which is
 * correct for a position built over weeks — but it means a stop derived from a
 * level near spot can easily fall *inside* it. Every stop in this file is
 * therefore passed through `stopClearOfEntry` before it is published.
 */
function accumulationBand(price: number) {
  return sanitiseBand({ low: round2(price * 0.94), high: round2(price * 1.02) });
}

/**
 * Leverage gate.
 *
 * Debt-to-equity is frequently unreported for banks and NBFCs, and it is not
 * the right measure for them in any case — a bank is leveraged by design, and
 * regulators assess capital adequacy instead. Treating a missing figure as a
 * failure would silently exclude every bank from the value and quality screens;
 * treating it as zero would be worse still. So the gate is *required only when
 * the number exists*, and says plainly why it doesn't when it's absent.
 */
function leverageCondition(f: Fundamentals, max: number, weight: number): StrategyCondition {
  const known = Number.isFinite(f.debtToEquity);
  return condition(
    `Debt-to-equity below ${max}`,
    known && f.debtToEquity < max,
    known
      ? `D/E ${ratio(f.debtToEquity)}`
      : "Not reported — usual for banks, where capital adequacy is the relevant test",
    weight,
    known,
  );
}

// ---------------------------------------------------------------------------
// 1. Value Investing
// ---------------------------------------------------------------------------

const valueInvesting: Strategy = {
  id: "lt-value",
  name: "Value Investing",
  style: "long-term",
  tagline: "Cheap versus sector on P/E and P/B, with high RoE and low debt",
  holdPeriodLabel: "2–5 years",
  baseRisk: "Low",
  explainer: {
    summary:
      "Screens for profitable, low-debt businesses trading at a discount to their sector on both earnings and book value — companies the market has temporarily marked down.",
    origin:
      "Benjamin Graham and David Dodd set out the framework in Security Analysis (1934), and Graham refined it for individual investors in The Intelligent Investor (1949). The central idea is the margin of safety: buy meaningfully below what the business is worth, so that ordinary errors of estimation do not become permanent losses of capital. The screen here follows Graham's later quantitative checklists — cheapness must be paired with financial strength, or you are simply buying a business in decline.",
    howItWorks: [
      "Valuation is measured relative to the stock's own sector rather than the market. A P/E of 20 is expensive for a public-sector bank and cheap for a consumer staples company; comparing against the sector median removes that distortion.",
      "Cheapness alone is a value trap. The screen therefore requires return on equity above 15%, which says the business earns a genuine return on shareholder capital.",
      "Debt-to-equity below 0.5 ensures the balance sheet can survive a downturn without a dilutive rescue. Highly leveraged companies look cheap precisely because they might not make it.",
      "Profit growth must be consistent across the last five years — at least three of four years showing an increase — to distinguish a temporarily unloved business from a structurally shrinking one.",
    ],
    signalConditions: [
      "P/E below the sector median",
      "P/B below the sector median",
      "Return on equity above the configured minimum (15% at moderate)",
      "Debt-to-equity below the configured maximum (0.5 at moderate)",
      "Profits rising in at least 3 of the last 4 years",
      "Interest coverage above 3x",
    ],
    entryLogic:
      "The entry band is an accumulation zone spanning roughly 6% below to 2% above the current price. Value positions are built over weeks, not entered on a single day, and the wide band reflects that.",
    exitLogic:
      "The target assumes a partial re-rating toward the sector median P/E — not full convergence, which rarely happens. The stop is a thesis-invalidation level well below spot: for a multi-year hold, a tight stop would simply guarantee being shaken out.",
    worksBestWhen: [
      "Markets have indiscriminately sold off a sector, dragging good businesses down with weak ones",
      "The investor has genuine patience — re-rating often takes years",
      "The discount is due to sentiment or a cyclical trough rather than structural decline",
    ],
    failsWhen: [
      "The business is in permanent decline and the low multiple is correct",
      "Accounting is aggressive, making reported earnings and book value unreliable",
      "The sector itself deserves a lower multiple and never re-rates",
    ],
    indicators: ["P/E vs sector", "P/B vs sector", "Return on equity", "Debt-to-equity", "5-year profit history", "Interest coverage"],
  },

  evaluate({ bundle, thresholds }): StrategySignal | null {
    const { fundamentals, quote, instrument, daily } = bundle;
    if (!fundamentals) return null;

    const f: Fundamentals = fundamentals;
    const price = quote.price;
    const profitRises = risingYears(f.profitHistory);

    const conditions: StrategyCondition[] = [
      condition(
        "P/E below sector median",
        f.peRatio < f.sectorPe,
        `P/E ${ratio(f.peRatio)} vs sector ${ratio(f.sectorPe)}`,
        3,
        true,
      ),
      condition(
        "P/B below sector median",
        f.pbRatio < f.sectorPb,
        `P/B ${ratio(f.pbRatio)} vs sector ${ratio(f.sectorPb)}`,
        2.5,
      ),
      condition(
        `Return on equity above ${thresholds.minRoe}%`,
        f.roe > thresholds.minRoe,
        `RoE ${ratio(f.roe, 1)}%`,
        3,
        true,
      ),
      leverageCondition(f, thresholds.maxDebtToEquity, 2.5),
      condition(
        "Consistent profit growth",
        profitRises >= 3,
        `Profits rose in ${profitRises} of the last 4 years`,
        2,
      ),
      condition(
        "Interest coverage above 3x",
        f.interestCoverage > 3,
        `${ratio(f.interestCoverage, 1)}x`,
        1.5,
      ),
    ];

    if (!requiredConditionsMet(conditions)) return null;

    const confidence = scoreConditions(conditions);
    if (confidence < thresholds.minConfidence) return null;

    // Re-rating target: close two thirds of the gap to the sector median P/E.
    const reratedPe = f.peRatio + (f.sectorPe - f.peRatio) * 0.66;
    const fairValue = f.earningsPerShare * reratedPe;
    const entry = accumulationBand(price);
    const target = sanitiseBand(targetBand(fairValue, 8));
    // Thesis invalidation, not a trading stop — but not unbounded either. The
    // yearly-low anchor ties it to real structure rather than a round
    // percentage, and it wins the max whenever that low sits near spot — which
    // is also exactly when it lands inside the accumulation band, so it gets
    // pulled clear of the band's floor before the reward-to-risk gate sees it.
    const stopLoss = stopClearOfEntry(
      entry,
      Math.max(price * 0.82, lowestLow(daily, 250) * 0.97),
      "bullish",
    );

    if (!bandsAreOrdered(entry, target, stopLoss, "bullish")) return null;
    if (rewardToRisk(entry, target, stopLoss, "bullish") < minRewardRiskFor(thresholds, "long-term"))
      return null;

    const upside = ((fairValue - price) / price) * 100;

    return {
      strategyId: valueInvesting.id,
      ticker: instrument.ticker,
      style: "long-term",
      direction: "bullish",
      confidence,
      conditions,
      reason:
        `${instrument.name.replace(/ Ltd$/, "")} trades at ${ratio(f.peRatio)} times earnings against a sector median of ${ratio(f.sectorPe)}, while still earning ${ratio(f.roe, 1)}% on equity with debt at just ${ratio(f.debtToEquity)} times. ` +
        `A business earning that return on capital rarely stays this far below its peer group indefinitely — a partial re-rating implies roughly ${upside.toFixed(0)}% upside over a multi-year hold.`,
      entry,
      target,
      stopLoss,
      holdDays: { min: 500, max: 1250 },
      risk: riskFromStopDistance((entry.low + entry.high) / 2, stopLoss),
      metrics: [
        { label: "P/E", value: `${ratio(f.peRatio)} (sector ${ratio(f.sectorPe)})` },
        { label: "P/B", value: `${ratio(f.pbRatio)} (sector ${ratio(f.sectorPb)})` },
        { label: "RoE", value: `${ratio(f.roe, 1)}%` },
        { label: "D/E", value: ratio(f.debtToEquity) },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// 2. Growth Investing
// ---------------------------------------------------------------------------

const growthInvesting: Strategy = {
  id: "lt-growth",
  name: "Growth Investing",
  style: "long-term",
  tagline: "Revenue and earnings compounding above 15% with expanding margins",
  holdPeriodLabel: "3–5 years",
  baseRisk: "Medium",
  explainer: {
    summary:
      "Targets businesses growing revenue and earnings well above the market average, where margins are widening rather than being bought with discounts.",
    origin:
      "Philip Fisher's Common Stocks and Uncommon Profits (1958) made the case that a small number of exceptional growth businesses, held for very long periods, outperform any amount of trading. T. Rowe Price built an institution on the same premise. The critical discipline Fisher emphasised is quality of growth: revenue growth funded by margin destruction or debt is not compounding, it is buying market share.",
    howItWorks: [
      "Three-year revenue CAGR must exceed the configured threshold — 12% at moderate tolerance — showing sustained top-line expansion rather than one strong year.",
      "Earnings CAGR must exceed revenue CAGR. This is the operating-leverage test: profits growing faster than sales means each additional rupee of revenue is more profitable than the last.",
      "Operating margins must be expanding across the last three years. A company discounting its way to growth shows rising revenue and falling margins, and the screen rejects it.",
      "Return on equity above the minimum ensures growth is being generated efficiently from shareholder capital rather than from continuous fundraising.",
      "Promoter pledge must be zero. Pledged promoter shares in a growth company are a well-established source of sudden, severe drawdowns in Indian markets.",
    ],
    signalConditions: [
      "3-year revenue CAGR above the configured minimum",
      "3-year earnings CAGR above revenue CAGR (operating leverage)",
      "Operating margin expanding across 3 years",
      "Return on equity above the configured minimum",
      "No promoter share pledging",
      "Debt-to-equity under 1.0",
    ],
    entryLogic:
      "Accumulation band just under the current price. Growth businesses rarely offer deep discounts; waiting for one usually means never owning the stock.",
    exitLogic:
      "Target is derived from earnings growth continuing for three years at a modestly compressed rate, held at the current multiple — deliberately not assuming further re-rating. Stop is a wide thesis-invalidation level.",
    worksBestWhen: [
      "The company has a long runway and a defensible position in its market",
      "Interest rates are stable or falling, which supports long-duration growth valuations",
      "Growth is organic rather than acquisition-driven",
    ],
    failsWhen: [
      "Growth decelerates — high-multiple stocks de-rate violently on the first miss",
      "Rates rise sharply, compressing the multiples investors will pay for future earnings",
      "The reported growth is inorganic and masks weak underlying performance",
    ],
    indicators: ["3-year revenue CAGR", "3-year earnings CAGR", "Operating margin trend", "RoE", "Promoter pledge"],
  },

  evaluate({ bundle, thresholds }): StrategySignal | null {
    const { fundamentals, quote, instrument, daily } = bundle;
    if (!fundamentals) return null;

    const f = fundamentals;
    const price = quote.price;
    const marginExpanding = isMonotonicRising(f.operatingMarginTrend);
    const marginDelta =
      f.operatingMarginTrend[f.operatingMarginTrend.length - 1] - f.operatingMarginTrend[0];

    const conditions: StrategyCondition[] = [
      condition(
        `Revenue CAGR above ${thresholds.minRevenueCagr}%`,
        f.revenueCagr3y > thresholds.minRevenueCagr,
        `3-year revenue CAGR ${ratio(f.revenueCagr3y, 1)}%`,
        3,
        true,
      ),
      condition(
        "Earnings growing faster than revenue",
        f.earningsCagr3y > f.revenueCagr3y,
        `Earnings CAGR ${ratio(f.earningsCagr3y, 1)}% vs revenue ${ratio(f.revenueCagr3y, 1)}%`,
        3,
        true,
      ),
      condition(
        "Operating margins expanding",
        marginExpanding,
        `${f.operatingMarginTrend.map((m) => `${m.toFixed(1)}%`).join(" → ")} (${marginDelta >= 0 ? "+" : ""}${marginDelta.toFixed(1)}pp)`,
        2.5,
      ),
      condition(
        `Return on equity above ${thresholds.minRoe}%`,
        f.roe > thresholds.minRoe,
        `RoE ${ratio(f.roe, 1)}%`,
        2.5,
        true,
      ),
      condition(
        "No promoter pledging",
        f.promoterPledge === 0,
        Number.isFinite(f.promoterPledge)
          ? f.promoterPledge === 0
            ? "No pledged shares"
            : `${ratio(f.promoterPledge, 1)}% of promoter holding pledged`
          : "Not reported by the active data source",
        2,
        // Promoter shareholding is an Indian regulatory disclosure that not
        // every provider carries. Where it exists it's a hard gate — pledged
        // promoter shares are a well-known source of sudden drawdowns. Where
        // it's unknown, the condition simply goes unmet and costs confidence,
        // rather than being silently treated as zero.
        Number.isFinite(f.promoterPledge),
      ),
      condition(
        "Debt under control",
        f.debtToEquity < 1.0,
        `D/E ${ratio(f.debtToEquity)}`,
        1.5,
      ),
    ];

    if (!requiredConditionsMet(conditions)) return null;

    const confidence = scoreConditions(conditions);
    if (confidence < thresholds.minConfidence) return null;

    // Project earnings forward 3 years at a conservatively decayed CAGR and
    // hold the multiple flat — no assumed re-rating on top of the growth.
    const decayedCagr = (f.earningsCagr3y * 0.75) / 100;
    const projectedEps = f.earningsPerShare * Math.pow(1 + decayedCagr, 3);
    const fairValue = projectedEps * f.peRatio;

    const entry = accumulationBand(price);
    const target = sanitiseBand(targetBand(fairValue, 9));
    const stopLoss = stopClearOfEntry(entry, price * 0.78, "bullish");

    if (!bandsAreOrdered(entry, target, stopLoss, "bullish")) return null;
    if (rewardToRisk(entry, target, stopLoss, "bullish") < minRewardRiskFor(thresholds, "long-term"))
      return null;

    const upside = ((fairValue - price) / price) * 100;

    return {
      strategyId: growthInvesting.id,
      ticker: instrument.ticker,
      style: "long-term",
      direction: "bullish",
      confidence,
      conditions,
      reason:
        `${instrument.name.replace(/ Ltd$/, "")} has grown revenue at ${ratio(f.revenueCagr3y, 1)}% a year over three years while earnings compounded faster at ${ratio(f.earningsCagr3y, 1)}%` +
        `${marginExpanding ? `, with operating margins widening from ${f.operatingMarginTrend[0].toFixed(1)}% to ${f.operatingMarginTrend[2].toFixed(1)}%` : ""}. ` +
        `Profits outpacing sales means the business is getting more efficient as it scales. Holding the current multiple flat, three more years of that compounding implies around ${upside.toFixed(0)}% upside.`,
      entry,
      target,
      stopLoss,
      holdDays: { min: 750, max: 1500 },
      risk: riskFromStopDistance((entry.low + entry.high) / 2, stopLoss),
      metrics: [
        { label: "Revenue CAGR", value: `${ratio(f.revenueCagr3y, 1)}%` },
        { label: "Earnings CAGR", value: `${ratio(f.earningsCagr3y, 1)}%` },
        { label: "Margin trend", value: `${marginDelta >= 0 ? "+" : ""}${marginDelta.toFixed(1)}pp` },
        { label: "RoE", value: `${ratio(f.roe, 1)}%` },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// 3. Dividend Growth
// ---------------------------------------------------------------------------

const dividendGrowth: Strategy = {
  id: "lt-dividend-growth",
  name: "Dividend Growth",
  style: "long-term",
  tagline: "Rising dividend per share for 5+ years on a sustainable payout",
  holdPeriodLabel: "3–5+ years",
  baseRisk: "Low",
  explainer: {
    summary:
      "Looks for companies that have raised their dividend every year for at least five years while keeping the payout ratio comfortable — income that grows rather than income that is merely high.",
    origin:
      "The dividend-growth approach was popularised in the United States through the 'Dividend Aristocrats' framing, but its analytical basis is older: John Burr Williams argued in 1938 that a share is worth the present value of the cash it will return to its owner. A rising dividend is difficult to fake — it must be paid in cash — which makes a long record of increases one of the more honest signals of underlying earnings quality.",
    howItWorks: [
      "Dividend per share must have risen in at least four of the last five year-on-year comparisons. A single cut breaks the record, and that is the point: the discipline of never cutting is what the strategy is buying.",
      "The payout ratio must sit between 20% and 70%. Below 20%, the dividend is incidental to the investment case; above 70%, there is little headroom to keep raising it through a bad year.",
      "A high yield with no growth is explicitly not what this screens for. The strategy checks dividend CAGR, not just the current yield — a stock yielding 6% with a flat dividend loses to inflation.",
      "Low debt matters because interest payments compete directly with dividends for the same cash flow.",
    ],
    signalConditions: [
      "Dividend per share rose in at least 4 of the last 5 years",
      "Dividend CAGR above 5%",
      "Payout ratio between 20% and 70%",
      "Dividend yield above 1%",
      "Debt-to-equity below 1.5",
      "Return on equity above 12%",
    ],
    entryLogic:
      "Accumulation band under the current price. For income strategies the entry price sets the yield on cost permanently, so patience on entry has a compounding effect over decades.",
    exitLogic:
      "Target reflects continued dividend growth at the historical rate with the yield holding steady — if the dividend rises and the yield stays constant, the price must rise proportionally. The stop is a thesis-invalidation level; in practice a dividend cut is the real exit signal.",
    worksBestWhen: [
      "Held for a long time, letting yield on cost compound",
      "The business is mature with predictable cash flows",
      "Dividends are reinvested rather than spent",
    ],
    failsWhen: [
      "Earnings fall and the dividend is cut — price and income drop together",
      "The payout is being funded by debt rather than free cash flow",
      "Inflation outpaces the dividend growth rate",
    ],
    indicators: ["5-year dividend per share history", "Dividend CAGR", "Payout ratio", "Dividend yield", "D/E"],
  },

  evaluate({ bundle, thresholds }): StrategySignal | null {
    const { fundamentals, quote, instrument } = bundle;
    if (!fundamentals) return null;

    const f = fundamentals;
    const price = quote.price;
    const rises = risingYears(f.dividendHistory);
    const dividendCagr = cagr(f.dividendHistory);

    const conditions: StrategyCondition[] = [
      condition(
        "Dividend raised in 4 of the last 5 years",
        rises >= 4,
        `Rose in ${rises} of ${f.dividendHistory.length - 1} year-on-year comparisons`,
        3,
        true,
      ),
      condition(
        "Dividend growing above 5% a year",
        Number.isFinite(dividendCagr) && dividendCagr > 5,
        Number.isFinite(dividendCagr) ? `Dividend CAGR ${ratio(dividendCagr, 1)}%` : "Insufficient history",
        3,
        true,
      ),
      condition(
        "Payout ratio between 20% and 70%",
        f.payoutRatio >= 20 && f.payoutRatio <= 70,
        `Payout ratio ${ratio(f.payoutRatio, 1)}%`,
        2.5,
        true,
      ),
      condition(
        "Yield above 1%",
        f.dividendYield > 1,
        `Dividend yield ${ratio(f.dividendYield, 2)}%`,
        2,
      ),
      condition(
        "Debt not competing with the dividend",
        f.debtToEquity < 1.5,
        `D/E ${ratio(f.debtToEquity)}`,
        1.5,
      ),
      condition(
        "Return on equity above 12%",
        f.roe > 12,
        `RoE ${ratio(f.roe, 1)}%`,
        1.5,
      ),
    ];

    if (!requiredConditionsMet(conditions)) return null;

    const confidence = scoreConditions(conditions);
    if (confidence < thresholds.minConfidence) return null;

    // If the dividend compounds and the yield reverts to its current level,
    // price has to rise by the same proportion.
    const growthFactor = Math.pow(1 + Math.min(dividendCagr, 18) / 100, 4);
    const fairValue = price * growthFactor;
    const entry = accumulationBand(price);
    const target = sanitiseBand(targetBand(fairValue, 8));
    const stopLoss = stopClearOfEntry(entry, price * 0.8, "bullish");

    if (!bandsAreOrdered(entry, target, stopLoss, "bullish")) return null;
    if (rewardToRisk(entry, target, stopLoss, "bullish") < minRewardRiskFor(thresholds, "long-term"))
      return null;

    const currentDps = f.dividendHistory[f.dividendHistory.length - 1];

    return {
      strategyId: dividendGrowth.id,
      ticker: instrument.ticker,
      style: "long-term",
      direction: "bullish",
      confidence,
      conditions,
      reason:
        `${instrument.name.replace(/ Ltd$/, "")} has raised its dividend in ${rises} of the last ${f.dividendHistory.length - 1} years, compounding it at ${ratio(dividendCagr, 1)}% a year to ${money(currentDps)} per share, ` +
        `while paying out only ${ratio(f.payoutRatio, 1)}% of earnings. That leaves room to keep raising it through a weak year — the record is what is being bought here, not the ${ratio(f.dividendYield, 2)}% current yield.`,
      entry,
      target,
      stopLoss,
      holdDays: { min: 750, max: 1800 },
      risk: riskFromStopDistance((entry.low + entry.high) / 2, stopLoss),
      metrics: [
        { label: "Dividend yield", value: `${ratio(f.dividendYield, 2)}%` },
        { label: "Dividend CAGR", value: `${ratio(dividendCagr, 1)}%` },
        { label: "Payout ratio", value: `${ratio(f.payoutRatio, 1)}%` },
        { label: "DPS", value: money(currentDps) },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// 4. Thematic / Sector Growth
// ---------------------------------------------------------------------------

/** Themes the screen treats as structural rather than cyclical. */
const STRUCTURAL_THEMES = new Set([
  "Renewable Energy",
  "EV Charging Infrastructure",
  "Hybrid & EV Transition",
  "Solar Manufacturing",
  "Defence Manufacturing",
  "Digital Infrastructure",
  "Data Centres",
  "5G Networks",
  "Semiconductors",
  "PLI Beneficiary",
  "Make in India",
  "Infrastructure Capex",
  "Power Capex Cycle",
  "AI Services",
]);

const thematicGrowth: Strategy = {
  id: "lt-thematic",
  name: "Thematic / Sector Growth",
  style: "long-term",
  tagline: "Exposure to structural themes — energy transition, defence, digital",
  holdPeriodLabel: "3–5+ years",
  baseRisk: "High",
  explainer: {
    summary:
      "Identifies companies positioned in multi-year structural shifts — renewable energy, EVs, defence manufacturing, digital infrastructure, PLI-linked sectors — where the tailwind is policy or technology rather than the business cycle.",
    origin:
      "Thematic investing grew out of top-down macro allocation and became mainstream in India after the Production Linked Incentive schemes launched in 2020, which explicitly targeted capital toward chosen sectors. The distinction it rests on is between cyclical demand, which mean-reverts, and structural demand, which reflects a durable change in how an economy operates. The risk is that themes attract capital faster than they generate earnings.",
    howItWorks: [
      "Each company is tagged with the structural themes it has genuine revenue exposure to. The screen requires at least one theme from a defined structural list — not merely operating in a fashionable sector.",
      "Exposure to two or more themes scores higher, since it suggests the business benefits from several independent tailwinds rather than one policy decision.",
      "A thematic tailwind must be showing up in the numbers: revenue CAGR above 12% is required. A theme that has not yet reached the income statement is a story, not an investment.",
      "Price must be in a long-term uptrend, above the 200-day average. Themes can be right and early, and being early in a de-rating market is indistinguishable from being wrong.",
      "This strategy carries a High base risk deliberately. Thematic valuations run ahead of earnings more often than any other category here.",
    ],
    signalConditions: [
      "Exposure to at least one structural theme",
      "3-year revenue CAGR above 12%",
      "Price above the 200-day exponential moving average",
      "Return on equity above 12%",
      "Debt-to-equity below 1.5 — capex-heavy themes can over-lever",
      "Earnings growth positive over three years",
    ],
    entryLogic:
      "Accumulation band under current price, staged deliberately. Thematic names are volatile and a single-day entry is rarely the right approach.",
    exitLogic:
      "Target assumes revenue growth continues for three years at a discounted rate with the multiple held flat. Stop is set wide — thematic stocks routinely draw down 30% inside a long-term uptrend.",
    worksBestWhen: [
      "Government policy support is explicit and funded, not merely announced",
      "The company is a direct beneficiary rather than a peripheral supplier",
      "Entry is made before the theme becomes a crowded consensus trade",
    ],
    failsWhen: [
      "The theme is real but the valuation already discounts a decade of success",
      "Policy support is withdrawn or redirected",
      "Competition commoditises the opportunity faster than expected",
    ],
    indicators: ["Structural theme tags", "3-year revenue CAGR", "200 EMA", "RoE", "D/E"],
  },

  evaluate({ bundle, thresholds }): StrategySignal | null {
    const { fundamentals, quote, instrument, daily } = bundle;
    if (!fundamentals || daily.length < 200) return null;

    const f = fundamentals;
    const price = quote.price;
    const structural = f.themes.filter((t) => STRUCTURAL_THEMES.has(t));
    if (structural.length === 0) return null;

    const ema200 = ema(closes(daily), 200);
    const ema200Now = last(ema200);

    const conditions: StrategyCondition[] = [
      condition(
        "Exposure to a structural theme",
        structural.length >= 1,
        structural.join(", "),
        3,
        true,
      ),
      condition(
        "Multiple structural tailwinds",
        structural.length >= 2,
        `${structural.length} qualifying theme${structural.length === 1 ? "" : "s"}`,
        1.5,
      ),
      condition(
        "Revenue CAGR above 12%",
        f.revenueCagr3y > 12,
        `3-year revenue CAGR ${ratio(f.revenueCagr3y, 1)}%`,
        3,
        true,
      ),
      condition(
        "Above the 200-day average",
        Number.isFinite(ema200Now) && price > ema200Now,
        `${money(price)} vs 200 EMA ${money(ema200Now)}`,
        2.5,
        true,
      ),
      condition(
        "Return on equity above 12%",
        f.roe > 12,
        `RoE ${ratio(f.roe, 1)}%`,
        2,
      ),
      leverageCondition(f, 1.5, 2),
      condition(
        "Earnings growing",
        f.earningsCagr3y > 0,
        `3-year earnings CAGR ${ratio(f.earningsCagr3y, 1)}%`,
        1.5,
      ),
    ];

    if (!requiredConditionsMet(conditions)) return null;

    const confidence = scoreConditions(conditions);
    if (confidence < thresholds.minConfidence) return null;

    const projectedGrowth = Math.pow(1 + (f.revenueCagr3y * 0.7) / 100, 3);
    const fairValue = price * projectedGrowth;
    const entry = accumulationBand(price);
    const target = sanitiseBand(targetBand(fairValue, 10));
    const stopLoss = stopClearOfEntry(entry, price * 0.72, "bullish");

    if (!bandsAreOrdered(entry, target, stopLoss, "bullish")) return null;
    if (rewardToRisk(entry, target, stopLoss, "bullish") < minRewardRiskFor(thresholds, "long-term"))
      return null;

    return {
      strategyId: thematicGrowth.id,
      ticker: instrument.ticker,
      style: "long-term",
      direction: "bullish",
      confidence,
      conditions,
      reason:
        `${instrument.name.replace(/ Ltd$/, "")} sits directly in ${structural.length > 1 ? "several structural themes" : "a structural theme"} — ${structural.join(", ").toLowerCase()} — where demand is driven by policy and technology shifts rather than the business cycle. ` +
        `Crucially the tailwind is already visible in the numbers, with revenue compounding at ${ratio(f.revenueCagr3y, 1)}% and price holding above its 200-day average. Thematic exposure is the highest-variance category here, so position size matters more than usual.`,
      entry,
      target,
      stopLoss,
      holdDays: { min: 750, max: 1800 },
      risk: "High",
      metrics: [
        { label: "Themes", value: structural.slice(0, 2).join(", ") },
        { label: "Revenue CAGR", value: `${ratio(f.revenueCagr3y, 1)}%` },
        { label: "200 EMA", value: money(ema200Now) },
        { label: "RoE", value: `${ratio(f.roe, 1)}%` },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// 5. Quality + Momentum Compounding
// ---------------------------------------------------------------------------

const qualityMomentum: Strategy = {
  id: "lt-quality-momentum",
  name: "Quality + Momentum Compounding",
  style: "long-term",
  tagline: "High RoCE, low debt, and price near its 52-week high",
  holdPeriodLabel: "2–5 years",
  baseRisk: "Medium",
  explainer: {
    summary:
      "Combines two factors that usually get treated as opposites: businesses with excellent returns on capital that the market has already started to recognise, shown by price trading near its 52-week high.",
    origin:
      "The quality factor was formalised by Robert Novy-Marx's 2013 work on gross profitability, and momentum by Jegadeesh and Titman in 1993. Cliff Asness and colleagues at AQR later showed the two combine unusually well because their failure modes are uncorrelated: quality suffers when cheap junk rallies, momentum suffers at sharp turning points. The intuition is that buying near a 52-week high feels wrong but historically is not — the discomfort is precisely why the effect persists.",
    howItWorks: [
      "Return on capital employed above 18% is the quality gate. RoCE is used rather than RoE because it cannot be flattered by leverage — a company can raise RoE simply by borrowing.",
      "Debt-to-equity must be low, since high-quality returns funded by debt are fragile.",
      "Earnings must have grown in at least three of the last four years, establishing that the returns are durable rather than a single good cycle.",
      "Price must sit within 12% of its 52-week high and above its 200-day average. This is the momentum leg: the market is already recognising the quality, and the strategy is not waiting for a discount that may never come.",
      "RSI is checked to avoid entering a genuinely parabolic move, where even a great business gives back months of gains.",
    ],
    signalConditions: [
      "Return on capital employed above 18%",
      "Debt-to-equity below 0.6",
      "Earnings rose in at least 3 of the last 4 years",
      "Price within 12% of its 52-week high",
      "Price above the 200-day exponential moving average",
      "RSI(14) below 78 — strong but not parabolic",
    ],
    entryLogic:
      "Accumulation band close to current price. This strategy explicitly does not wait for a pullback; the whole premise is that quality compounders spend most of their time near their highs.",
    exitLogic:
      "Target compounds current earnings forward three years at a conservative rate with the multiple held flat. The stop sits well below, at a level that would indicate the compounding itself has broken rather than ordinary volatility.",
    worksBestWhen: [
      "Held through cycles rather than traded around",
      "The business has real pricing power and a wide moat",
      "The market is rewarding earnings quality rather than speculative growth",
    ],
    failsWhen: [
      "A sharp macro reversal hits — momentum unwinds fastest at turning points",
      "Quality is already fully priced, leaving years of flat returns while earnings catch up",
      "The RoCE was driven by a cyclical peak that then normalises",
    ],
    indicators: ["RoCE", "D/E", "5-year profit history", "52-week high proximity", "200 EMA", "RSI(14)"],
  },

  evaluate({ bundle, thresholds }): StrategySignal | null {
    const { fundamentals, quote, instrument, daily } = bundle;
    if (!fundamentals || daily.length < 200) return null;

    const f = fundamentals;
    const price = quote.price;
    const priceSeries = closes(daily);
    const ema200Now = last(ema(priceSeries, 200));
    const rsiNow = last(rsi(priceSeries, 14));
    const high52 = Math.max(quote.week52High, highestHigh(daily, 250));
    const distanceFromHigh = ((high52 - price) / high52) * 100;
    const profitRises = risingYears(f.profitHistory);
    const oneYearReturn = percentChange(priceSeries, 250);

    const conditions: StrategyCondition[] = [
      condition(
        "Return on capital employed above 18%",
        f.roce > 18,
        `RoCE ${ratio(f.roce, 1)}%`,
        3,
        true,
      ),
      leverageCondition(f, 0.6, 2.5),
      condition(
        "Consistent earnings growth",
        profitRises >= 3,
        `Profits rose in ${profitRises} of the last 4 years`,
        2.5,
      ),
      condition(
        "Within 12% of the 52-week high",
        distanceFromHigh <= 12,
        `${distanceFromHigh.toFixed(1)}% below the 52-week high of ${money(high52)}`,
        3,
        true,
      ),
      condition(
        "Above the 200-day average",
        Number.isFinite(ema200Now) && price > ema200Now,
        `${money(price)} vs 200 EMA ${money(ema200Now)}`,
        2,
        true,
      ),
      condition(
        "Not parabolic (RSI < 78)",
        rsiNow < 78,
        `RSI(14) at ${ratio(rsiNow, 1)}`,
        1.5,
      ),
    ];

    if (!requiredConditionsMet(conditions)) return null;

    const confidence = scoreConditions(conditions);
    if (confidence < thresholds.minConfidence) return null;

    const conservativeGrowth = Math.max(Math.min(f.earningsCagr3y, 22), 8) * 0.7;
    const projectedEps = f.earningsPerShare * Math.pow(1 + conservativeGrowth / 100, 3);
    const fairValue = projectedEps * f.peRatio;

    const entry = accumulationBand(price);
    const target = sanitiseBand(targetBand(fairValue, 8));
    // The 200 EMA anchor only stays below the accumulation band because price
    // being above the 200 EMA is a required condition above. That is an
    // accidental guarantee — it would break the moment that gate were relaxed
    // — so the clearance is enforced here rather than relied upon.
    const stopLoss = stopClearOfEntry(entry, Math.max(price * 0.8, ema200Now * 0.92), "bullish");

    if (!bandsAreOrdered(entry, target, stopLoss, "bullish")) return null;
    if (rewardToRisk(entry, target, stopLoss, "bullish") < minRewardRiskFor(thresholds, "long-term"))
      return null;

    return {
      strategyId: qualityMomentum.id,
      ticker: instrument.ticker,
      style: "long-term",
      direction: "bullish",
      confidence,
      conditions,
      reason:
        `${instrument.name.replace(/ Ltd$/, "")} earns ${ratio(f.roce, 1)}% on the capital it employs with debt at just ${ratio(f.debtToEquity)} times equity, and the market is already paying attention — the stock sits ${distanceFromHigh.toFixed(1)}% below its 52-week high` +
        `${Number.isFinite(oneYearReturn) ? ` after a ${oneYearReturn.toFixed(0)}% year` : ""}. ` +
        `Buying quality near its highs feels uncomfortable, which is a large part of why the combination has historically worked.`,
      entry,
      target,
      stopLoss,
      holdDays: { min: 500, max: 1250 },
      risk: riskFromStopDistance((entry.low + entry.high) / 2, stopLoss),
      metrics: [
        { label: "RoCE", value: `${ratio(f.roce, 1)}%` },
        { label: "D/E", value: ratio(f.debtToEquity) },
        { label: "From 52w high", value: `${distanceFromHigh.toFixed(1)}%` },
        { label: "1-year return", value: Number.isFinite(oneYearReturn) ? `${oneYearReturn >= 0 ? "+" : ""}${oneYearReturn.toFixed(0)}%` : "—" },
      ],
    };
  },
};

export const LONG_TERM_STRATEGIES: Strategy[] = [
  valueInvesting,
  growthInvesting,
  dividendGrowth,
  thematicGrowth,
  qualityMomentum,
];
