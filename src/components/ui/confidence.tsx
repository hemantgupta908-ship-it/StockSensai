"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Confidence is the share of the strategy's weighted conditions that were met.
 * It is deliberately not presented as a probability — it says how completely
 * this setup matches its own template, not how likely the trade is to work.
 */
export function ConfidenceRing({
  score,
  size = 44,
  className,
}: {
  score: number;
  size?: number;
  className?: string;
}) {
  const stroke = size >= 44 ? 4 : 3.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);

  const colour = score >= 75 ? "text-green" : score >= 55 ? "text-blue" : "text-amber";

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Confidence score ${score} out of 100`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-fill/[0.15] dark:stroke-white/[0.10]"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ type: "spring", stiffness: 120, damping: 24, delay: 0.1 }}
          className={cn("stroke-current", colour)}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn("numeric font-bold", size >= 44 ? "text-footnote" : "text-caption2")}>
          {Math.round(score)}
        </span>
      </div>
    </div>
  );
}

export function ConfidenceBar({ score, className }: { score: number; className?: string }) {
  const colour = score >= 75 ? "bg-green" : score >= 55 ? "bg-blue" : "bg-amber";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-fill/[0.14] dark:bg-white/[0.09]", className)}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, score))}%` }}
        transition={{ type: "spring", stiffness: 140, damping: 26 }}
        className={cn("h-full rounded-full", colour)}
      />
    </div>
  );
}
