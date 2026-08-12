"use client";

import { motion } from "framer-motion";
import { ArrowsClockwise } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";

interface RefreshButtonProps {
  onRefresh: () => void | Promise<void>;
  loading?: boolean;
  variant?: "icon" | "pill" | "button";
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}

export function RefreshButton({
  onRefresh,
  loading = false,
  variant = "icon",
  size = "md",
  label = "Refresh data",
  className,
}: RefreshButtonProps) {
  const iconSize = size === "sm" ? 14 : size === "lg" ? 18 : 16;

  if (variant === "pill") {
    return (
      <motion.button
        whileTap={{ scale: loading ? 1 : 0.93 }}
        onClick={() => {
          if (!loading) void onRefresh();
        }}
        disabled={loading}
        title={label}
        aria-label={label}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption2 font-semibold transition-colors",
          "bg-fill/[0.08] text-label-secondary hover:bg-fill/[0.14] active:bg-fill/[0.20]",
          "dark:bg-white/[0.08] dark:text-label-secondary dark:hover:bg-white/[0.12]",
          loading && "opacity-75 cursor-not-allowed",
          className,
        )}
      >
        <ArrowsClockwise
          size={iconSize}
          className={cn("shrink-0 transition-transform", loading && "animate-spin text-accent")}
        />
        <span>{loading ? "Refreshing..." : "Refresh"}</span>
      </motion.button>
    );
  }

  if (variant === "button") {
    return (
      <motion.button
        whileTap={{ scale: loading ? 1 : 0.95 }}
        onClick={() => {
          if (!loading) void onRefresh();
        }}
        disabled={loading}
        title={label}
        aria-label={label}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-footnote font-semibold transition-colors",
          "bg-accent/[0.12] text-accent hover:bg-accent/[0.18] active:bg-accent/[0.24]",
          loading && "opacity-75 cursor-not-allowed",
          className,
        )}
      >
        <ArrowsClockwise
          size={iconSize}
          className={cn("shrink-0", loading && "animate-spin")}
        />
        <span>{loading ? "Refreshing..." : label}</span>
      </motion.button>
    );
  }

  // Default "icon" variant (fits nicely in header trailing area)
  return (
    <motion.button
      whileTap={{ scale: loading ? 1 : 0.88 }}
      transition={{ type: "spring", stiffness: 600, damping: 24 }}
      onClick={() => {
        if (!loading) void onRefresh();
      }}
      disabled={loading}
      title={label}
      aria-label={label}
      className={cn(
        "relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-ios",
        "bg-fill/[0.10] text-label-secondary/70 transition-colors hover:text-label active:bg-fill/[0.18]",
        "dark:bg-white/[0.09] dark:active:bg-white/[0.16]",
        loading && "text-accent dark:text-accent",
        className,
      )}
    >
      <ArrowsClockwise
        size={iconSize}
        className={cn("transition-transform", loading && "animate-spin text-accent")}
      />
    </motion.button>
  );
}
