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
          "flex flex-col h-full min-h-[290px] rounded-[20px] bg-bg-secondary",
          "border border-black/[0.04] dark:border-white/[0.06]",
          "shadow-[0_4px_24px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_32px_rgb(0,0,0,0.08)]",
          "dark:shadow-[0_4px_24px_rgb(0,0,0,0.2)] dark:hover:shadow-[0_8px_32px_rgb(0,0,0,0.3)]",
          "transition-all duration-300 ease-out",
          "overflow-hidden group",
        )}
      >
        <Link href={`/stock/${r.ticker}?strategy=${r.strategyId}`} className="flex-1 flex flex-col transition-transform duration-150 active:scale-[0.985]">
          <div className="px-5 pt-4 pb-2 flex-1 flex flex-col">

              {/* Header: Ticker + Confidence */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <h3 className="text-xl font-extrabold tracking-tight text-label">
                    {r.ticker}
                  </h3>
                  <ExchangeBadge exchange={r.exchange} />
                </div>
                <ConfidenceRing score={r.confidenceScore} size={44} />
              </div>

              {/* Price + Change */}
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="numeric text-lg font-bold text-label">
                  {formatINR(r.price)}
                </span>
                <ChangePill value={r.changePercent} />
              </div>

              {/* Company name */}
              <p className="mt-0.5 truncate text-[13px] text-label-secondary/70">{r.name}</p>

              {/* Strategy + Sector badges */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge tone="blue">
                  <TrendUp size={11} />
                  {r.strategyName}
                </Badge>
                <Badge tone="neutral">{r.sector}</Badge>
              </div>

              {/* Price ladder — pushed to bottom with breathing space */}
              <div className="mt-auto pt-4">
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

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3 relative">
          <div className="absolute top-0 left-5 right-5 h-[1px] bg-black/[0.05] dark:bg-white/[0.05]" />

          <RiskBadge level={r.riskLevel} />

          <span className="flex items-center gap-1 text-xs font-medium text-label-secondary/60">
            <Clock size={12} />
            {r.holdPeriodLabel}
          </span>
          <span className="flex items-center gap-1 text-xs font-bold text-green/90">
            <Target size={12} />
            +{estGain.toFixed(1)}%
          </span>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setInfoOpen(true);
              }}
              className="flex items-center justify-center w-7 h-7 rounded-full bg-black/[0.04] text-label-secondary hover:bg-blue/15 hover:text-blue transition-colors dark:bg-white/[0.08]"
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
