"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Clock, TrendingUp } from "lucide-react";

import type { Recommendation } from "@/lib/engine/types";
import { cn, formatINR } from "@/lib/utils";
import { Badge, ChangePill, ExchangeBadge, RiskBadge } from "@/components/ui/badge";
import { ConfidenceRing } from "@/components/ui/confidence";
import { RangeGauge } from "@/components/ui/range-gauge";
import { WatchlistButton } from "@/components/watchlist/watchlist-button";

export function RecommendationCard({
  recommendation,
  index = 0,
}: {
  recommendation: Recommendation;
  index?: number;
}) {
  const r = recommendation;

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30,
        // Stagger so the feed assembles rather than snapping in all at once.
        delay: Math.min(index * 0.045, 0.35),
      }}
      className={cn(
        "rounded-card bg-bg-secondary",
        "border border-separator/40 dark:border-white/[0.06]",
        "shadow-card dark:shadow-card-dark",
        "overflow-hidden",
      )}
    >
      <motion.div whileTap={{ scale: 0.985 }} transition={{ type: "spring", stiffness: 500, damping: 32 }}>
        <Link href={`/stock/${r.ticker}?strategy=${r.strategyId}`} className="block">
          <div className="p-4">
            {/* Identity row */}
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h3 className="truncate text-headline font-bold tracking-tight text-label">
                    {r.ticker}
                  </h3>
                  <ExchangeBadge exchange={r.exchange} />
                </div>
                <p className="mt-0.5 truncate text-footnote text-label-secondary/60">{r.name}</p>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="numeric text-body font-semibold text-label">
                    {formatINR(r.price)}
                  </span>
                  <ChangePill value={r.changePercent} />
                </div>
              </div>

              <div className="flex flex-col items-center gap-1">
                <ConfidenceRing score={r.confidenceScore} size={46} />
                <span className="text-[10px] font-medium uppercase tracking-wide text-label-secondary/45">
                  Match
                </span>
              </div>
            </div>

            {/* Strategy attribution */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Badge tone="blue">
                <TrendingUp size={11} strokeWidth={2.6} />
                {r.strategyName}
              </Badge>
              <Badge tone="neutral">{r.sector}</Badge>
            </div>

            {/* Why this stock */}
            <p className="mt-3 line-clamp-3 text-footnote leading-relaxed text-label-secondary/75">
              {r.reason}
            </p>

            {/* Price ladder */}
            <div className="mt-4">
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
      </motion.div>

      {/* Footer meta */}
      <div className="flex items-center gap-2 border-t border-separator/40 px-4 py-2.5 dark:border-white/[0.06]">
        <RiskBadge level={r.riskLevel} />
        <span className="flex items-center gap-1 text-caption2 font-medium text-label-secondary/55">
          <Clock size={11} strokeWidth={2.4} />
          {r.holdPeriodLabel}
        </span>
        <div className="ml-auto">
          <WatchlistButton ticker={r.ticker} name={r.name} exchange={r.exchange} size="sm" />
        </div>
      </div>
    </motion.article>
  );
}
