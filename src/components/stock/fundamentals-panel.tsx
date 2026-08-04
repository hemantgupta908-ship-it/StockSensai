import type { Fundamentals } from "@/lib/market-data/types";
import { cn, formatCrore, formatNumber } from "@/lib/utils";

/**
 * Fundamentals grid for the long-term view. Ratios are shown against their
 * sector median where one exists, because an absolute P/E means little without
 * knowing what the sector trades at.
 */
export function FundamentalsPanel({
  fundamentals,
  className,
}: {
  fundamentals: Fundamentals;
  className?: string;
}) {
  const f = fundamentals;

  const rows: { label: string; value: string; comparison?: string; good?: boolean }[] = [
    {
      label: "P/E ratio",
      value: formatNumber(f.peRatio),
      comparison: `sector ${formatNumber(f.sectorPe)}`,
      good: f.peRatio < f.sectorPe,
    },
    {
      label: "P/B ratio",
      value: formatNumber(f.pbRatio),
      comparison: `sector ${formatNumber(f.sectorPb)}`,
      good: f.pbRatio < f.sectorPb,
    },
    { label: "Return on equity", value: `${formatNumber(f.roe, 1)}%`, good: f.roe > 15 },
    { label: "Return on capital", value: `${formatNumber(f.roce, 1)}%`, good: f.roce > 18 },
    { label: "Debt to equity", value: formatNumber(f.debtToEquity), good: f.debtToEquity < 0.5 },
    {
      label: "Interest coverage",
      value: `${formatNumber(f.interestCoverage, 1)}x`,
      good: f.interestCoverage > 3,
    },
    {
      label: "Revenue CAGR (3y)",
      value: `${formatNumber(f.revenueCagr3y, 1)}%`,
      good: f.revenueCagr3y > 12,
    },
    {
      label: "Earnings CAGR (3y)",
      value: `${formatNumber(f.earningsCagr3y, 1)}%`,
      good: f.earningsCagr3y > f.revenueCagr3y,
    },
    {
      label: "Dividend yield",
      value: `${formatNumber(f.dividendYield, 2)}%`,
    },
    {
      label: "Payout ratio",
      value: `${formatNumber(f.payoutRatio, 1)}%`,
      good: f.payoutRatio >= 20 && f.payoutRatio <= 70,
    },
    { label: "Earnings per share", value: `₹${formatNumber(f.earningsPerShare)}` },
    { label: "Book value per share", value: `₹${formatNumber(f.bookValuePerShare)}` },
    {
      label: "Promoter holding",
      value: `${formatNumber(f.promoterHolding, 2)}%`,
    },
    {
      label: "Promoter pledge",
      value: `${formatNumber(f.promoterPledge, 2)}%`,
      good: f.promoterPledge === 0,
    },
  ];

  return (
    <section
      className={cn(
        "overflow-hidden rounded-card border border-separator/40 bg-bg-secondary shadow-card",
        "dark:border-white/[0.06] dark:shadow-card-dark",
        className,
      )}
    >
      <div className="px-4 pb-2 pt-4">
        <h3 className="text-footnote font-semibold uppercase tracking-wide text-label-secondary/55">
          Fundamentals
        </h3>
      </div>

      <dl className="grid grid-cols-2 gap-px bg-separator/30 dark:bg-white/[0.05]">
        {rows.map((row) => (
          <div key={row.label} className="bg-bg-secondary px-4 py-2.5">
            <dt className="text-caption text-label-secondary/55">{row.label}</dt>
            <dd className="mt-0.5 flex items-baseline gap-1.5">
              <span
                className={cn(
                  "numeric text-subhead font-semibold",
                  row.good === undefined ? "text-label" : row.good ? "text-green" : "text-label",
                )}
              >
                {row.value}
              </span>
              {row.comparison && (
                <span className="numeric text-caption2 text-label-secondary/45">
                  {row.comparison}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {f.profitHistory.length > 0 && (
        <div className="border-t border-separator/40 px-4 py-3 dark:border-white/[0.06]">
          <p className="text-caption text-label-secondary/55">Net profit, last 5 years (₹ crore)</p>
          <div className="mt-2 flex items-end gap-1.5">
            {f.profitHistory.map((profit, index) => {
              const max = Math.max(...f.profitHistory.map(Math.abs));
              const heightPct = max > 0 ? (Math.abs(profit) / max) * 100 : 0;
              const rising = index === 0 || profit >= f.profitHistory[index - 1];
              return (
                <div key={index} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-12 w-full items-end">
                    <div
                      className={cn(
                        "w-full rounded-t-[3px]",
                        rising ? "bg-green/70" : "bg-amber/70",
                      )}
                      style={{ height: `${Math.max(heightPct, 4)}%` }}
                    />
                  </div>
                  <span className="numeric text-[9px] text-label-secondary/45">
                    {formatCrore(profit, { withSymbol: false }).replace(" Cr", "")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {f.themes.length > 0 && (
        <div className="border-t border-separator/40 px-4 py-3 dark:border-white/[0.06]">
          <p className="text-caption text-label-secondary/55">Structural themes</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {f.themes.map((theme) => (
              <span
                key={theme}
                className="rounded-full bg-purple/[0.14] px-2 py-[3px] text-caption2 font-semibold text-purple"
              >
                {theme}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
