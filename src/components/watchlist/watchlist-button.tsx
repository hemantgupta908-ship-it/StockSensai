"use client";

import { motion } from "framer-motion";
import { Star } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { useWatchlist } from "./watchlist-provider";

export function WatchlistButton({
  ticker,
  name,
  exchange,
  size = "md",
  withLabel = false,
  currentPrice,
  className,
}: {
  ticker: string;
  name: string;
  exchange: string;
  size?: "sm" | "md";
  withLabel?: boolean;
  currentPrice?: number;
  className?: string;
}) {
  const { has, toggle } = useWatchlist();
  const saved = has(ticker);
  const iconSize = size === "sm" ? 15 : 18;

  return (
    <motion.button
      whileTap={{ scale: 0.86 }}
      transition={{ type: "spring", stiffness: 600, damping: 24 }}
      onClick={(event) => {
        // These buttons sit inside link cards; a tap must not navigate.
        event.preventDefault();
        event.stopPropagation();
        void toggle({ ticker, name, exchange, priceAtAddition: currentPrice });
      }}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${ticker} from watchlist` : `Add ${ticker} to watchlist`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full transition-colors duration-200",
        // The visual circle stays small inside a dense card, but the tappable
        // area is expanded to ~44px with a transparent overlay. Both Material
        // (48dp) and the iOS HIG (44pt) put the minimum well above 28px, and
        // this matters more on a phone than the pixel size of the icon does.
        "relative after:absolute after:-inset-2 after:rounded-full after:content-['']",
        withLabel ? "px-3 py-1.5" : size === "sm" ? "h-7 w-7 justify-center" : "h-9 w-9 justify-center",
        saved
          ? "bg-amber-500/15 text-amber-500"
          : "bg-fill/[0.10] text-label-secondary hover:bg-amber-500/10 hover:text-amber-500 dark:bg-white/[0.09]",
        className,
      )}
    >
      <motion.span
        key={saved ? "on" : "off"}
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        whileHover={{ scale: 1.12 }}
        transition={{ type: "spring", stiffness: 500, damping: 20 }}
        className="flex"
      >
        <Star
          size={iconSize}
          weight={saved ? "fill" : "regular"}
          className={saved ? "text-amber-500" : "text-label-secondary/80"}
        />
      </motion.span>
      {withLabel && (
        <span className="text-footnote font-semibold">{saved ? "Saved" : "Watchlist"}</span>
      )}
    </motion.button>
  );
}
