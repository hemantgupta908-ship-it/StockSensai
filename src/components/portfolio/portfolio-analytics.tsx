"use client";

import { motion } from "framer-motion";
import { Award, BarChart3, TrendingDown, TrendingUp, PieChart } from "lucide-react";
import type { PortfolioEntry } from "./portfolio-provider";
import {
  TRADING_STYLES,
  TRADING_STYLE_LABELS,
  type TradingStyle,
} from "@/lib/strategies/types";
import { formatINR } from "@/lib/utils";

interface PortfolioAnalyticsProps {
  entries: PortfolioEntry[];
  quotes: Record<string, { price: number }>;
}

/** Matches the accent each style is given on the Strategies screen. */
const STYLE_BAR_COLOUR: Record<TradingStyle, string> = {
  intraday: "bg-red",
  "short-term": "bg-amber",
  swing: "bg-blue",
  positional: "bg-purple",
  "long-term": "bg-green",
};

function isTradingStyle(value: string | null | undefined): value is TradingStyle {
  return value != null && (TRADING_STYLES as readonly string[]).includes(value);
}

export function PortfolioAnalytics({ entries, quotes }: PortfolioAnalyticsProps) {
  const openEntries = entries.filter((e) => e.exitPrice === null);
  const closedEntries = entries.filter((e) => e.exitPrice !== null);

  // Closed trades win rate analytics
  const closedTradesPnl = closedEntries.map((e) => ({
    entry: e,
    pnl: ((e.exitPrice ?? 0) - e.entryPrice) * e.quantity,
    pnlPct: (((e.exitPrice ?? 0) - e.entryPrice) / e.entryPrice) * 100,
  }));

  const winningTrades = closedTradesPnl.filter((t) => t.pnl > 0);
  const winRatePct =
    closedEntries.length > 0
      ? Math.round((winningTrades.length / closedEntries.length) * 100)
      : 0;

  // Best & Worst trades (across open + closed)
  const allTradesPnl = entries.map((e) => {
    const markPrice = e.exitPrice !== null ? e.exitPrice : (quotes[e.ticker]?.price ?? e.entryPrice);
    const pnl = (markPrice - e.entryPrice) * e.quantity;
    const pnlPct = ((markPrice - e.entryPrice) / e.entryPrice) * 100;
    return { entry: e, pnl, pnlPct };
  });

  const sortedTrades = [...allTradesPnl].sort((a, b) => b.pnl - a.pnl);
  const bestTrade = sortedTrades[0] && sortedTrades[0].pnl > 0 ? sortedTrades[0] : null;
  const worstTrade =
    sortedTrades.length > 0 && sortedTrades[sortedTrades.length - 1].pnl < 0
      ? sortedTrades[sortedTrades.length - 1]
      : null;

  // Trading style allocation (open positions value). Positions logged before a
  // style existed, or against one since removed, fall back to swing rather than
  // creating a phantom bucket that no legend explains.
  const styleAllocation = openEntries.reduce(
    (acc, e) => {
      const price = quotes[e.ticker]?.price ?? e.entryPrice;
      const val = price * e.quantity;
      const style: TradingStyle = isTradingStyle(e.tradingStyle) ? e.tradingStyle : "swing";
      acc.byStyle[style] += val;
      acc.total += val;
      return acc;
    },
    {
      byStyle: Object.fromEntries(TRADING_STYLES.map((s) => [s, 0])) as Record<TradingStyle, number>,
      total: 0,
    },
  );

  const usedStyles = TRADING_STYLES.filter((s) => styleAllocation.byStyle[s] > 0);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="space-y-3 overflow-hidden"
    >
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard
          icon={BarChart3}
          label="Closed Win Rate"
          value={closedEntries.length > 0 ? `${winRatePct}%` : "N/A"}
          subText={closedEntries.length > 0 ? `${winningTrades.length} of ${closedEntries.length} won` : "No closed trades"}
          tone={closedEntries.length > 0 && winRatePct >= 50 ? "green" : undefined}
        />
        <StatCard
          icon={Award}
          label="Total Positions"
          value={String(entries.length)}
          subText={`${openEntries.length} open · ${closedEntries.length} closed`}
        />
        <StatCard
          icon={TrendingUp}
          label="Best Trade"
          value={bestTrade ? `${bestTrade.entry.ticker}` : "N/A"}
          subText={bestTrade ? `+${formatINR(bestTrade.pnl, { decimals: 0 })} (+${bestTrade.pnlPct.toFixed(1)}%)` : "No gains logged"}
          tone={bestTrade ? "green" : undefined}
        />
        <StatCard
          icon={TrendingDown}
          label="Worst Trade"
          value={worstTrade ? `${worstTrade.entry.ticker}` : "N/A"}
          subText={worstTrade ? `${formatINR(worstTrade.pnl, { decimals: 0 })} (${worstTrade.pnlPct.toFixed(1)}%)` : "No losses logged"}
          tone={worstTrade ? "red" : undefined}
        />
      </div>

      {/* Style Allocation Bar */}
      {styleAllocation.total > 0 && (
        <div className="rounded-card border border-separator/40 bg-bg-secondary p-3.5 shadow-card dark:border-white/[0.06] dark:shadow-card-dark">
          <div className="flex items-center justify-between text-caption font-semibold text-label">
            <span className="flex items-center gap-1.5">
              <PieChart size={14} className="text-blue" />
              Style Allocation
            </span>
            <span className="text-caption2 text-label-secondary/60">
              Total Open Value: {formatINR(styleAllocation.total, { decimals: 0 })}
            </span>
          </div>

          <div className="mt-2.5 flex h-2 w-full overflow-hidden rounded-full bg-separator/30 dark:bg-white/[0.08]">
            {usedStyles.map((style) => {
              const share = (styleAllocation.byStyle[style] / styleAllocation.total) * 100;
              return (
                <div
                  key={style}
                  className={`${STYLE_BAR_COLOUR[style]} transition-all`}
                  style={{ width: `${share}%` }}
                  title={`${TRADING_STYLE_LABELS[style]}: ${Math.round(share)}%`}
                />
              );
            })}
          </div>

          {/* Only styles actually held get a legend entry — five zero-percent
              rows would push the real numbers off a phone screen. */}
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-caption2 text-label-secondary/70">
            {usedStyles.map((style) => (
              <span key={style} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${STYLE_BAR_COLOUR[style]}`} />
                {TRADING_STYLE_LABELS[style]} (
                {Math.round((styleAllocation.byStyle[style] / styleAllocation.total) * 100)}%)
              </span>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  subText,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  subText: string;
  tone?: "green" | "red";
}) {
  return (
    <div className="rounded-card border border-separator/40 bg-bg-secondary p-3 shadow-card dark:border-white/[0.06] dark:shadow-card-dark">
      <div className="flex items-center gap-1.5 text-caption2 text-label-secondary/55">
        <Icon size={13} />
        <span>{label}</span>
      </div>
      <p
        className={`numeric mt-1 text-headline font-bold ${
          tone === "green" ? "text-green" : tone === "red" ? "text-red" : "text-label"
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 truncate text-caption2 text-label-secondary/50">{subText}</p>
    </div>
  );
}
