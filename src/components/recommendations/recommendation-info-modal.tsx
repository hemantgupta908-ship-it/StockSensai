"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge, ChangePill, ExchangeBadge, RiskBadge } from "@/components/ui/badge";
import { ConfidenceRing } from "@/components/ui/confidence";
import { RangeGauge } from "@/components/ui/range-gauge";
import type { Recommendation } from "@/lib/engine/types";
import { formatINR } from "@/lib/utils";
import { CheckCircle, Clock, Globe, Info, ShieldWarning, Sparkle, TrendUp, X } from "@phosphor-icons/react";
import Link from "next/link";

interface RecommendationInfoModalProps {
  recommendation: Recommendation | null;
  isOpen: boolean;
  onClose: () => void;
}

export function toHinglishReason(r: Recommendation): string {
  const name = r.name || r.ticker;
  const s = r.strategyName.toLowerCase();

  if (s.includes("crossover") || s.includes("moving average")) {
    return `${name} ka short-term 20-day moving average abhi 50-day moving average ke upar nikla hai heavy volume ke saath. Ye ek fresh bullish uptrend ki shuruat ko point karta hai. Primary target zone ₹${Math.round(r.sellRange.low)} - ₹${Math.round(r.sellRange.high)} ke paas hai.`;
  }
  if (s.includes("breakout") || s.includes("consolidation")) {
    return `${name} pichle kai hafton se tight consolidation range me tha, aur ab heavy trading volume ke saath range breakout de chuka hai. Tight base ke baad aisi buying strong rally project karti hai.`;
  }
  if (s.includes("rsi") || s.includes("reversal") || s.includes("oversold")) {
    return `${name} me RSI indicator oversold territory se turn-around ho raha hai. Bottom levels par buyers active hue hain aur hammer / bullish engulfing pattern ne bounce confirm kar diya hai.`;
  }
  if (s.includes("macd") || s.includes("signal")) {
    return `${name} me MACD line ne signal line ko neeche se upar ki taraf cross kiya hai. High volume momentum confirm karta hai ki fresh upside move start ho raha hai.`;
  }
  if (s.includes("support") || s.includes("bounce")) {
    return `${name} ne apne critical support zone par multi-session hammer formation se strong bounce back kiya hai. Risk-to-reward ratio yahan se kaafi favorable hai, stop loss ₹${Math.round(r.stopLoss)} set hai.`;
  }
  if (s.includes("value") || s.includes("pe") || s.includes("growth")) {
    return `${name} fundamentally strong business hai jahan P/E aur P/B valuation historical aur sector medians se saste rate par mil rahe hain. High ROE & ROCE long-term wealth creation supports karte hain.`;
  }

  return `${name} ka chart profile aur volume setup strategy "${r.strategyName}" ke rules ko complete meet karta hai. Expected target ₹${Math.round(r.sellRange.low)} - ₹${Math.round(r.sellRange.high)} set hai.`;
}

