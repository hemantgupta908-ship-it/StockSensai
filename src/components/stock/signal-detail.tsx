"use client";

import { Check, Minus } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";

import type { StrategySignal } from "@/lib/strategies/types";
import { cn, formatINR } from "@/lib/utils";
import { Badge, RiskBadge } from "@/components/ui/badge";
import { ConfidenceBar } from "@/components/ui/confidence";
import { RangeGauge } from "@/components/ui/range-gauge";
import { DisclaimerNotice } from "@/components/disclaimer";

/**
 * Full breakdown of one fired signal: the levels, the plain-language reason,
 * and — most importantly — the individual conditions with the actual numbers
 * behind each verdict. Showing the unmet conditions alongside the met ones is
 * the difference between a screener and a black box.
 */
export function SignalDetail({
  signal,
  currentPrice,
}: {
  signal: StrategySignal;
  /** The live quote, so the gauge marks where the stock actually is. */
  currentPrice: number;
}) {
  const isBullish = signal.direction === "bullish";
  const metCount = signal.conditions.filter((c) => c.met).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="space-y-4"
    >
      {/* Why this stock */}
      <section className="rounded-card border border-separator/40 bg-bg-secondary p-4 shadow-card dark:border-white/[0.06] dark:shadow-card-dark">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-footnote font-semibold uppercase tracking-wide text-label-secondary/55">
            Why this stock
          </h3>
          <Badge tone={isBullish ? "green" : "red"}>
            {isBullish ? "Bullish setup" : "Bearish — caution"}
          </Badge>
        </div>
        <p className="mt-2.5 text-subhead leading-relaxed text-label">{signal.reason}</p>

        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-caption font-medium text-label-secondary/60">
              Strategy match
            </span>
            <span className="numeric text-caption font-semibold text-label">
              {signal.confidence}/100 · {metCount} of {signal.conditions.length} conditions
            </span>
          </div>
          <ConfidenceBar score={signal.confidence} />
          <p className="mt-1.5 text-caption2 leading-snug text-label-secondary/50">
            How completely this setup matches the strategy&apos;s template — not a probability
            that the trade works.
          </p>
        </div>
      </section>

      {/* Levels */}
      <section className="rounded-card border border-separator/40 bg-bg-secondary p-4 shadow-card dark:border-white/[0.06] dark:shadow-card-dark">
        <h3 className="text-footnote font-semibold uppercase tracking-wide text-label-secondary/55">
          {isBullish ? "Suggested levels" : "Levels to watch"}
        </h3>

        <div className="mt-3">
          <RangeGauge
            buyLow={signal.entry.low}
            buyHigh={signal.entry.high}
            sellLow={signal.target.low}
            sellHigh={signal.target.high}
            stopLoss={signal.stopLoss}
            currentPrice={currentPrice}
          />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          <LevelStat
            label={isBullish ? "Buy range" : "Entry range"}
            value={`${formatINR(signal.entry.low)} – ${formatINR(signal.entry.high)}`}
            tone="green"
          />
          <LevelStat
            label="Target range"
            value={`${formatINR(signal.target.low)} – ${formatINR(signal.target.high)}`}
            tone="blue"
          />
          <LevelStat label="Stop loss" value={formatINR(signal.stopLoss)} tone="red" />
          <LevelStat
            label="Estimated hold"
            value={formatHold(signal.holdDays)}
          />
        </dl>

        <div className="mt-3 flex items-center gap-2">
          <RiskBadge level={signal.risk} />
          <span className="text-caption2 text-label-secondary/50">
            Risk grade reflects how far the stop sits from the entry.
          </span>
        </div>
      </section>

      {/* Conditions */}
      <section className="overflow-hidden rounded-card border border-separator/40 bg-bg-secondary shadow-card dark:border-white/[0.06] dark:shadow-card-dark">
        <div className="px-4 pb-1 pt-4">
          <h3 className="text-footnote font-semibold uppercase tracking-wide text-label-secondary/55">
            Conditions checked
          </h3>
        </div>
        <ul className="divide-y divide-separator/40 dark:divide-white/[0.06]">
          {signal.conditions.map((condition) => (
            <li key={condition.label} className="flex items-start gap-3 px-4 py-3">
              <span
                className={cn(
                  "mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full",
                  condition.met ? "bg-green/[0.18] text-green" : "bg-fill/[0.14] text-label-quaternary/40",
                )}
              >
                {condition.met ? (
                  <Check size={11} strokeWidth={3.4} />
                ) : (
                  <Minus size={11} strokeWidth={3.4} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p
                    className={cn(
                      "text-footnote font-medium",
                      condition.met ? "text-label" : "text-label-secondary/55",
                    )}
                  >
                    {condition.label}
                  </p>
                  {condition.required && (
                    <span className="rounded-[4px] bg-fill/[0.12] px-1 py-[1px] text-[9px] font-bold uppercase tracking-wide text-label-secondary/50">
                      Required
                    </span>
                  )}
                </div>
                <p className="numeric mt-0.5 text-caption leading-snug text-label-secondary/55">
                  {condition.detail}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Strategy readings */}
      {signal.metrics.length > 0 && (
        <section className="rounded-card border border-separator/40 bg-bg-secondary p-4 shadow-card dark:border-white/[0.06] dark:shadow-card-dark">
          <h3 className="text-footnote font-semibold uppercase tracking-wide text-label-secondary/55">
            Key readings
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
            {signal.metrics.map((metric) => (
              <div key={metric.label}>
                <dt className="text-caption text-label-secondary/55">{metric.label}</dt>
                <dd className="numeric mt-0.5 text-subhead font-semibold text-label">
                  {metric.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <Link
        href={`/strategies/${signal.strategyId}`}
        className="flex items-center justify-center rounded-card border border-separator/40 bg-bg-secondary px-4 py-3 text-subhead font-semibold text-blue shadow-card active:bg-fill/[0.06] dark:border-white/[0.06] dark:shadow-card-dark"
      >
        How this strategy works
      </Link>

      <DisclaimerNotice />
    </motion.div>
  );
}

function LevelStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "blue" | "red";
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-caption text-label-secondary/55">
        {tone && (
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              tone === "green" ? "bg-green" : tone === "blue" ? "bg-blue" : "bg-red",
            )}
          />
        )}
        {label}
      </dt>
      <dd className="numeric mt-0.5 text-subhead font-semibold text-label">{value}</dd>
    </div>
  );
}

function formatHold(hold: { min: number; max: number }) {
  if (hold.max >= 365) {
    const minYears = (hold.min / 250).toFixed(hold.min / 250 < 3 ? 1 : 0);
    const maxYears = (hold.max / 250).toFixed(0);
    return `${minYears}–${maxYears} years`;
  }
  return `${hold.min}–${hold.max} trading days`;
}
