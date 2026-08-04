"use client";

import { motion } from "framer-motion";
import { cn, formatINR } from "@/lib/utils";

interface RangeGaugeProps {
  buyLow: number;
  buyHigh: number;
  sellLow: number;
  sellHigh: number;
  stopLoss: number;
  currentPrice: number;
  /** Compact drops the axis labels for use inside dense cards. */
  compact?: boolean;
  className?: string;
}

/**
 * Visual price ladder: stop-loss, accumulation band, target band and where the
 * stock is trading right now, all on one scale.
 *
 * The point of showing this as a gauge rather than three lines of text is that
 * the *distances* carry the information — how far the stop sits below the entry
 * versus how far the target sits above it is the reward-to-risk shape, and it's
 * legible at a glance here in a way a list of numbers never is.
 */
export function RangeGauge({
  buyLow,
  buyHigh,
  sellLow,
  sellHigh,
  stopLoss,
  currentPrice,
  compact = false,
  className,
}: RangeGaugeProps) {
  const rawLow = Math.min(stopLoss, buyLow, currentPrice);
  const rawHigh = Math.max(sellHigh, currentPrice, buyHigh);
  const span = rawHigh - rawLow || 1;
  // Breathing room so markers at the extremes aren't clipped by the track ends.
  const domainLow = rawLow - span * 0.08;
  const domainHigh = rawHigh + span * 0.08;
  const domain = domainHigh - domainLow;

  const pct = (value: number) => ((value - domainLow) / domain) * 100;
  const clampPct = (value: number) => Math.max(0, Math.min(100, value));

  const stopPos = clampPct(pct(stopLoss));
  const buyStart = clampPct(pct(buyLow));
  const buyEnd = clampPct(pct(buyHigh));
  const sellStart = clampPct(pct(sellLow));
  const sellEnd = clampPct(pct(sellHigh));
  const pricePos = clampPct(pct(currentPrice));

  const priceInBuyZone = currentPrice >= buyLow && currentPrice <= buyHigh;
  const priceAboveTarget = currentPrice >= sellLow;

  return (
    <div className={cn("w-full", className)}>
      <div className={cn("relative w-full", compact ? "h-9" : "h-11")}>
        {/* Track */}
        <div
          className={cn(
            "absolute inset-x-0 top-1/2 -translate-y-1/2 overflow-hidden rounded-full",
            "bg-fill/[0.12] dark:bg-white/[0.08]",
            compact ? "h-6" : "h-7",
          )}
        >
          {/* Risk zone: everything below the stop */}
          <div
            className="absolute inset-y-0 left-0 bg-red/25"
            style={{ width: `${stopPos}%` }}
          />
          {/* Accumulation band */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 30, delay: 0.05 }}
            style={{
              left: `${buyStart}%`,
              width: `${Math.max(buyEnd - buyStart, 1.5)}%`,
              transformOrigin: "left",
            }}
            className="absolute inset-y-0 bg-green/70"
          />
          {/* Target band */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 30, delay: 0.12 }}
            style={{
              left: `${sellStart}%`,
              width: `${Math.max(sellEnd - sellStart, 1.5)}%`,
              transformOrigin: "left",
            }}
            className="absolute inset-y-0 bg-blue/70"
          />
        </div>

        {/* Stop-loss tick */}
        <div
          className="absolute top-1/2 h-[26px] w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red"
          style={{ left: `${stopPos}%` }}
          aria-hidden
        />

        {/* Current price marker */}
        <motion.div
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 26, delay: 0.2 }}
          className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${pricePos}%` }}
        >
          <div
            className={cn(
              "flex items-center justify-center rounded-full border-[2.5px] bg-bg-secondary shadow-pill",
              "border-label",
              compact ? "h-[22px] w-[22px]" : "h-[26px] w-[26px]",
            )}
          >
            <div className={cn("rounded-full bg-label", compact ? "h-2 w-2" : "h-2.5 w-2.5")} />
          </div>
        </motion.div>
      </div>

      {!compact && (
        <div className="mt-2 flex items-start justify-between gap-2 text-caption2">
          <GaugeLabel tone="red" title="Stop" value={formatINR(stopLoss, { decimals: 0 })} align="start" />
          <GaugeLabel
            tone="green"
            title="Buy zone"
            value={`${formatINR(buyLow, { decimals: 0 })} – ${formatINR(buyHigh, { decimals: 0 })}`}
            align="center"
          />
          <GaugeLabel
            tone="blue"
            title="Target zone"
            value={`${formatINR(sellLow, { decimals: 0 })} – ${formatINR(sellHigh, { decimals: 0 })}`}
            align="end"
          />
        </div>
      )}

      {!compact && (
        <p className="mt-2 text-caption text-label-secondary/60">
          Trading at{" "}
          <span className="font-semibold text-label">{formatINR(currentPrice)}</span>
          {priceInBuyZone
            ? " — inside the suggested buy zone."
            : priceAboveTarget
              ? " — already at or above the target zone."
              : currentPrice < buyLow
                ? " — below the suggested buy zone."
                : " — above the buy zone, waiting for a pullback."}
        </p>
      )}
    </div>
  );
}

function GaugeLabel({
  tone,
  title,
  value,
  align,
}: {
  tone: "red" | "green" | "blue";
  title: string;
  value: string;
  align: "start" | "center" | "end";
}) {
  const dot = tone === "red" ? "bg-red" : tone === "green" ? "bg-green" : "bg-blue";
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-0.5",
        align === "center" && "items-center text-center",
        align === "end" && "items-end text-right",
      )}
    >
      <span className="flex items-center gap-1 text-label-secondary/55">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
        {title}
      </span>
      <span className="numeric font-semibold text-label">{value}</span>
    </div>
  );
}
