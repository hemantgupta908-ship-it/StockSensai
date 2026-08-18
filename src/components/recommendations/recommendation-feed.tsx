"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CircleNotch, Flask, ListBullets, Radio, SquaresFour, WarningCircle } from "@phosphor-icons/react";

import type { RecommendationFeed as FeedPayload } from "@/lib/engine/types";
import type { TradingStyle } from "@/lib/strategies/types";
import {
  TRADING_STYLES,
  TRADING_STYLE_CAPTIONS,
  TRADING_STYLE_DESCRIPTIONS,
  TRADING_STYLE_LABELS,
} from "@/lib/strategies/types";
import { usePreferences } from "@/components/preferences-provider";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SearchField } from "@/components/ui/search-field";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { RecommendationCardSkeleton, RecommendationRowSkeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils";
import { PageContainer } from "@/components/ui/page-container";
import { RecommendationCard } from "./recommendation-card";
import { RecommendationRow } from "./recommendation-row";
import { RefreshButton } from "@/components/ui/refresh-button";
import { apiFetch } from "@/lib/mobile/api";

/**
 * Column counts are chosen so a card never drops below ~380px, which is where
 * the reason text and the range gauge start to wrap badly. Breakpoints account
 * for the 248px sidebar that appears at `lg`.
 */
const FEED_GRID =
  "grid gap-3 md:grid-cols-2 2xl:grid-cols-3 3xl:grid-cols-4 items-start";

/** List view is a single column at any width — the columns inside each row do
 *  the aligning, and a second column would break the scan down them. */
const FEED_LIST = "flex flex-col gap-2";

const STYLE_OPTIONS: { value: TradingStyle; label: string }[] =
  TRADING_STYLES.map((value) => ({
    value,
    label: TRADING_STYLE_LABELS[value],
  }));

/**
 * Bumped whenever the engine changes what a feed means.
 *
 * The cache key is versioned because a stored payload outlives the code that
 * produced it: a feed cached while the engine was emitting nothing would be
 * replayed from localStorage indefinitely, and the empty state reads as a
 * considered screening result rather than a stale artefact. Changing this
 * discards every previously stored feed.
 */
const FEED_CACHE_VERSION = "v2";
const FEED_CACHE_KEY = `stocksensei.feed_cache.${FEED_CACHE_VERSION}`;

/**
 * Cached feeds older than this are discarded rather than shown.
 *
 * A stale feed is still worth displaying while a fresh one loads — the levels
 * move slowly and a populated screen beats a spinner — but past a point the
 * prices on the cards no longer resemble the market and showing them is worse
 * than showing nothing.
 */
const CLIENT_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * Gap between polls while the server screens the universe.
 *
 * A full live screen of the Nifty 200 runs to several minutes, so polling
 * faster only adds requests that get the same "still warming" answer back.
 */
const WARMING_POLL_MS = 20_000;

function isFresh(feed: FeedPayload | undefined): feed is FeedPayload {
  if (!feed?.generatedAt) return false;
  const age = Date.now() - new Date(feed.generatedAt).getTime();
  return Number.isFinite(age) && age < CLIENT_CACHE_MAX_AGE_MS;
}

function getInitialClientCache(): Record<string, FeedPayload> {
  if (typeof window === "undefined") return {};
  try {
    // Clear the unversioned key left by earlier builds so it cannot linger.
    localStorage.removeItem("stocksensei.feed_cache");
    const stored = localStorage.getItem(FEED_CACHE_KEY);
    return stored ? (JSON.parse(stored) as Record<string, FeedPayload>) : {};
  } catch {
    return {};
  }
}

export function RecommendationFeed() {
  const { riskTolerance, tradingStyle, setTradingStyle, feedView, setFeedView, hydrated } = usePreferences();
  const [feed, setFeed] = useState<FeedPayload | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** A screen is running server-side; poll until it lands. */
  const [warming, setWarming] = useState(false);

  // Guards against a slow earlier request overwriting a newer one when the user
  // flicks between styles quickly.
  const requestId = useRef(0);
  const clientFeedCache = useRef<Record<string, FeedPayload>>(getInitialClientCache());
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    },
    [],
  );

  const load = useCallback(
    async (style: TradingStyle, tolerance: string, force = false) => {
      const id = ++requestId.current;
      const cacheKey = `${style}:${tolerance}`;

      // Optimistic display from the client cache, but only while it is recent
      // enough to be worth looking at, and never as a *finished* state: the
      // network request behind it can take a minute or more on a cold screen,
      // and clearing `loading` here would present a stale feed as the current
      // one with nothing on screen to say otherwise.
      if (retryTimer.current) clearTimeout(retryTimer.current);

      const cached = clientFeedCache.current[cacheKey];
      if (!force && isFresh(cached)) {
        setFeed(cached);
      } else {
        setFeed(null);
      }
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ style, tolerance });
        if (force) params.set("refresh", "1");
        let response: Response;
        try {
          response = await apiFetch(`/api/recommendations?${params}`, { cache: "no-store" });
        } catch {
          // Retry once if server is restarting or connection flickered
          await new Promise((resolve) => setTimeout(resolve, 800));
          response = await apiFetch(`/api/recommendations?${params}`, { cache: "no-store" });
        }
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        const data = (await response.json()) as FeedPayload;
        if (!data || !Array.isArray(data.recommendations)) {
          throw new Error(
            typeof (data as any)?.error === "string"
              ? (data as any).error
              : "Invalid data received from recommendation engine",
          );
        }
        // A warming feed is a promise, not a result: the screen is still running
        // server-side. Never cache it — it would replace a real feed with an
        // empty one — and keep whatever is already on screen while polling.
        if (data.warming) {
          if (id === requestId.current) {
            setWarming(true);
            retryTimer.current = setTimeout(() => {
              if (id === requestId.current) void load(style, tolerance);
            }, WARMING_POLL_MS);
          }
          return;
        }

        setWarming(false);
        clientFeedCache.current[cacheKey] = data;
        try {
          localStorage.setItem(FEED_CACHE_KEY, JSON.stringify(clientFeedCache.current));
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

  const filteredRecommendations = useCallback(() => {
    if (!feed) return [];
    if (!query.trim()) return feed.recommendations;
    const q = query.trim().toLowerCase();
    return feed.recommendations.filter(
      (r) =>
        r.ticker.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.sector.toLowerCase().includes(q) ||
        r.strategyName.toLowerCase().includes(q),
    );
  }, [feed, query])();

  // A warming response carries no recommendations because none have been
  // computed yet — rendering the "no setups" empty state for it would report a
  // screening verdict that has not been reached.
  const showSkeletons = (loading || warming) && !feed;

  return (
    <div>
      <PageContainer className="pt-3 sm:pt-5 mb-2">
        <div className="lg:max-w-3xl space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <SearchField
                value={query}
                onChange={setQuery}
                placeholder="Search stock ideas (e.g. SBIN, Tata Power)..."
                className="!mb-0"
              />
            </div>
            <RefreshButton
              variant="icon"
              onRefresh={refresh}
              loading={loading}
              label="Refresh stock recommendations"
            />
          </div>
          <SegmentedControl
            options={STYLE_OPTIONS}
            value={tradingStyle}
            onChange={setTradingStyle}
            fit
          />
        </div>
      </PageContainer>

      {feed && (
        <FeedMeta
          feed={feed}
          feedView={feedView}
          onToggleView={setFeedView}
          refreshing={loading}
        />
      )}

      <PullToRefresh onRefresh={refresh}>
        <PageContainer className="space-y-3 pt-3">
          {showSkeletons && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-card border border-blue/20 bg-blue/[0.06] px-4 py-3 text-label dark:border-blue/30 dark:bg-blue/[0.10]">
                <CircleNotch size={20} className="animate-spin text-blue shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-footnote font-semibold text-label">
                    {warming
                      ? "First screen of the day — this takes a few minutes"
                      : "Screening NSE & BSE stock universe..."}
                  </p>
                  {/* No instrument count here: this only renders before the
                      first feed arrives, so the real universe size is not known
                      yet and a hardcoded one goes stale the moment the seed list
                      changes. `FeedMeta` shows the true count once loaded. */}
                  <p className="truncate text-caption2 text-label-secondary/65">
                    {warming
                      ? "Fetching a year of price history for every stock. Results appear here automatically."
                      : `Evaluating ${STYLE_OPTIONS.find((s) => s.value === tradingStyle)?.label} strategies across the NSE & BSE universe`}
                  </p>
                </div>
              </div>

              <div className={feedView === "list" ? FEED_LIST : FEED_GRID}>
                {feedView === "list"
                  ? Array.from({ length: 6 }, (_, i) => <RecommendationRowSkeleton key={i} />)
                  : Array.from({ length: 4 }, (_, i) => <RecommendationCardSkeleton key={i} />)}
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center gap-3 rounded-card bg-bg-secondary px-6 py-10 text-center shadow-card lg:mx-auto lg:max-w-lg dark:shadow-card-dark">
              <WarningCircle size={26} className="text-red" />
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
              key={`${feed.style}:${feedView}:${query}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: loading ? 0.55 : 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className={feedView === "list" ? FEED_LIST : FEED_GRID}
            >
              {filteredRecommendations.map((recommendation, index) =>
                feedView === "list" ? (
                  <RecommendationRow
                    key={recommendation.id}
                    recommendation={recommendation}
                    index={index}
                  />
                ) : (
                  <RecommendationCard
                    key={recommendation.id}
                    recommendation={recommendation}
                    index={index}
                  />
                ),
              )}

              {filteredRecommendations.length === 0 && (
                <div className={feedView === "list" ? "" : "md:col-span-2 2xl:col-span-3 3xl:col-span-4"}>
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
  feedView,
  onToggleView,
  refreshing,
}: {
  feed: FeedPayload;
  feedView: "card" | "list";
  onToggleView: (view: "card" | "list") => void;
  refreshing: boolean;
}) {
  return (
    <PageContainer className="mt-2.5 flex items-center justify-between gap-2">
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
            <Radio size={11} />
          ) : (
            <Flask size={11} />
          )}
          {feed.isLiveData ? "Live data" : "Demo data"}
        </span>
        {/* While a refresh is in flight the counts below belong to the previous
            screen, so say so — an unqualified "updated 10 hrs ago" next to an
            empty feed reads as a current verdict rather than an old one. */}
        {refreshing ? (
          <span className="flex items-center gap-1.5 text-caption2 text-label-secondary/60">
            <CircleNotch size={11} className="animate-spin text-blue" />
            Refreshing · showing screen from {timeAgo(feed.generatedAt)}
          </span>
        ) : (
          <span className="text-caption2 text-label-secondary/50">
            {feed.recommendations.length} of {feed.universeSize} screened · updated{" "}
            {timeAgo(feed.generatedAt)}
          </span>
        )}
      </div>

      {/* Card vs List View Toggle Pill */}
      <div className="flex items-center gap-0.5 rounded-full bg-fill/[0.10] p-0.5 dark:bg-white/[0.10]">
        <button
          type="button"
          onClick={() => onToggleView("card")}
          className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
            feedView === "card"
              ? "bg-bg-secondary text-accent shadow-sm"
              : "text-label-secondary/60 hover:text-label"
          }`}
          title="Card view"
          aria-label="Switch to Card view"
        >
          <SquaresFour size={14} />
        </button>
        <button
          type="button"
          onClick={() => onToggleView("list")}
          className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
            feedView === "list"
              ? "bg-bg-secondary text-accent shadow-sm"
              : "text-label-secondary/60 hover:text-label"
          }`}
          title="List view"
          aria-label="Switch to List view"
        >
          <ListBullets size={14} />
        </button>
      </div>
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
        None of the {TRADING_STYLE_LABELS[style].toLowerCase()} strategies found a stock
        meeting their conditions at your current risk tolerance. That is a normal outcome — a
        screen that always returns something isn&apos;t screening.
      </p>
      <p className="mt-3 text-caption text-label-secondary/50">
        Try a different trading style, or loosen the thresholds in Settings.
      </p>
    </motion.div>
  );
}
