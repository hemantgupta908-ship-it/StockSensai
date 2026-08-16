import { PortfolioEntry } from "@/components/portfolio/portfolio-provider";

export type SuggestionAction = "HOLD" | "TAKE_PROFIT" | "CUT_LOSS" | "AVERAGE_DOWN";
export type UrgencyLevel = "none" | "low" | "medium" | "high";

export interface PositionSuggestion {
  action: SuggestionAction;
  reason: string;
  urgency: UrgencyLevel;
}

export function analyzePosition(entry: PortfolioEntry, currentPrice: number): PositionSuggestion {
  const pnlPct = ((currentPrice - entry.entryPrice) / entry.entryPrice) * 100;
  
  // 1. If we have a planned strategy with targets and stop loss
  if (entry.strategyId) {
    if (entry.recommendedSellLow !== null && currentPrice >= entry.recommendedSellLow) {
      return {
        action: "TAKE_PROFIT",
        reason: "Initial target reached.",
        urgency: "high"
      };
    }
    if (entry.recommendedStopLoss !== null && currentPrice <= entry.recommendedStopLoss) {
      return {
        action: "CUT_LOSS",
        reason: "Stop loss breached.",
        urgency: "high"
      };
    }
    
    // Accumulation logic for long-term if it's below buy zone but above stop loss
    if (
      entry.tradingStyle?.toLowerCase() === "long-term" &&
      entry.recommendedBuyLow !== null &&
      currentPrice < entry.recommendedBuyLow &&
      (entry.recommendedStopLoss === null || currentPrice > entry.recommendedStopLoss)
    ) {
      const newAvg = (entry.entryPrice + currentPrice) / 2;
      const targetSell = newAvg * 1.05;
      const fmtAvg = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(newAvg);
      const fmtTarget = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(targetSell);

      return {
        action: "AVERAGE_DOWN",
        reason: `Price is below the accumulation zone. Buy ${entry.quantity} more to drop average to ${fmtAvg}. Resell at ${fmtTarget} for a 5% profit.`,
        urgency: "low"
      };
    }
  }

  // 2. Fallback heuristics for manual trades based on style.
  //
  // Anything unrecognised is treated as swing, which is also what the analytics
  // screen buckets it as. That matters for positions logged against the intraday
  // and short-term styles the app used to offer: they still sit in the journal,
  // and judging a stale row against a 3% intraday stop would fire a CUT_LOSS on
  // a position the user has held for months.
  const known = ["swing", "positional", "long-term"] as const;
  const raw = entry.tradingStyle?.toLowerCase();
  const style = (known as readonly string[]).includes(raw ?? "") ? raw : "swing";

  if (style === "swing") {
    if (pnlPct >= 15) {
      return { action: "TAKE_PROFIT", reason: `Excellent swing return (${pnlPct.toFixed(1)}%).`, urgency: "medium" };
    }
    if (pnlPct <= -8) {
      return { action: "CUT_LOSS", reason: `Standard swing stop exceeded (${pnlPct.toFixed(1)}%).`, urgency: "medium" };
    }
  } else if (style === "positional") {
    if (pnlPct >= 30) {
      return { action: "TAKE_PROFIT", reason: `Target positional return hit (${pnlPct.toFixed(1)}%).`, urgency: "medium" };
    }
    if (pnlPct <= -15) {
      return { action: "CUT_LOSS", reason: `Positional stop exceeded (${pnlPct.toFixed(1)}%).`, urgency: "medium" };
    }
  } else if (style === "long-term") {
    if (pnlPct >= 100) {
      return { action: "TAKE_PROFIT", reason: `Capital doubled. Consider taking initial capital off the table.`, urgency: "low" };
    }
    if (pnlPct <= -20) {
      const newAvg = (entry.entryPrice + currentPrice) / 2;
      const targetSell = newAvg * 1.05;
      const fmtAvg = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(newAvg);
      const fmtTarget = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(targetSell);

      return { action: "AVERAGE_DOWN", reason: `Deep discount (${pnlPct.toFixed(1)}%). Buy ${entry.quantity} more to drop average to ${fmtAvg}. Resell at ${fmtTarget} for a 5% profit.`, urgency: "low" };
    }
  }

  // 3. Default Hold
  return {
    action: "HOLD",
    reason: pnlPct >= 0 ? "Trend is intact." : "Fluctuating within normal bounds.",
    urgency: "none"
  };
}
