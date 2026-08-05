"use client";

/**
 * Crossing point between the app's two environments.
 *
 * StockSensei and Budget are independent products that ship together, so the
 * switch reads as "which app am I in" rather than as a link away somewhere.
 * Both sidebars render this in place of a wordmark: which environment you are
 * in is more useful in that slot than repeating its name.
 *
 * Shared rather than duplicated per side so the two can never drift apart —
 * only `active` differs. The active half is inert; the other navigates.
 */

import Link from "next/link";
import { CandlestickChart, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";

export type Environment = "stocks" | "budget";

const ENVIRONMENTS = {
  stocks: { href: "/home", label: "Stocks", icon: CandlestickChart, accent: "text-blue" },
  budget: { href: "/budget", label: "Budget", icon: Wallet, accent: "text-green" },
} as const;

export function EnvironmentSwitcher({ active }: { active: Environment }) {
  return (
    <div
      className="flex gap-1 rounded-[13px] bg-fill/[0.08] p-1"
      role="group"
      aria-label="Environment"
    >
      {(Object.keys(ENVIRONMENTS) as Environment[]).map((key) => {
        const env = ENVIRONMENTS[key];
        const Icon = env.icon;
        const isActive = key === active;

        if (isActive) {
          return (
            <span
              key={key}
              aria-current="page"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-bg-elevated px-2 py-2 text-footnote font-semibold text-label shadow-sm"
            >
              <Icon size={15} className={env.accent} />
              {env.label}
            </span>
          );
        }

        return (
          <Link
            key={key}
            href={env.href}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] px-2 py-2 text-footnote font-medium text-label-secondary transition-colors hover:bg-bg-elevated/70 hover:text-label"
          >
            <Icon size={15} />
            {env.label}
          </Link>
        );
      })}
    </div>
  );
}

/** Header pill for mobile, where there is no sidebar to hold the switcher. */
export function EnvironmentSwitcherCompact({ active }: { active: Environment }) {
  // Point at the environment you are *not* in.
  const target = ENVIRONMENTS[active === "stocks" ? "budget" : "stocks"];
  const Icon = target.icon;

  return (
    <Link
      href={target.href}
      className="flex items-center gap-1.5 rounded-full bg-fill/10 px-3 py-1.5 text-caption font-medium text-label-secondary transition-colors hover:bg-fill/20"
    >
      <Icon size={14} />
      {target.label}
    </Link>
  );
}
