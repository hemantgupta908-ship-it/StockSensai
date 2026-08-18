"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { CaretRight, Star, Trash, Bell, BellRinging, Check } from "@phosphor-icons/react";

import { cn, formatINR } from "@/lib/utils";
import { useQuotes } from "@/hooks/use-quotes";
import { useSession } from "@/components/auth/session-provider";
import { ChangePill, ExchangeBadge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LocalStorageNotice } from "@/components/local-storage-notice";
import { PageContainer } from "@/components/ui/page-container";
import { NavBar } from "@/components/ui/nav-bar";
import { RefreshButton } from "@/components/ui/refresh-button";
import { AmountInput } from "@/components/ui/amount-input";
import { useWatchlist } from "./watchlist-provider";

export function WatchlistView() {
  const { items, loading, remove, isLocal, updateAlerts } = useWatchlist();
  const { authEnabled, user } = useSession();
  const { quotes, refetch, refreshing } = useQuotes(items.map((i) => i.ticker));

  const [editingAlert, setEditingAlert] = useState<string | null>(null);
  const [alertAbove, setAlertAbove] = useState<string>("");
  const [alertBelow, setAlertBelow] = useState<string>("");

  const navBarProps = {
    title: "Watchlist",
    width: "wide" as const,
    hideSearch: true,
    hideThemeToggle: true,
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
              <Star size={22} className="text-amber" />
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
              <CaretRight size={16} />
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
        {isLocal && authEnabled && (
          <LocalStorageNotice what="watchlist" reason={user ? "google-local" : "signed-out"} />
        )}

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

                    <div className="shrink-0 flex items-center gap-1">
                      <motion.button
                        whileTap={{ scale: 0.86 }}
                        onClick={() => {
                          if (editingAlert === item.ticker) {
                            setEditingAlert(null);
                          } else {
                            setEditingAlert(item.ticker);
                            setAlertAbove(item.alertAbove ? String(item.alertAbove) : "");
                            setAlertBelow(item.alertBelow ? String(item.alertBelow) : "");
                          }
                        }}
                        aria-label={`Set alert for ${item.ticker}`}
                        className={cn(
                          "rounded-full p-2 transition-colors",
                          item.alertAbove || item.alertBelow 
                            ? "text-blue bg-blue/10" 
                            : "text-label-quaternary/35 hover:text-label-secondary"
                        )}
                      >
                        {(item.alertAbove || item.alertBelow) ? <BellRinging size={16} /> : <Bell size={16} />}
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.86 }}
                        onClick={() => void remove(item.ticker)}
                        aria-label={`Remove ${item.ticker} from watchlist`}
                        className="rounded-full p-2 text-label-quaternary/35 hover:text-red active:bg-red/[0.10]"
                      >
                        <Trash size={16} />
                      </motion.button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {editingAlert === item.ticker && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="px-4 pb-3 overflow-hidden"
                      >
                        <div className="flex items-center gap-2 p-3 bg-fill/[0.04] dark:bg-white/[0.02] rounded-lg">
                          <div className="flex-1 space-y-1">
                            <label className="text-[10px] uppercase font-bold text-label-secondary/60 tracking-wider">Alert Above</label>
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-label-secondary/60 text-sm">₹</span>
                              <AmountInput
                                value={alertAbove}
                                onChange={setAlertAbove}
                                keypadLabel="Alert above"
                                showPreview={false}
                                placeholder="e.g. 250"
                                className="w-full bg-bg border border-separator/40 dark:border-white/[0.06] rounded-md pl-6 pr-2 py-1.5 text-sm outline-none focus:border-blue"
                              />
                            </div>
                          </div>
                          <div className="flex-1 space-y-1">
                            <label className="text-[10px] uppercase font-bold text-label-secondary/60 tracking-wider">Alert Below</label>
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-label-secondary/60 text-sm">₹</span>
                              <AmountInput
                                value={alertBelow}
                                onChange={setAlertBelow}
                                keypadLabel="Alert below"
                                showPreview={false}
                                placeholder="e.g. 190"
                                className="w-full bg-bg border border-separator/40 dark:border-white/[0.06] rounded-md pl-6 pr-2 py-1.5 text-sm outline-none focus:border-blue"
                              />
                            </div>
                          </div>
                          <div className="shrink-0 flex items-end pb-0.5">
                            <button
                              onClick={() => {
                                updateAlerts(item.ticker, { 
                                  alertAbove: alertAbove ? Number(alertAbove) : null,
                                  alertBelow: alertBelow ? Number(alertBelow) : null
                                });
                                setEditingAlert(null);
                              }}
                              className="h-8 w-8 flex items-center justify-center bg-blue text-white rounded-md active:scale-95 transition-transform"
                            >
                              <Check size={16} weight="bold" />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </PageContainer>
    </>
  );
}
