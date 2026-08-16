"use client";

import { cn, formatINR } from "@/lib/utils";
import type { SectorAllocation } from "./use-sector-allocation";
import { useState } from "react";
import { CaretDown, CaretUp } from "@phosphor-icons/react";

export function SectorHeatmap({ allocation, loading }: { allocation: SectorAllocation[]; loading: boolean }) {
  const [expandedSector, setExpandedSector] = useState<string | null>(null);

  if (loading) {
    return <div className="animate-pulse h-32 bg-fill/5 rounded-card" />;
  }

  if (allocation.length === 0) return null;

  const totalPortfolio = allocation.reduce((acc, s) => acc + s.investedValue, 0);

  return (
    <div className="space-y-3">
      {allocation.map((sector) => {
        const weight = (sector.investedValue / totalPortfolio) * 100;
        const isExpanded = expandedSector === sector.sector;
        const isPositive = sector.pnl >= 0;

        return (
          <div key={sector.sector} className="rounded-lg bg-bg border border-separator/40 dark:border-white/[0.06] overflow-hidden">
            <button 
              onClick={() => setExpandedSector(isExpanded ? null : sector.sector)}
              className="w-full flex items-center justify-between p-3 hover:bg-fill/[0.02] transition-colors text-left"
            >
              <div className="flex flex-col items-start min-w-0 pr-4">
                <span className="text-subhead font-semibold text-label truncate">{sector.sector}</span>
                <span className="text-caption2 text-label-secondary/60">{weight.toFixed(1)}% of Portfolio</span>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="flex flex-col items-end">
                  <span className="text-subhead font-semibold text-label">{formatINR(sector.investedValue, { decimals: 0 })}</span>
                  <span className={cn("text-caption font-medium", isPositive ? "text-green" : "text-red")}>
                    {isPositive ? "+" : ""}{formatINR(sector.pnl, { decimals: 0 })} ({isPositive ? "+" : ""}{sector.pnlPct.toFixed(2)}%)
                  </span>
                </div>
                {isExpanded ? <CaretUp size={16} className="text-label-secondary/60" /> : <CaretDown size={16} className="text-label-secondary/60" />}
              </div>
            </button>
            
            {/* Heatmap Bar */}
            <div className="w-full h-1.5 bg-fill/5 flex relative overflow-hidden">
               <div 
                 className={cn("h-full transition-all duration-500 absolute left-0 top-0", isPositive ? "bg-green" : "bg-red")} 
                 style={{ width: `${weight}%` }} 
               />
            </div>

            {isExpanded && (
              <div className="p-3 bg-fill/[0.02] border-t border-separator/40 dark:border-white/[0.06] space-y-4">
                {Object.values(sector.industries)
                  .sort((a, b) => b.investedValue - a.investedValue)
                  .map((ind) => {
                  const indPositive = ind.pnl >= 0;
                  const indWeight = (ind.investedValue / sector.investedValue) * 100;
                  return (
                    <div key={ind.industry} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-footnote">
                        <span className="text-label-secondary font-medium truncate pr-4">{ind.industry}</span>
                        <div className="flex items-center gap-3 shrink-0">
                           <span className="text-label-secondary">{formatINR(ind.investedValue, { decimals: 0 })}</span>
                           <span className={cn("font-medium", indPositive ? "text-green" : "text-red")}>
                             {indPositive ? "+" : ""}{ind.pnlPct.toFixed(2)}%
                           </span>
                        </div>
                      </div>
                      {/* Industry mini-bar */}
                      <div className="w-full h-1 bg-fill/5 rounded-full overflow-hidden flex relative">
                         <div 
                           className={cn("h-full absolute left-0 top-0", indPositive ? "bg-green/60" : "bg-red/60")} 
                           style={{ width: `${indWeight}%` }} 
                         />
                      </div>
                      <div className="text-[10px] text-label-secondary/50 uppercase tracking-wide">
                        {ind.tickers.join(", ")}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
