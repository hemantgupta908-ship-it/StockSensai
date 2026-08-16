"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Warning } from "@phosphor-icons/react";

import type { Candle, Fundamentals, Instrument, Quote } from "@/lib/market-data/types";
import type { StrategySignal } from "@/lib/strategies/types";
import { cn, formatCrore, formatINR, formatVolume } from "@/lib/utils";
import { hasKnownMarketCap } from "@/lib/market-data/seed/instruments";
import { ChangePill, ExchangeBadge } from "@/components/ui/badge";
import { WatchlistButton } from "@/components/watchlist/watchlist-button";
import { PageContainer } from "@/components/ui/page-container";
import { NavBar } from "@/components/ui/nav-bar";
import { RefreshButton } from "@/components/ui/refresh-button";
import dynamic from "next/dynamic";
import type { PriceLine } from "./candle-chart";

const CandleChart = dynamic(
  () => import("./candle-chart").then((mod) => mod.CandleChart),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[320px] w-full animate-pulse items-center justify-center rounded-xl bg-fill/5">
        <span className="text-sm text-label-secondary/50">Loading chart...</span>
      </div>
    ),
  }
);
import { SignalDetail } from "./signal-detail";
import { FundamentalsPanel } from "./fundamentals-panel";
import { LogTradeButton } from "@/components/portfolio/log-trade-button";

interface Props {
  instrument: Instrument;
  quote: Quote;
  candles: Candle[];
  weeklyCandles: Candle[];
  monthlyCandles: Candle[];
  fundamentals: Fundamentals | null;
  bullishSignals: StrategySignal[];
  bearishSignals: StrategySignal[];
  initialStrategyId?: string;
}

