"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Star, Trash2 } from "lucide-react";

import { formatINR } from "@/lib/utils";
import { useQuotes } from "@/hooks/use-quotes";
import { useSession } from "@/components/auth/session-provider";
import { ChangePill, ExchangeBadge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LocalStorageNotice } from "@/components/local-storage-notice";
import { PageContainer } from "@/components/ui/page-container";
import { NavBar } from "@/components/ui/nav-bar";
import { RefreshButton } from "@/components/ui/refresh-button";
import { useWatchlist } from "./watchlist-provider";

export function WatchlistView() {
  const { items, loading, remove, isLocal } = useWatchlist();
  const { authEnabled } = useSession();
  const { quotes, refetch, refreshing } = useQuotes(items.map((i) => i.ticker));

  const navBarProps = {
    title: "Watchlist",
    largeTitle: true,
    width: "wide" as const,
    subtitle: "Stocks you're following",
    trailing:
      items.length > 0 ? (
        <RefreshButton
          onRefresh={refetch}
          loading={refreshing}
          label="Refresh watchlist quotes"
        />
      ) : undefined,
  };

  if (loading) {
    return (
      <>
        <NavBar {...navBarProps} />
        <PageContainer width="wide" className="space-y-2">
          <Skeleton className="h-16 w-full rounded-card" />
          <Skeleton className="h-16 w-full rounded-card" />
          <Skeleton className="h-16 w-full rounded-card" />
        </PageContainer>
      </>
    );
  }

  if (items.length === 0) {
    return (
      <>
        <NavBar {...navBarProps} />
        <PageContainer width="wide">
          <div className="rounded-card border border-separator/40 bg-bg-secondary px-6 py-14 text-center shadow-card dark:border-white/[0.06] dark:shadow-card-dark">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber/[0.14]">
              <Star size={22} className="text-amber" strokeWidth={2.2} />
            </div>
            <p className="mt-3 text-subhead font-semibold text-label">Nothing saved yet</p>
            <p className="mx-auto mt-1.5 max-w-xs text-footnote leading-relaxed text-label-secondary/60">
              Tap the star on any recommendation to keep an eye on it here.
            </p>
            <Link
              href="/home"
              className="mt-4 inline-flex items-center gap-1 text-subhead font-semibold text-blue"
            >
              Browse ideas
              <ChevronRight size={16} strokeWidth={2.6} />
            </Link>
          </div>
        </PageContainer>
      </>
    );
  }

  return (
    <>
      <NavBar {...navBarProps} />
      <PageContainer width="wide" className="space-y-3">
        {isLocal && authEnabled && <LocalStorageNotice what="watchlist" />}

        <div className="flex items-center justify-between px-1">
          <p className="text-caption text-label-secondary/60">
            {items.length} stock{items.length === 1 ? "" : "s"} saved
          </p>
          <RefreshButton
            variant="pill"
            onRefresh={refetch}
            loading={refreshing}
            label="Refresh quotes"
          />
        </div>

        <div className="overflow-hidden rounded-card border border-separator/40 bg-bg-secondary shadow-card dark:border-white/[0.06] dark:shadow-card-dark">
          <AnimatePresence initial={false}>
            {items.map((item) => {
              const quote = quotes[item.ticker];
              return (
                <motion.div
                  key={item.ticker}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 36 }}
                  className="border-b border-separator/40 last:border-b-0 dark:border-white/[0.06]"
                >
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Link href={`/stock/${item.ticker}`} className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-subhead font-semibold text-label">
                          {item.ticker}
                        </span>
                        <ExchangeBadge exchange={item.exchange} />
                      </div>
                      <p className="mt-0.5 truncate text-caption text-label-secondary/55">
                        {item.name}
                      </p>
                    </Link>

                    <div className="shrink-0 flex flex-col items-end">
                      {quote ? (
                        <>
                          <div className="numeric text-subhead font-semibold text-label">
                            {formatINR(quote.price)}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            {item.priceAtAddition && (
                              <div className="text-[11px] text-label-secondary/60 bg-fill/5 px-1.5 py-0.5 rounded-sm">
                                added at {formatINR(item.priceAtAddition)}
                              </div>
                            )}
                            <ChangePill 
                              value={
                                item.priceAtAddition 
                                  ? ((quote.price - item.priceAtAddition) / item.priceAtAddition) * 100 
                                  : quote.changePercent
                              } 
                            />
                          </div>
                        </>
                      ) : (
                        <Skeleton className="h-8 w-20" />
                      )}
                    </div>

                    <motion.button
                      whileTap={{ scale: 0.86 }}
                      onClick={() => void remove(item.ticker)}
                      aria-label={`Remove ${item.ticker} from watchlist`}
                      className="shrink-0 rounded-full p-2 text-label-quaternary/35 active:bg-red/[0.10] active:text-red"
                    >
                      <Trash2 size={16} strokeWidth={2.2} />
                    </motion.button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </PageContainer>
    </>
  );
}
