"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Clock, Info, Target, TrendUp } from "@phosphor-icons/react";

import type { Recommendation } from "@/lib/engine/types";
import { cn, formatINR } from "@/lib/utils";
import { Badge, ChangePill, ExchangeBadge, RiskBadge } from "@/components/ui/badge";
import { ConfidenceRing } from "@/components/ui/confidence";
import { RangeGauge } from "@/components/ui/range-gauge";
import { WatchlistButton } from "@/components/watchlist/watchlist-button";
import { RecommendationInfoModal } from "./recommendation-info-modal";

export function RecommendationCard({
  recommendation,
  index = 0,
}: {
  recommendation: Recommendation;
  index?: number;
}) {
  const r = recommendation;
  const [infoOpen, setInfoOpen] = useState(false);
  const estGain = Math.max(0, ((r.sellRange.low - r.price) / r.price) * 100);

  return (
    <>
      <motion.article
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 30,
          delay: Math.min(index * 0.045, 0.35),
        }}
        className={cn(
          "flex flex-col h-full rounded-[22px] bg-bg-secondary",
          "border border-separator/30 dark:border-white/[0.08]",
          "shadow-card hover:shadow-md",
          "transition-all duration-300 ease-out",
          "overflow-hidden group",
        )}
      >
        <Link href={`/stock/${r.ticker}?strategy=${r.strategyId}`} className="flex-1 flex flex-col transition-transform duration-150 active:scale-[0.985]">
          <div className="px-5 pt-4 pb-2.5 flex-1 flex flex-col justify-between">
            <div>
              {/* Top Row: Ticker + Exchange + Match Score Pill */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <h3 className="text-lg font-bold tracking-tight text-label">
                    {r.ticker}
                  </h3>
                  <ExchangeBadge exchange={r.exchange} />
                </div>
                <div className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-caption2 font-bold text-emerald-600 dark:text-emerald-400">
                  <span>{r.confidenceScore}% Match</span>
                </div>
              </div>

              {/* Price Spotlight + Company Name */}
              <div className="mt-0.5">
                <div className="flex items-baseline gap-2">
                  <span className="numeric text-lg font-bold text-label">
                    {formatINR(r.price)}
                  </span>
                  <ChangePill value={r.changePercent} />
                </div>
                <p className="mt-0.5 truncate text-caption font-medium text-label-secondary/70">{r.name}</p>
              </div>

              {/* 2-Pill Trade Level Spotlight (Robinhood / Smallcase style) */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-emerald-500/[0.08] p-2.5 dark:bg-emerald-500/[0.12] border border-emerald-500/20">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Buy Zone</span>
                  <span className="numeric text-caption font-extrabold text-label">
                    {formatINR(r.buyRange.low)} – {formatINR(r.buyRange.high)}
                  </span>
                </div>
                <div className="rounded-xl bg-blue/[0.08] p-2.5 dark:bg-blue/[0.12] border border-blue/20">
                  <div className="flex items-center justify-between">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-blue">Target</span>
                    <span className="text-[10px] font-extrabold text-green">+{estGain.toFixed(1)}%</span>
                  </div>
                  <span className="numeric text-caption font-extrabold text-label">
                    {formatINR(r.sellRange.low)} – {formatINR(r.sellRange.high)}
                  </span>
                </div>
              </div>
            </div>

            {/* Position Gauge */}
            <div className="pt-3">
              <RangeGauge
                buyLow={r.buyRange.low}
                buyHigh={r.buyRange.high}
                sellLow={r.sellRange.low}
                sellHigh={r.sellRange.high}
                stopLoss={r.stopLoss}
                currentPrice={r.price}
              />
            </div>
          </div>
        </Link>

        {/* Footer Action Strip */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-separator/30 dark:border-white/[0.06] bg-bg-secondary">
          <div className="flex items-center gap-2 min-w-0">
            <Badge tone="blue" className="truncate">
              <TrendUp size={11} />
              {r.strategyName}
            </Badge>
            <RiskBadge level={r.riskLevel} />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setInfoOpen(true);
              }}
              className="flex items-center justify-center w-7 h-7 rounded-full bg-fill/[0.08] text-label-secondary hover:bg-accent/15 hover:text-accent transition-colors dark:bg-white/[0.08]"
              title="Strategy explanation"
              aria-label="View strategy explanation"
            >
              <Info size={15} />
            </button>
            <WatchlistButton ticker={r.ticker} name={r.name} exchange={r.exchange} size="sm" currentPrice={r.price} />
          </div>
        </div>
      </motion.article>

      <RecommendationInfoModal
        recommendation={r}
        isOpen={infoOpen}
        onClose={() => setInfoOpen(false)}
      />
    </>
  );
}
