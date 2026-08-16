import type { Metadata } from "next";
import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react/dist/ssr";

import { getStrategiesByStyle } from "@/lib/strategies";
import {
  TRADING_STYLES,
  TRADING_STYLE_DESCRIPTIONS,
  TRADING_STYLE_LABELS,
  type TradingStyle,
} from "@/lib/strategies/types";
import { NavBar } from "@/components/ui/nav-bar";
import { RiskBadge } from "@/components/ui/badge";
import { SectionLabel } from "@/components/ui/card";
import { CONTAINER_WIDTHS } from "@/components/ui/page-container";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Strategies",
  description:
    "The 15 rule-based strategies behind WealthSensei's screens — five each for swing, positional and long-term horizons.",
};

const STYLE_ACCENT: Record<TradingStyle, string> = {
  swing: "text-blue",
  positional: "text-purple",
  "long-term": "text-green",
};

export default function StrategiesPage() {
  return (
    <>
      <NavBar
        title="Trading Strategies"
        hideSearch
        hideThemeToggle
        width="fluid"
        subtitle="The 15 rules behind every screen" />

      <main className={cn("mx-auto space-y-6 pt-2", CONTAINER_WIDTHS.fluid)}>
        <p className="max-w-3xl text-footnote leading-relaxed text-label-secondary/65">
          Every recommendation in WealthSensei comes from one of these fifteen strategies, applied
          mechanically to price and fundamental data. Nothing is discretionary and nothing is
          hand-picked — if a stock doesn&apos;t meet a strategy&apos;s conditions, it doesn&apos;t
          appear. Read these to understand what each screen is actually testing, and just as
          importantly, when it tends to be wrong.
        </p>

        {/* Style groups side by side once there's room for them. Five columns
            only at the widest breakpoint — below that they would be too narrow
            for the strategy names to stay on one line. */}
        <div className="grid gap-6 xl:grid-cols-2 3xl:grid-cols-3 xl:items-start">
        {TRADING_STYLES.map((style) => {
          const strategies = getStrategiesByStyle(style);
          return (
            <section key={style}>
              <SectionLabel>
                {TRADING_STYLE_LABELS[style]} · {strategies.length} strategies
              </SectionLabel>
              <p className="px-4 pb-2.5 text-caption text-label-secondary/55">
                {TRADING_STYLE_DESCRIPTIONS[style]}
              </p>

              <div className="overflow-hidden rounded-card border border-separator/40 bg-bg-secondary shadow-card dark:border-white/[0.06] dark:shadow-card-dark [&>*+*]:border-t [&>*+*]:border-separator/40 dark:[&>*+*]:border-white/[0.06]">
                {strategies.map((strategy, index) => (
                  <Link
                    key={strategy.id}
                    href={`/strategies/${strategy.id}`}
                    className="flex items-center gap-3 px-4 py-3.5 active:bg-fill/[0.06]"
                  >
                    <span
                      className={`numeric shrink-0 text-title3 font-bold tabular-nums ${STYLE_ACCENT[style]} opacity-30`}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h3 className="text-subhead font-semibold text-label">{strategy.name}</h3>
                        <RiskBadge level={strategy.baseRisk} />
                      </div>
                      <p className="mt-0.5 text-footnote leading-snug text-label-secondary/60">
                        {strategy.tagline}
                      </p>
                      <p className="mt-1 text-caption2 text-label-secondary/45">
                        Typical hold: {strategy.holdPeriodLabel}
                      </p>
                    </div>
                    <CaretRight
                      size={17}
                      className="shrink-0 text-label-quaternary/30"
                     weight="duotone" />
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
        </div>
      </main>
    </>
  );
}