export function StockDetailView({
  instrument,
  quote,
  candles,
  weeklyCandles,
  monthlyCandles,
  fundamentals,
  bullishSignals,
  bearishSignals,
  initialStrategyId,
}: Props) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [timeframe, setTimeframe] = useState<"1d" | "1wk" | "1mo">("1d");
  const [layout, setLayout] = useState<"single" | "side-by-side">("single");

  const handleRefresh = async () => {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 800);
  };

  const allSignals = useMemo(
    () => [...bullishSignals, ...bearishSignals],
    [bullishSignals, bearishSignals],
  );

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (initialStrategyId && allSignals.some((s) => s.strategyId === initialStrategyId)) {
      return initialStrategyId;
    }
    return allSignals[0]?.strategyId ?? null;
  });

  const selected = allSignals.find((s) => s.strategyId === selectedId) ?? null;

  // Overlay the selected setup's levels directly on the chart, so the numbers
  // in the panel below have a visible position in the price history.
  const priceLines: PriceLine[] = useMemo(() => {
    if (!selected) return [];
    return [
      { price: selected.entry.low, label: "Buy low", colour: "green", dashed: true },
      { price: selected.entry.high, label: "Buy high", colour: "green", dashed: true },
      { price: selected.target.low, label: "Target", colour: "blue", dashed: true },
      { price: selected.target.high, label: "Target high", colour: "blue", dashed: true },
      { price: selected.stopLoss, label: "Stop", colour: "red" },
    ];
  }, [selected]);

  return (
    <>
      <NavBar
        title={instrument.ticker}
        showBack
        width="fluid"
        trailing={
          <RefreshButton
            onRefresh={handleRefresh}
            loading={isRefreshing}
            label={`Refresh ${instrument.ticker} data`}
          />
        }
      />
      {/*
       * Single column on mobile. From `xl`, the analysis column carries the
       * chart and the fired setup while fundamentals dock to the right and stay
       * in view — on a laptop those are reference data you want beside the
       * chart, not a scroll away underneath it.
       */}
      <PageContainer>
        <div className="grid gap-4 xl:grid-cols-3 3xl:grid-cols-4 xl:items-start">
          <div className="space-y-4 xl:col-span-2 3xl:col-span-3">
        {/* Header */}
        <header className="rounded-card border border-separator/40 bg-bg-secondary p-4 shadow-card dark:border-white/[0.06] dark:shadow-card-dark">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h1 className="truncate text-title2 font-bold tracking-tight text-label">
                  {instrument.ticker}
                </h1>
                <ExchangeBadge exchange={instrument.exchange} />
              </div>
              <p className="mt-0.5 truncate text-footnote text-label-secondary/60">
                {instrument.name}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <RefreshButton
                variant="pill"
                onRefresh={handleRefresh}
                loading={isRefreshing}
                label={`Refresh ${instrument.ticker}`}
              />
              <LogTradeButton
                ticker={instrument.ticker}
                name={instrument.name}
                exchange={instrument.exchange}
                price={quote.price}
                signal={selected}
              />
              <WatchlistButton
                ticker={instrument.ticker}
                name={instrument.name}
                exchange={instrument.exchange}
                currentPrice={quote.price}
              />
            </div>
          </div>

        <div className="mt-3 flex items-baseline gap-2.5">
          <span className="numeric text-title1 font-bold tracking-tight text-label">
            {formatINR(quote.price)}
          </span>
          <div className="flex flex-col">
            <ChangePill value={quote.changePercent} />
            <span className="numeric text-caption2 text-label-secondary/50">
              {quote.change >= 0 ? "+" : ""}
              {formatINR(quote.change)}
            </span>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-4 gap-2">
          <MiniStat label="Open" value={formatINR(quote.open, { decimals: 0 })} />
          <MiniStat
            label="Day range"
            value={`${formatINR(quote.low, { decimals: 0 })}–${formatINR(quote.high, { decimals: 0 })}`}
          />
          <MiniStat label="Volume" value={formatVolume(quote.volume)} />
          {/* Only shown when a researched figure exists. Names added with the
              Nifty 200 expansion carry 0, meaning "not known" — a made-up
              market cap beside a real company reads as fact. */}
          <MiniStat
            label="M-cap"
            value={
              hasKnownMarketCap(instrument.marketCapCr)
                ? formatCrore(instrument.marketCapCr)
                : "—"
            }
          />
        </dl>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-fill/[0.10] px-2 py-[3px] text-caption2 font-medium text-label-secondary/65 dark:bg-white/[0.08]">
            {instrument.sector}
          </span>
          <span className="rounded-full bg-fill/[0.10] px-2 py-[3px] text-caption2 font-medium text-label-secondary/65 dark:bg-white/[0.08]">
            {instrument.industry}
          </span>
          {instrument.indices.slice(0, 2).map((index) => (
            <span
              key={index}
              className="rounded-full bg-blue/[0.12] px-2 py-[3px] text-caption2 font-medium text-blue"
            >
              {index}
            </span>
          ))}
        </div>

        <div className="mt-3">
          <FiftyTwoWeekBar
            low={quote.week52Low}
            high={quote.week52High}
            current={quote.price}
          />
        </div>
      </header>

      {/* Chart */}
      <section className="overflow-hidden rounded-card border border-separator/40 bg-bg-secondary pb-2 pt-3 shadow-card dark:border-white/[0.06] dark:shadow-card-dark">
        <div className="flex items-center justify-between px-4 pb-2">
          <div className="flex items-center gap-4">
            <h2 className="text-footnote font-semibold uppercase tracking-wide text-label-secondary/55">
              Chart
            </h2>
            <div className="flex rounded-md border border-separator/40 overflow-hidden">
              <button
                onClick={() => setTimeframe("1d")}
                className={cn("px-2 py-0.5 text-xs font-medium transition-colors", timeframe === "1d" ? "bg-fill/10 text-label" : "text-label-secondary/60 hover:bg-fill/5")}
              >
                1D
              </button>
              <button
                onClick={() => setTimeframe("1wk")}
                className={cn("px-2 py-0.5 text-xs font-medium border-l border-separator/40 transition-colors", timeframe === "1wk" ? "bg-fill/10 text-label" : "text-label-secondary/60 hover:bg-fill/5")}
              >
                1W
              </button>
              <button
                onClick={() => setTimeframe("1mo")}
                className={cn("px-2 py-0.5 text-xs font-medium border-l border-separator/40 transition-colors", timeframe === "1mo" ? "bg-fill/10 text-label" : "text-label-secondary/60 hover:bg-fill/5")}
              >
                1M
              </button>
            </div>
            <div className="flex rounded-md border border-separator/40 overflow-hidden">
              <button
                onClick={() => setLayout("single")}
                className={cn("px-2 py-0.5 text-xs font-medium transition-colors", layout === "single" ? "bg-fill/10 text-label" : "text-label-secondary/60 hover:bg-fill/5")}
              >
                Single
              </button>
              <button
                onClick={() => setLayout("side-by-side")}
                className={cn("px-2 py-0.5 text-xs font-medium border-l border-separator/40 transition-colors", layout === "side-by-side" ? "bg-fill/10 text-label" : "text-label-secondary/60 hover:bg-fill/5")}
              >
                Side-by-side
              </button>
            </div>
          </div>
          {selected && (
            <span className="text-caption2 text-label-secondary/45 hidden sm:inline-block">
              Levels shown for {selected.strategyId.startsWith("lt-") ? "accumulation" : "the selected setup"}
            </span>
          )}
        </div>
        
        {layout === "single" ? (
          <CandleChart 
            candles={timeframe === "1d" ? candles : timeframe === "1wk" ? weeklyCandles : monthlyCandles} 
            priceLines={priceLines} 
            height={300} 
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-1">
            <div>
              <div className="px-4 py-1 text-xs font-medium text-label-secondary/60">Daily</div>
              <CandleChart candles={candles} priceLines={priceLines} height={200} />
            </div>
            <div>
              <div className="px-4 py-1 text-xs font-medium text-label-secondary/60">Weekly</div>
              <CandleChart candles={weeklyCandles} priceLines={priceLines} height={200} />
            </div>
            <div>
              <div className="px-4 py-1 text-xs font-medium text-label-secondary/60">Monthly</div>
              <CandleChart candles={monthlyCandles} priceLines={priceLines} height={200} />
            </div>
          </div>
        )}
      </section>

      {/* Signal switcher */}
      {allSignals.length > 0 ? (
        <>
          {allSignals.length > 1 && (
            <div className="-mx-4 overflow-x-auto px-4 no-scrollbar">
              <div className="flex gap-2 pb-1">
                {allSignals.map((signal) => {
                  const active = signal.strategyId === selectedId;
                  const bearish = signal.direction === "bearish";
                  return (
                    <button
                      key={signal.strategyId}
                      onClick={() => setSelectedId(signal.strategyId)}
                      className={cn(
                        "shrink-0 rounded-full px-3.5 py-2 text-footnote font-semibold transition-colors",
                        active
                          ? bearish
                            ? "bg-red text-white"
                            : "bg-blue text-white"
                          : "bg-fill/[0.10] text-label-secondary/65 dark:bg-white/[0.08]",
                      )}
                    >
                      {signal.strategyId.replace(/^(swing|st|lt)-/, "").replace(/-/g, " ")}
                      <span className="numeric ml-1.5 opacity-70">{signal.confidence}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {selected && <SignalDetail signal={selected} currentPrice={quote.price} />}
        </>
      ) : (
        <div className="rounded-card border border-separator/40 bg-bg-secondary px-6 py-10 text-center shadow-card dark:border-white/[0.06] dark:shadow-card-dark">
          <p className="text-subhead font-semibold text-label">No setups firing</p>
          <p className="mx-auto mt-2 max-w-sm text-footnote leading-relaxed text-label-secondary/60">
            {/* Deliberately not "none of the N strategies": this is a client
                component, and importing the strategy list to count it would
                pull all of them, explainer prose included, into the bundle for
                one number that then goes stale anyway. */}
            No strategy currently finds a qualifying setup in {instrument.ticker} at your risk
            tolerance. The chart and fundamentals below are still available.
          </p>
        </div>
      )}

        </div>

        {/* Reference column: sticks alongside the chart on wide screens. */}
        <aside className="space-y-4 xl:sticky xl:top-[60px]">
          {/* Bearish caution — never rendered as a buy card */}
          {bearishSignals.length > 0 && (
            <section className="rounded-card border border-red/20 bg-red/[0.05] p-4">
              <div className="flex items-start gap-2.5">
                <Warning size={15} className="mt-[1px] shrink-0 text-red" />
                <div>
                  <h3 className="text-footnote font-semibold text-red">
                    {bearishSignals.length} bearish signal
                    {bearishSignals.length === 1 ? "" : "s"} also firing
                  </h3>
                  <p className="mt-1 text-caption leading-snug text-label-secondary/70">
                    {bearishSignals
                      .map((s) => s.strategyId.replace(/^(swing|st|lt)-/, "").replace(/-/g, " "))
                      .join(", ")}
                    . These are shown for context and never generate buy recommendations.
                  </p>
                </div>
              </div>
            </section>
          )}

          {fundamentals && (
            <div className="xl:max-h-[calc(100dvh-96px)] xl:overflow-y-auto xl:overscroll-contain">
              <FundamentalsPanel fundamentals={fundamentals} />
            </div>
          )}
        </aside>
      </div>
    </PageContainer>
    </>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-caption2 text-label-secondary/50">{label}</dt>
      <dd className="numeric mt-0.5 truncate text-footnote font-semibold text-label">{value}</dd>
    </div>
  );
}

function FiftyTwoWeekBar({
  low,
  high,
  current,
}: {
  low: number;
  high: number;
  current: number;
}) {
  const span = high - low || 1;
  const position = Math.max(0, Math.min(100, ((current - low) / span) * 100));

  return (
    <div>
      <div className="flex items-center justify-between text-caption2 text-label-secondary/50">
        <span className="numeric">{formatINR(low, { decimals: 0 })}</span>
        <span>52-week range</span>
        <span className="numeric">{formatINR(high, { decimals: 0 })}</span>
      </div>
      <div className="relative mt-1.5 h-1.5 w-full rounded-full bg-gradient-to-r from-red/30 via-amber/30 to-green/30">
        <div
          className="absolute top-1/2 h-3 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-label"
          style={{ left: `${position}%` }}
        />
      </div>
    </div>
  );
}
