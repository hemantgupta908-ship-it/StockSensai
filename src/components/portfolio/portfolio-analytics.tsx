"use client";

import { motion } from "framer-motion";
import { ChartBar, ChartPie, Medal, TrendDown, TrendUp } from "@phosphor-icons/react";
import type { PortfolioEntry } from "./portfolio-provider";
import {
  TRADING_STYLES,
  TRADING_STYLE_LABELS,
  type TradingStyle,
} from "@/lib/strategies/types";
import { formatINR } from "@/lib/utils";
import { EquityChart, type EquityDataPoint } from "./equity-chart";
import { useMemo } from "react";
import { useSectorAllocation } from "./use-sector-allocation";
import { SectorHeatmap } from "./sector-heatmap";

export interface PortfolioAnalyticsProps {
  entries: PortfolioEntry[];
  quotes: Record<string, { price: number }>;
}

/** Matches the accent each style is given on the Strategies screen. */
const STYLE_BAR_COLOUR: Record<TradingStyle, string> = {
  swing: "bg-blue",
  positional: "bg-purple",
  "long-term": "bg-green",
};

function isTradingStyle(value: string | null | undefined): value is TradingStyle {
  return value != null && (TRADING_STYLES as readonly string[]).includes(value);
}

export function PortfolioAnalytics({ entries, quotes }: PortfolioAnalyticsProps) {
  // Memoised because `equityCurveData` keys off `closedEntries`, which then
  // feeds `EquityChart`'s effect. A fresh array each render would tear down and
  // rebuild the whole lightweight-chart instance on every parent render.
  const openEntries = useMemo(() => entries.filter((e) => e.exitPrice === null), [entries]);
  const closedEntries = useMemo(() => entries.filter((e) => e.exitPrice !== null), [entries]);
  const { allocation, loading: allocationLoading } = useSectorAllocation(entries, quotes);

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

  // Realized P&L over time (Equity Curve)
  const equityCurveData = useMemo(() => {
    if (closedEntries.length === 0) return [];

    // Sort closed trades chronologically by exit date
    const chronological = [...closedEntries].sort((a, b) => {
      const dateA = a.exitDate || "";
      const dateB = b.exitDate || "";
      return dateA.localeCompare(dateB);
    });

    let cumulative = 0;
    const dataPoints: EquityDataPoint[] = [];

    // Group by exitDate so multiple trades on the same day collapse into one step.
    const byDate = new Map<string, number>();
    for (const trade of chronological) {
      if (!trade.exitDate) continue;
      // Strip time if it's a full ISO string, or assume it's YYYY-MM-DD
      const dateKey = trade.exitDate.split("T")[0];
      const pnl = ((trade.exitPrice ?? 0) - trade.entryPrice) * trade.quantity;
      byDate.set(dateKey, (byDate.get(dateKey) || 0) + pnl);
    }

    for (const [date, dailyPnl] of Array.from(byDate.entries())) {
      cumulative += dailyPnl;
      dataPoints.push({ time: date, value: cumulative });
    }

    return dataPoints;
  }, [closedEntries]);

  // The running maximum, which is what "peak" means. The last point is just the
  // current net — equal to the peak only when the curve never drew down.
  const peakPnl = useMemo(
    () => equityCurveData.reduce((max, p) => Math.max(max, p.value), 0),
    [equityCurveData],
  );

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="space-y-3 overflow-hidden"
    >
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard
          icon={ChartBar}
          label="Closed Win Rate"
          value={closedEntries.length > 0 ? `${winRatePct}%` : "N/A"}
          subText={closedEntries.length > 0 ? `${winningTrades.length} of ${closedEntries.length} won` : "No closed trades"}
          tone={closedEntries.length > 0 && winRatePct >= 50 ? "green" : undefined}
        />
        <StatCard
          icon={Medal}
          label="Total Positions"
          value={String(entries.length)}
          subText={`${openEntries.length} open · ${closedEntries.length} closed`}
        />
        <StatCard
          icon={TrendUp}
          label="Best Trade"
          value={bestTrade ? `${bestTrade.entry.ticker}` : "N/A"}
          subText={bestTrade ? `+${formatINR(bestTrade.pnl, { decimals: 0 })} (+${bestTrade.pnlPct.toFixed(1)}%)` : "No gains logged"}
          tone={bestTrade ? "green" : undefined}
        />
        <StatCard
          icon={TrendDown}
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
              <ChartPie size={14} className="text-blue" />
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

      {/* Sector Allocation Heatmap */}
      {openEntries.length > 0 && (
        <div className="rounded-card border border-separator/40 bg-bg-secondary p-3.5 shadow-card dark:border-white/[0.06] dark:shadow-card-dark">
          <div className="flex items-center justify-between text-caption font-semibold text-label mb-3">
            <span className="flex items-center gap-1.5">
              <ChartPie size={14} className="text-purple" />
              Sector Allocation
            </span>
          </div>
          <SectorHeatmap allocation={allocation} loading={allocationLoading} />
        </div>
      )}

      {/* Equity Curve */}
      <div className="rounded-card border border-separator/40 bg-bg-secondary p-3.5 shadow-card dark:border-white/[0.06] dark:shadow-card-dark">
        <div className="flex items-center justify-between text-caption font-semibold text-label mb-2">
          <span className="flex items-center gap-1.5">
            <TrendUp size={14} className="text-green" />
            Realized P&L Equity Curve
          </span>
          {equityCurveData.length > 0 && (
            <span className="text-caption2 text-label-secondary/60">
              Net: {formatINR(equityCurveData[equityCurveData.length - 1].value, { decimals: 0 })}
              {peakPnl > equityCurveData[equityCurveData.length - 1].value && (
                <> · peak {formatINR(peakPnl, { decimals: 0 })}</>
              )}
            </span>
          )}
        </div>
        <div className="relative h-[200px] w-full mt-2">
          {equityCurveData.length > 0 ? (
            <EquityChart data={equityCurveData} />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-secondary/40 text-center text-label-secondary/60">
              <ChartBar size={24} className="mb-2 opacity-50" />
              <p className="text-caption font-semibold text-label">No closed trades yet</p>
              <p className="text-caption2 mt-0.5">Close your first trade to unlock your Equity Curve.</p>
            </div>
          )}
        </div>
      </div>
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
