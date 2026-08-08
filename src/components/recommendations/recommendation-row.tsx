"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, Clock, Info, TrendingUp } from "lucide-react";

import type { Recommendation } from "@/lib/engine/types";
import { cn, formatINR } from "@/lib/utils";
import { Badge, ChangePill, ExchangeBadge, RiskBadge } from "@/components/ui/badge";
import { ConfidenceRing } from "@/components/ui/confidence";
import { WatchlistButton } from "@/components/watchlist/watchlist-button";
import { RecommendationInfoModal } from "./recommendation-info-modal";

/**
 * Compact list row — the alternative to `RecommendationCard`.
 *
 * The card exists to be read: it draws the price ladder to scale so the shape
 * of the reward-to-risk is visible at a glance. This exists to be *scanned*, so
 * it drops the gauge entirely and puts the same three numbers in fixed columns
 * that line up down the whole feed. Trying to keep a miniature gauge here was
 * the obvious idea and the wrong one — at row height it conveys no distance,
 * just decoration, while costing the horizontal space the numbers need.
 *
 * Below `lg` the columns would be narrower than the numbers in them, so the row
 * reflows into two stacked bands rather than shrinking the type further.
 */
export function RecommendationRow({
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
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          type: "spring",
          stiffness: 320,
          damping: 32,
          delay: Math.min(index * 0.025, 0.3),
        }}
        className={cn(
          "group relative rounded-[14px] bg-bg-secondary",
          "border border-black/[0.04] dark:border-white/[0.06]",
          "shadow-[0_2px_10px_rgb(0,0,0,0.03)] hover:shadow-[0_4px_18px_rgb(0,0,0,0.07)]",
          "dark:shadow-[0_2px_10px_rgb(0,0,0,0.18)] dark:hover:shadow-[0_4px_18px_rgb(0,0,0,0.28)]",
          "transition-shadow duration-200",
        )}
      >
        <div className="flex items-stretch">
          <Link
            href={`/stock/${r.ticker}?strategy=${r.strategyId}`}
            className="flex min-w-0 flex-1 flex-col gap-2.5 rounded-l-[14px] px-3.5 py-3 active:bg-fill/[0.04] lg:flex-row lg:items-center lg:gap-4"
          >
            {/* Identity */}
            <div className="flex min-w-0 items-center gap-2.5 lg:flex-1">
              <ConfidenceRing score={r.confidenceScore} size={38} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h3 className="truncate text-[15px] font-extrabold tracking-tight text-label">
                    {r.ticker}
                  </h3>
                  <ExchangeBadge exchange={r.exchange} />
                </div>
                <p className="mt-0.5 truncate text-[12px] text-label-secondary/65">{r.name}</p>
              </div>

              {/* Price rides alongside the name on narrow screens, where there
                  is no column for it. */}
              <div className="flex shrink-0 flex-col items-end lg:hidden">
                <span className="numeric text-[15px] font-bold text-label">
                  {formatINR(r.price)}
                </span>
                <ChangePill value={r.changePercent} />
              </div>
            </div>

            {/* Strategy — the reason this row is here at all. */}
            <div className="flex min-w-0 shrink-0 items-center gap-1.5 lg:w-[210px]">
              <Badge tone="blue">
                <TrendingUp size={11} strokeWidth={2.6} />
                <span className="truncate">{r.strategyName}</span>
              </Badge>
            </div>

            {/* Price column, desktop only */}
            <div className="hidden shrink-0 flex-col items-end lg:flex lg:w-[104px]">
              <span className="numeric text-[15px] font-bold text-label">
                {formatINR(r.price)}
              </span>
              <ChangePill value={r.changePercent} />
            </div>

            {/*
              The three levels, in the same order as the card's gauge: risk on
              the left, reward on the right.

              Three columns only from `lg`. Narrower than that, the actions rail
              leaves about 225px here, while a range like "₹9,089 – ₹9,254"
              needs 88px on its own — three of them clip, and a clipped price is
              worse than no price. Below `lg` they stack as label/value rows
              instead, which costs about 40px of row height and keeps every
              figure whole.
            */}
            <div className="grid shrink-0 grid-cols-1 gap-x-2 gap-y-0.5 rounded-[10px] bg-fill/[0.04] px-2.5 py-2 dark:bg-white/[0.04] lg:w-[268px] lg:grid-cols-3 lg:gap-2 lg:bg-transparent lg:px-0 lg:py-0 lg:dark:bg-transparent">
              <Level tone="red" label="Stop" value={formatINR(r.stopLoss, { decimals: 0 })} />
              <Level
                tone="green"
                label="Buy zone"
                value={`${formatINR(r.buyRange.low, { decimals: 0 })} – ${formatINR(r.buyRange.high, { decimals: 0 })}`}
              />
              <Level
                tone="blue"
                label="Target"
                value={`${formatINR(r.sellRange.low, { decimals: 0 })} – ${formatINR(r.sellRange.high, { decimals: 0 })}`}
                align="end"
              />
            </div>

            {/* Meta */}
            <div className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1 lg:w-[164px] lg:justify-end">
              <RiskBadge level={r.riskLevel} />
              <span className="flex items-center gap-1 text-[11px] font-medium text-label-secondary/60">
                <Clock size={11} strokeWidth={2.2} />
                {r.holdPeriodLabel}
              </span>
              <span className="numeric text-[12px] font-bold text-green/90">
                +{estGain.toFixed(1)}%
              </span>
            </div>
          </Link>

          {/* Actions sit outside the Link so they don't need click interception. */}
          <div className="flex shrink-0 items-center gap-1 pr-2.5 pl-1">
            <button
              onClick={() => setInfoOpen(true)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/[0.04] text-label-secondary transition-colors hover:bg-blue/15 hover:text-blue dark:bg-white/[0.08]"
              title="Strategy explanation"
              aria-label={`View strategy explanation for ${r.ticker}`}
            >
              <Info size={14} strokeWidth={2.2} />
            </button>
            <WatchlistButton ticker={r.ticker} name={r.name} exchange={r.exchange} size="sm" currentPrice={r.price} />
            <ChevronRight
              size={16}
              strokeWidth={2.4}
              className="hidden shrink-0 text-label-quaternary/30 sm:block"
              aria-hidden
            />
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

function Level({
  tone,
  label,
  value,
  align = "start",
}: {
  tone: "red" | "green" | "blue";
  label: string;
  value: string;
  align?: "start" | "end";
}) {
  const dot = tone === "red" ? "bg-red" : tone === "green" ? "bg-green" : "bg-blue";
  return (
    <div
      className={cn(
        // Label beside the value while stacked, above it once in columns.
        "flex min-w-0 items-baseline justify-between gap-2",
        "lg:flex-col lg:items-start lg:justify-start lg:gap-0",
        align === "end" && "lg:items-end lg:text-right",
      )}
    >
      <span className="flex shrink-0 items-center gap-1 text-[10px] leading-tight text-label-secondary/55">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
        {label}
      </span>
      {/* Never wraps mid-number; the layout above guarantees it has the room. */}
      <span className="numeric whitespace-nowrap text-[12px] font-bold tabular-nums text-label">
        {value}
      </span>
    </div>
  );
}
