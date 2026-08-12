"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Info, ShieldWarning } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/**
 * The disclaimer is not decoration. This app produces algorithmic screens that
 * look a great deal like advice, and SEBI's Investment Adviser regulations draw
 * a hard line between the two. It appears on stock recommendation screens via the app shell, on
 * every recommendation detail, and as a dedicated page.
 */

export const DISCLAIMER_SHORT =
  "Algorithmically generated screens for education and research. Not investment advice.";

export const DISCLAIMER_FULL =
  "WealthSensei is a stock screening and educational tool. Every recommendation shown is generated automatically by rule-based strategies applied to price and fundamental data. Nothing here is personalised financial advice, a solicitation to buy or sell, or a guarantee of any outcome. WealthSensei is not a broker, does not execute trades, and is not registered with SEBI as an Investment Adviser or Research Analyst. Do your own research and consider consulting a SEBI-registered investment adviser before acting on anything you see here. Investments in securities are subject to market risks; past performance does not indicate future results.";

/** Stock & investment paths where the stock market disclaimer is relevant. */
const RELEVANT_STOCK_PATHS = [
  "/home",
  "/stock",
  "/watchlist",
  "/portfolio",
  "/strategies",
];

/** Persistent footer strip, rendered only on stock/investment pages. */
export function DisclaimerFooter({ className }: { className?: string }) {
  const pathname = usePathname();

  // Only show disclaimer on stock/investment pages; hide on budgeting/planning/personal finance screens.
  const isRelevant = RELEVANT_STOCK_PATHS.some((path) => pathname?.startsWith(path));
  if (!isRelevant) return null;

  return (
    <footer className={cn("mx-auto w-full max-w-[1180px] px-4 pb-4 pt-6 sm:px-5 lg:px-8", className)}>
      <div className="flex items-start gap-2.5 rounded-[14px] border border-separator/40 bg-fill/[0.05] px-3.5 py-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
        <ShieldWarning size={15} className="mt-[1px] shrink-0 text-amber" weight="duotone" />
        <p className="text-caption leading-snug text-label-secondary/65">
          {DISCLAIMER_SHORT} Not a broker — WealthSensei never places trades.{" "}
          <Link href="/disclaimer" className="font-semibold text-blue underline-offset-2 hover:underline">
            Read the full disclaimer
          </Link>
          .
        </p>
      </div>
    </footer>
  );
}

/** Inline notice used on recommendation detail screens. */
export function DisclaimerNotice({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-[14px] bg-amber/[0.10] px-3.5 py-3",
        className,
      )}
    >
      <Info size={15} className="mt-[1px] shrink-0 text-amber"  weight="duotone" />
      <p className="text-caption leading-snug text-label-secondary/75">
        These levels are produced by a rule-based model from historical price and
        fundamental data. They are not predictions, not personalised advice, and carry
        no guarantee. Position sizing and the decision to act are yours.
      </p>
    </div>
  );
}
