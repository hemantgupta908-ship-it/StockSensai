"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, FlaskConical, Loader2, Radio } from "lucide-react";

import type { RecommendationFeed as FeedPayload } from "@/lib/engine/types";
import type { TradingStyle } from "@/lib/strategies/types";
import { TRADING_STYLE_DESCRIPTIONS } from "@/lib/strategies/types";
import { usePreferences } from "@/components/preferences-provider";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { RecommendationCardSkeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils";
import { PageContainer } from "@/components/ui/page-container";
import { RecommendationCard } from "./recommendation-card";
import { RefreshButton } from "@/components/ui/refresh-button";

/**
 * Column counts are chosen so a card never drops below ~380px, which is where
 * the reason text and the range gauge start to wrap badly. Breakpoints account
 * for the 248px sidebar that appears at `lg`.
 */
const FEED_GRID =
  "grid gap-3 md:grid-cols-2 2xl:grid-cols-3 3xl:grid-cols-4 items-start";

const STYLE_OPTIONS: { value: TradingStyle; label: string; caption: string }[] = [
  { value: "swing", label: "Swing", caption: "Days–weeks" },
  { value: "short-term", label: "Short-Term", caption: "1–3 days" },
  { value: "long-term", label: "Long-Term", caption: "1–5 years" },
];

export function RecommendationFeed() {
  const { riskTolerance, tradingStyle, setTradingStyle, hydrated } = usePreferences();
  const [feed, setFeed] = useState<FeedPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Guards against a slow earlier request overwriting a newer one when the user
  // flicks between styles quickly.
  const requestId = useRef(0);
  const clientFeedCache = useRef<Record<string, FeedPayload>>({});

  // Initialize client cache from localStorage for 0ms instant initial render
  useEffect(() => {
    try {
      const stored = localStorage.getItem("stocksensei.feed_cache");
      if (stored) {
        clientFeedCache.current = JSON.parse(stored) as Record<string, FeedPayload>;
      }
    } catch {
      // ignore
    }
  }, []);

  const load = useCallback(
    async (style: TradingStyle, tolerance: string, force = false) => {
      const id = ++requestId.current;
      const cacheKey = `${style}:${tolerance}`;

      // Instant optimistic display from client memory/storage cache if available
      if (!force && clientFeedCache.current[cacheKey]) {
        setFeed(clientFeedCache.current[cacheKey]);
        setLoading(false);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams({ style, tolerance });
        if (force) params.set("refresh", "1");
        const response = await fetch(`/api/recommendations?${params}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        const data = (await response.json()) as FeedPayload;
        clientFeedCache.current[cacheKey] = data;
        try {
          localStorage.setItem("stocksensei.feed_cache", JSON.stringify(clientFeedCache.current));
        } catch {
          // ignore storage quota errors
        }
        if (id === requestId.current) setFeed(data);
      } catch (err) {
        if (id === requestId.current) {
          setError(err instanceof Error ? err.message : "Something went wrong");
        }
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!hydrated) return;
    void load(tradingStyle, riskTolerance);
  }, [hydrated, tradingStyle, riskTolerance, load]);

  const refresh = useCallback(async () => {
    await load(tradingStyle, riskTolerance, true);
  }, [load, tradingStyle, riskTolerance]);

  const showSkeletons = loading && !feed;

  return (
    <div>
      <PageContainer>
        {/* The switcher shouldn't stretch to full width on a desktop — a
            segmented control several hundred pixels wide stops reading as one. */}
        <div className="lg:max-w-md">
          <SegmentedControl
            options={STYLE_OPTIONS}
            value={tradingStyle}
            onChange={setTradingStyle}
            size="lg"
          />
        </div>
        <p className="mt-2.5 px-1 text-footnote leading-snug text-label-secondary/60">
          {TRADING_STYLE_DESCRIPTIONS[tradingStyle]}
        </p>
      </PageContainer>

      {feed && <FeedMeta feed={feed} onRefresh={refresh} loading={loading} />}

      <PullToRefresh onRefresh={refresh}>
        <PageContainer className="space-y-3 pt-3">
          {showSkeletons && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-card border border-blue/20 bg-blue/[0.06] px-4 py-3 text-label dark:border-blue/30 dark:bg-blue/[0.10]">
                <Loader2 size={20} className="animate-spin text-blue shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-footnote font-semibold text-label">
                    Screening NSE & BSE stock universe...
                  </p>
                  <p className="truncate text-caption2 text-label-secondary/65">
                    Evaluating {STYLE_OPTIONS.find((s) => s.value === tradingStyle)?.label} strategies across 37 instruments
                  </p>
                </div>
              </div>

              <div className={FEED_GRID}>
                <RecommendationCardSkeleton />
                <RecommendationCardSkeleton />
                <RecommendationCardSkeleton />
                <RecommendationCardSkeleton />
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center gap-3 rounded-card bg-bg-secondary px-6 py-10 text-center shadow-card lg:mx-auto lg:max-w-lg dark:shadow-card-dark">
              <AlertCircle size={26} className="text-red" />
              <div>
                <p className="text-subhead font-semibold text-label">Couldn&apos;t load ideas</p>
                <p className="mt-1 text-footnote text-label-secondary/60">{error}</p>
              </div>
              <Button size="sm" variant="tinted" onClick={() => void refresh()}>
                Try again
              </Button>
            </div>
          )}

          {/*
            Keyed on the *loaded* feed's style so switching tabs remounts the
            list wholesale.

            Deliberately not wrapped in AnimatePresence: an exit animation here
            has to finish before the replacement mounts, and when it doesn't the
            feed freezes on whichever style loaded first. Per-item exits were
            worse still — cards from the previous style piled up in the DOM
            instead of unmounting. A keyed remount is unambiguous, and the
            per-card entry stagger already supplies the motion.
          */}
          {!error && feed && (
            <motion.div
              key={feed.style}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: loading ? 0.55 : 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className={FEED_GRID}
            >
              {feed.recommendations.map((recommendation, index) => (
                <RecommendationCard
                  key={recommendation.id}
                  recommendation={recommendation}
                  index={index}
                />
              ))}

              {feed.recommendations.length === 0 && (
                <div className="md:col-span-2 2xl:col-span-3 3xl:col-span-4">
                  <EmptyState style={feed.style} />
                </div>
              )}
            </motion.div>
          )}
        </PageContainer>
      </PullToRefresh>
    </div>
  );
}

function FeedMeta({
  feed,
  onRefresh,
  loading,
}: {
  feed: FeedPayload;
  onRefresh: () => Promise<void>;
  loading: boolean;
}) {
  return (
    <PageContainer className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span
          className={cnBadge(feed.isLiveData)}
          title={
            feed.isLiveData
              ? "Connected to a live market data provider"
              : "Seeded simulation data — no live market feed is connected"
          }
        >
          {feed.isLiveData ? (
            <Radio size={11} strokeWidth={2.6} />
          ) : (
            <FlaskConical size={11} strokeWidth={2.6} />
          )}
          {feed.isLiveData ? "Live data" : "Demo data"}
        </span>
        <span className="text-caption2 text-label-secondary/50">
          {feed.recommendations.length} of {feed.universeSize} screened · updated{" "}
          {timeAgo(feed.generatedAt)}
        </span>
      </div>
      <RefreshButton
        variant="pill"
        onRefresh={onRefresh}
        loading={loading}
        label="Refresh ideas"
      />
    </PageContainer>
  );
}

function cnBadge(isLive: boolean) {
  return [
    "inline-flex items-center gap-1 rounded-full px-2 py-[3px]",
    "text-caption2 font-semibold tracking-tight",
    isLive ? "bg-green/[0.16] text-green" : "bg-purple/[0.16] text-purple",
  ].join(" ");
}

function EmptyState({ style }: { style: TradingStyle }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-card bg-bg-secondary px-6 py-12 text-center shadow-card dark:shadow-card-dark"
    >
      <p className="text-subhead font-semibold text-label">No setups right now</p>
      <p className="mx-auto mt-2 max-w-sm text-footnote leading-relaxed text-label-secondary/60">
        None of the five {style === "long-term" ? "long-term" : style.replace("-", " ")} strategies
        found a stock meeting their conditions at your current risk tolerance. That is a normal
        outcome — a screen that always returns something isn&apos;t screening.
      </p>
      <p className="mt-3 text-caption text-label-secondary/50">
        Try a different trading style, or loosen the thresholds in Settings.
      </p>
    </motion.div>
  );
}