export function RecommendationInfoModal({
  recommendation,
  isOpen,
  onClose,
}: RecommendationInfoModalProps) {
  const [tab, setTab] = useState<"hinglish" | "english">("english");

  if (!recommendation) return null;
  const r = recommendation;

  const hinglishText = toHinglishReason(r);

  return (
    <Sheet open={isOpen} onClose={onClose}>
      <div className="w-full overflow-hidden rounded-2xl border border-separator/60 bg-bg-elevated shadow-modal dark:border-white/10 dark:shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-separator/40 px-5 py-4 dark:border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue/15 text-blue">
              <Info size={20} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-headline font-bold tracking-wide text-label">{r.ticker}</h3>
                <ExchangeBadge exchange={r.exchange} />
              </div>
              <p className="truncate text-footnote text-label-secondary/70">{r.name}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-label-secondary/60 transition-colors hover:bg-fill/[0.12] hover:text-label"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body Content */}
        <div className="space-y-4 p-5 max-h-[75vh] overflow-y-auto">
          {/* Price & Strategy Header Badges */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-bg-secondary p-3 border border-separator/30 dark:border-white/[0.05]">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="numeric text-title3 font-bold text-label">{formatINR(r.price)}</span>
                <ChangePill value={r.changePercent} />
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <Badge tone="blue">
                  <TrendUp size={11} />
                  {r.strategyName}
                </Badge>
                <Badge tone="neutral">{r.sector}</Badge>
              </div>
            </div>

            <div className="flex flex-col items-center">
              <ConfidenceRing score={r.confidenceScore} size={44} />
              <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-label-secondary/50">
                Score
              </span>
            </div>
          </div>

          {/* Language Selector Segmented Control */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5 text-caption1 font-semibold text-label-secondary uppercase tracking-wider">
                <Globe size={14} className="text-blue" />
                Strategy Analysis Explanation
              </span>
              <div className="flex rounded-lg bg-fill/[0.12] p-0.5 dark:bg-white/[0.08]">
                <button
                  onClick={() => setTab("hinglish")}
                  className={`rounded-md px-2.5 py-1 text-caption2 font-bold transition-all ${
                    tab === "hinglish"
                      ? "bg-blue text-white shadow-subtle"
                      : "text-label-secondary hover:text-label"
                  }`}
                >
                  🇮🇳 Hinglish
                </button>
                <button
                  onClick={() => setTab("english")}
                  className={`rounded-md px-2.5 py-1 text-caption2 font-bold transition-all ${
                    tab === "english"
                      ? "bg-blue text-white shadow-subtle"
                      : "text-label-secondary hover:text-label"
                  }`}
                >
                  🇬🇧 English
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-blue/20 bg-blue/[0.05] p-4 text-subhead leading-relaxed text-label dark:border-blue/30 dark:bg-blue/[0.08]">
              {tab === "hinglish" ? (
                <div className="space-y-2">
                  <p className="font-medium text-label">{hinglishText}</p>
                  <div className="flex items-center gap-1.5 text-caption2 text-blue font-semibold pt-1">
                    <Sparkle size={13} />
                    <span>Hinglish summary for easy Indian trader understanding</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="font-medium text-label">{r.reason}</p>
                  <div className="flex items-center gap-1.5 text-caption2 text-label-secondary/60 pt-1">
                    <CheckCircle size={13} className="text-green" />
                    <span>Algorithmic strategy breakdown &amp; volume analysis</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Price Range Gauge */}
          <div>
            <span className="block mb-2 text-caption1 font-semibold text-label-secondary uppercase tracking-wider">
              Trade Execution Plan
            </span>
            <RangeGauge
              buyLow={r.buyRange.low}
              buyHigh={r.buyRange.high}
              sellLow={r.sellRange.low}
              sellHigh={r.sellRange.high}
              stopLoss={r.stopLoss}
              currentPrice={r.price}
            />
          </div>

          {/* Risk Level & Hold Duration */}
          <div className="flex items-center justify-between rounded-xl bg-bg-secondary p-3 border border-separator/30 dark:border-white/[0.05]">
            <div className="flex items-center gap-2">
              <RiskBadge level={r.riskLevel} />
              <span className="flex items-center gap-1 text-caption font-medium text-label-secondary">
                <Clock size={13} />
                Hold {r.holdPeriodLabel}
              </span>
            </div>

            <Link
              href={`/stock/${r.ticker}?strategy=${r.strategyId}`}
              onClick={onClose}
              className="inline-flex items-center gap-1 text-footnote font-semibold text-blue hover:underline"
            >
              Full Interactive Chart &rarr;
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-separator/40 bg-bg-secondary/60 px-5 py-3 text-center text-caption2 text-label-secondary/60 dark:border-white/[0.06]">
          Rule-based analysis · Educational screener · Not investment advice
        </div>
      </div>
    </Sheet>
  );
}
