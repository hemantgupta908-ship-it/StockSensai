"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { CaretRight, ChartPie as AnalyticsIcon, DownloadSimple, Funnel, NotePencil, PencilSimple, Plus, Trash, Lightbulb, Lightning } from "@phosphor-icons/react";

import {
  TRADING_STYLES,
  TRADING_STYLE_LABELS,
  type TradingStyle,
} from "@/lib/strategies/types";
import { cn, formatDate, formatINR, todayISO } from "@/lib/utils";
import { useQuotes } from "@/hooks/use-quotes";
import { useSession } from "@/components/auth/session-provider";
import { Badge, ExchangeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { LocalStorageNotice } from "@/components/local-storage-notice";
import { PageContainer } from "@/components/ui/page-container";
import { NavBar } from "@/components/ui/nav-bar";
import { RefreshButton } from "@/components/ui/refresh-button";
import { usePortfolio, type PortfolioEntry } from "./portfolio-provider";
import { AddPositionSheet } from "./add-position-sheet";
import { PortfolioAnalytics } from "./portfolio-analytics";
import { analyzePosition } from "@/lib/portfolio/suggestions";

type StatusFilter = "all" | "open" | "closed";
type StyleFilter = "all" | TradingStyle;

export function PortfolioView() {
  const { entries, loading, remove, close, update, isLocal } = usePortfolio();
  const { authEnabled, user } = useSession();

  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [addingTicker, setAddingTicker] = useState<string | undefined>(undefined);
  const [closing, setClosing] = useState<PortfolioEntry | null>(null);
  const [editing, setEditing] = useState<PortfolioEntry | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [styleFilter, setStyleFilter] = useState<StyleFilter>("all");

  const openEntries = useMemo(() => entries.filter((e) => e.exitPrice === null), [entries]);
  const { quotes, refetch, refreshing } = useQuotes(openEntries.map((e) => e.ticker));

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (statusFilter === "open" && e.exitPrice !== null) return false;
      if (statusFilter === "closed" && e.exitPrice === null) return false;
      if (styleFilter !== "all") {
        const itemStyle = e.tradingStyle ?? "swing";
        if (itemStyle !== styleFilter) return false;
      }
      return true;
    });
  }, [entries, statusFilter, styleFilter]);

  const navBarProps = {
    title: "Portfolio",
    width: "wide" as const,
    hideSearch: true,
    hideThemeToggle: true,
  };

  const exportCSV = () => {
    if (entries.length === 0) return;
    const headers = [
      "Ticker",
      "Name",
      "Exchange",
      "Quantity",
      "Buy Price",
      "Buy Date",
      "Exit Price",
      "Exit Date",
      "Style",
      "Notes",
    ];
    const rows = entries.map((e) => [
      e.ticker,
      `"${e.name.replace(/"/g, '""')}"`,
      e.exchange,
      e.quantity,
      e.entryPrice,
      e.entryDate,
      e.exitPrice ?? "",
      e.exitDate ?? "",
      e.tradingStyle ?? "",
      `"${(e.note ?? "").replace(/"/g, '""')}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `portfolio_journal_${todayISO()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <>
        <NavBar {...navBarProps} />
        <PageContainer width="wide" className="space-y-2">
          <Skeleton className="h-28 w-full rounded-card" />
          <Skeleton className="h-28 w-full rounded-card" />
        </PageContainer>
      </>
    );
  }

  if (entries.length === 0) {
    return (
      <>
        <NavBar {...navBarProps} />
        <PageContainer width="wide">
          <div className="rounded-card border border-separator/40 bg-bg-secondary px-6 py-14 text-center shadow-card dark:border-white/[0.06] dark:shadow-card-dark">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue/[0.12]">
              <NotePencil size={22} className="text-blue" />
            </div>
            <p className="mt-3 text-subhead font-semibold text-label">No positions logged yet</p>
            <p className="mx-auto mt-1.5 max-w-xs text-footnote leading-relaxed text-label-secondary/60">
              Start building your portfolio. Log trades directly here or tap the notebook icon on any stock page.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Button size="md" variant="primary" onClick={() => setAddSheetOpen(true)}>
                <Plus size={16} className="mr-1" />
                Add First Position
              </Button>
              <Link href="/home">
                <Button size="md" variant="tinted">
                  Browse Ideas
                </Button>
              </Link>
            </div>
          </div>
          {/* Floating Add Position Action Button */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => setAddSheetOpen(true)}
            className="fixed bottom-[80px] right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#2c2c2e] text-white shadow-xl transition-transform active:scale-95 lg:bottom-8 lg:right-8 dark:bg-white dark:text-black"
            title="Add stock position"
            aria-label="Add stock position"
          >
            <Plus size={26} />
          </motion.button>
        </PageContainer>

        <AddPositionSheet open={addSheetOpen} onClose={() => setAddSheetOpen(false)} />
      </>
    );
  }

  // Financial calculations
  const openValue = openEntries.reduce((sum, e) => {
    const price = quotes[e.ticker]?.price ?? e.entryPrice;
    return sum + price * e.quantity;
  }, 0);
  const openCost = openEntries.reduce((sum, e) => sum + e.entryPrice * e.quantity, 0);
  const openPnl = openValue - openCost;

  const closedEntries = entries.filter((e) => e.exitPrice !== null);
  const realised = closedEntries.reduce(
    (sum, e) => sum + ((e.exitPrice ?? 0) - e.entryPrice) * e.quantity,
    0,
  );

  return (
    <>
      <NavBar {...navBarProps} />
      <PageContainer width="wide" className="space-y-3">
        {isLocal && authEnabled && (
          <LocalStorageNotice what="journal" reason={user ? "google-local" : "signed-out"} />
        )}

        {/* Top Summary Bar */}
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-card border border-separator/40 bg-separator/30 shadow-card dark:border-white/[0.06] dark:bg-white/[0.05] dark:shadow-card-dark">
          <SummaryStat label="Invested" value={formatINR(openCost, { decimals: 0 })} />
          <SummaryStat
            label="Open P&L"
            value={`${openPnl >= 0 ? "+" : ""}${formatINR(openPnl, { decimals: 0 })}`}
            tone={openPnl >= 0 ? "green" : "red"}
          />
          <SummaryStat
            label="Realised"
            value={`${realised >= 0 ? "+" : ""}${formatINR(realised, { decimals: 0 })}`}
            tone={closedEntries.length === 0 ? undefined : realised >= 0 ? "green" : "red"}
          />
        </div>

        {/* Toolbar & Filters */}
        <div className="flex items-center gap-2 sm:gap-2.5 overflow-x-auto no-scrollbar py-1 -mx-4 px-4 sm:mx-0 sm:px-0">
          {/* Status Tabs */}
          <div className="flex shrink-0 rounded-full bg-fill/[0.06] p-0.5 dark:bg-white/[0.06]">
            {(["all", "open", "closed"] as StatusFilter[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-caption font-medium capitalize transition-all duration-150 active:scale-95",
                  statusFilter === tab
                    ? "bg-bg text-label shadow-sm dark:bg-fill/40"
                    : "text-label-secondary/60 hover:text-label",
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Style Selector (Pill) */}
          <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-fill/[0.06] px-3 py-1.5 text-caption text-label-secondary/70 dark:bg-white/[0.05]">
            <Funnel size={14} />
            <select
              value={styleFilter}
              onChange={(e) => setStyleFilter(e.target.value as StyleFilter)}
              className="bg-transparent text-caption font-medium text-label focus:outline-none"
            >
              <option value="all">All Styles</option>
              {TRADING_STYLES.map((style) => (
                <option key={style} value={style}>
                  {TRADING_STYLE_LABELS[style]}
                </option>
              ))}
            </select>
          </div>

          <div className="hidden sm:block flex-1" />

          {/* Analytics Toggle */}
          <button
            onClick={() => setShowAnalytics(!showAnalytics)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-caption font-medium transition-colors",
              showAnalytics
                ? "bg-blue text-white"
                : "bg-fill/[0.06] text-label-secondary hover:bg-fill/[0.12] dark:bg-white/[0.05]",
            )}
            title="Toggle Performance Analytics"
          >
            <AnalyticsIcon size={14} />
            <span>Analytics</span>
          </button>

          {/* Add Position (Desktop Only) */}
          <Button size="sm" variant="primary" onClick={() => setAddSheetOpen(true)} className="hidden sm:flex shrink-0 rounded-full h-8 px-4 py-0">
            <Plus size={15} />
            <span>Add Position</span>
          </Button>
        </div>

        {/* Analytics Panel */}
        <AnimatePresence>
          {showAnalytics && (
            <PortfolioAnalytics entries={entries} quotes={quotes} />
          )}
        </AnimatePresence>

        {/* Entries List */}
        {filteredEntries.length > 0 ? (
          <AnimatePresence initial={false}>
            {filteredEntries.map((entry) => (
              <motion.div
                key={entry.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 350, damping: 32 }}
              >
                <JournalCard
                  entry={entry}
                  currentPrice={quotes[entry.ticker]?.price}
                  onEdit={() => setEditing(entry)}
                  onBuy={() => setAddingTicker(entry.ticker)}
                  onSell={() => setClosing(entry)}
                  onDelete={() => void remove(entry.id)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        ) : (
          <div className="rounded-card border border-separator/40 bg-bg-secondary px-6 py-10 text-center text-label-secondary/60 dark:border-white/[0.06]">
            No positions match the selected filters.
          </div>
        )}

        {/* Sheets */}
        <AddPositionSheet open={addSheetOpen || addingTicker !== undefined} initialTicker={addingTicker} onClose={() => { setAddSheetOpen(false); setAddingTicker(undefined); }} />
        <CloseSheet entry={closing} onDismiss={() => setClosing(null)} onConfirm={close} />
        <EditSheet entry={editing} onDismiss={() => setEditing(null)} onConfirm={update} />

        {/* Floating Add Position Action Button */}
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => setAddSheetOpen(true)}
          className="fixed bottom-[80px] right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#2c2c2e] text-white shadow-xl transition-transform active:scale-95 lg:bottom-8 lg:right-8 dark:bg-white dark:text-black"
          title="Add stock position"
          aria-label="Add stock position"
        >
          <Plus size={26} />
        </motion.button>
      </PageContainer>
    </>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "red";
}) {
  return (
    <div className="bg-bg-secondary px-3 py-3 text-center">
      <p className="text-caption2 text-label-secondary/50">{label}</p>
      <p
        className={cn(
          "numeric mt-0.5 text-subhead font-bold",
          tone === "green" ? "text-green" : tone === "red" ? "text-red" : "text-label",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function JournalCard({
  entry,
  currentPrice,
  onEdit,
  onBuy,
  onSell,
  onDelete,
}: {
  entry: PortfolioEntry;
  currentPrice?: number;
  onEdit: () => void;
  onBuy: () => void;
  onSell: () => void;
  onDelete: () => void;
}) {
  const isClosed = entry.exitPrice !== null;
  const markPrice = isClosed ? entry.exitPrice! : (currentPrice ?? entry.entryPrice);
  const pnl = (markPrice - entry.entryPrice) * entry.quantity;
  const pnlPct = ((markPrice - entry.entryPrice) / entry.entryPrice) * 100;

  // Did the fill land inside the suggested accumulation band?
  const followedPlan =
    entry.recommendedBuyLow !== null && entry.recommendedBuyHigh !== null
      ? entry.entryPrice >= entry.recommendedBuyLow && entry.entryPrice <= entry.recommendedBuyHigh
      : null;

  const hitTarget =
    entry.recommendedSellLow !== null && markPrice >= entry.recommendedSellLow;
  const hitStop = entry.recommendedStopLoss !== null && markPrice <= entry.recommendedStopLoss;

  const suggestion = !isClosed ? analyzePosition(entry, markPrice) : null;

  return (
    <article className="overflow-hidden rounded-card border border-separator/40 bg-bg-secondary shadow-card dark:border-white/[0.06] dark:shadow-card-dark transition-colors hover:bg-fill/[0.02]">
      <div className="flex flex-col sm:flex-row sm:items-center p-3 sm:px-4 sm:py-2.5 gap-3 sm:gap-4">
        {/* Left / Mobile Header: Ticker & Name & Mobile P&L */}
        <div className="flex items-start justify-between sm:w-[220px] shrink-0">
          <Link href={`/stock/${entry.ticker}`} className="flex flex-col min-w-0 pr-2">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate text-subhead font-bold text-label">{entry.ticker}</h3>
              {isClosed ? (
                <Badge tone="neutral">Closed</Badge>
              ) : (
                <Badge tone="blue" className="capitalize">
                  {entry.tradingStyle ?? "Swing"}
                </Badge>
              )}
            </div>
            <p className="mt-0.5 truncate text-caption2 text-label-secondary/55">{entry.name}</p>
          </Link>
          
          {/* Mobile P&L */}
          <div className="text-right sm:hidden">
            <p className={cn("numeric text-footnote font-bold", pnl >= 0 ? "text-green" : "text-red")}>
              {pnl >= 0 ? "+" : ""}{formatINR(pnl, { decimals: 0 })}
            </p>
            <p className={cn("numeric text-[10px] font-semibold", pnl >= 0 ? "text-green" : "text-red")}>
              {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
            </p>
          </div>
        </div>

        {/* Middle: Stats */}
        <div className="flex-1 grid grid-cols-4 gap-x-1 sm:gap-x-2 gap-y-2 items-center min-w-0">
          <MiniStat label="Qty" value={String(entry.quantity)} />
          <MiniStat label="Entry" value={formatINR(entry.entryPrice, { decimals: 0 })} />
          <MiniStat
            label={isClosed ? "Exit" : "Now"}
            value={formatINR(markPrice, { decimals: 0 })}
          />
          <MiniStat label="Date" value={formatDate(entry.entryDate)} />
        </div>

        {/* Right / Mobile Footer: P&L + Actions */}
        <div className="sm:w-[200px] shrink-0 flex items-center justify-end gap-4 mt-2 sm:mt-0 pt-2 sm:pt-0 border-t border-separator/40 sm:border-0 sm:border-t-0 dark:border-white/[0.06]">
          {/* Desktop P&L */}
          <div className="text-right min-w-[70px] hidden sm:block">
            <p
              className={cn(
                "numeric text-subhead font-bold",
                pnl >= 0 ? "text-green" : "text-red",
              )}
            >
              {pnl >= 0 ? "+" : ""}
              {formatINR(pnl, { decimals: 0 })}
            </p>
            <p className={cn("numeric text-caption2 font-semibold", pnl >= 0 ? "text-green" : "text-red")}>
              {pnlPct >= 0 ? "+" : ""}
              {pnlPct.toFixed(2)}%
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end w-full sm:w-auto gap-1.5 sm:border-l border-separator/40 dark:border-white/[0.06] sm:pl-3 sm:ml-1">
            {!isClosed && (
              <>
                <Button size="sm" variant="secondary" onClick={onBuy} className="h-7 px-2.5 py-0 text-caption2 font-semibold bg-blue/10 text-blue hover:bg-blue/20 dark:bg-blue/20 dark:hover:bg-blue/30 border-transparent transition-colors shadow-none">
                  Buy
                </Button>
                <Button size="sm" variant="secondary" onClick={onSell} className="h-7 px-2.5 py-0 text-caption2 font-semibold bg-red/10 text-red hover:bg-red/20 dark:bg-red/20 dark:hover:bg-red/30 border-transparent transition-colors shadow-none">
                  Sell
                </Button>
                <div className="w-px h-4 bg-separator/40 dark:bg-white/[0.06] mx-1" />
              </>
            )}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onEdit}
              aria-label={`Edit ${entry.ticker} journal entry`}
              className="rounded-md p-1.5 text-label-quaternary/50 hover:text-label hover:bg-fill/[0.06] active:bg-fill/[0.10]"
            >
              <PencilSimple size={14} />
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onDelete}
              aria-label={`Delete ${entry.ticker} journal entry`}
              className="rounded-md p-1.5 text-label-quaternary/50 hover:text-red hover:bg-red/10 active:bg-red/20"
            >
              <Trash size={14} />
            </motion.button>
          </div>
        </div>
      </div>

      {/* Plan versus execution */}
      {(entry.strategyId || entry.note) && (
        <div className="border-t border-separator/40 dark:border-white/[0.06] px-4 py-2.5 bg-fill/[0.02] dark:bg-white/[0.01]">
          {entry.strategyId && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption2 text-label-secondary/70">
              <span className="font-semibold text-label-secondary/90">
                {entry.strategyId.replace(/^(swing|st|lt)-/, "").replace(/-/g, " ")}:
              </span>
              <span className="numeric">
                Buy {formatINR(entry.recommendedBuyLow ?? 0, { decimals: 0 })}–{formatINR(entry.recommendedBuyHigh ?? 0, { decimals: 0 })}
              </span>
              <span className="numeric">
                Tgt {formatINR(entry.recommendedSellLow ?? 0, { decimals: 0 })}–{formatINR(entry.recommendedSellHigh ?? 0, { decimals: 0 })}
              </span>
              <span className="numeric">
                SL {formatINR(entry.recommendedStopLoss ?? 0, { decimals: 0 })}
              </span>

              <div className="flex items-center gap-1.5 ml-auto">
                {followedPlan !== null && (
                  <Badge tone={followedPlan ? "green" : "amber"}>
                    {followedPlan ? "Inside buy zone" : "Outside buy zone"}
                  </Badge>
                )}
                {hitTarget && <Badge tone="green">Target hit</Badge>}
                {hitStop && <Badge tone="red">Stop breached</Badge>}
              </div>
            </div>
          )}
          {entry.note && (
            <p className={cn("text-caption2 text-label-secondary/60 italic", entry.strategyId && "mt-1.5")}>
              &ldquo;{entry.note}&rdquo;
            </p>
          )}
        </div>
      )}

      {/* Suggestion Block */}
      {suggestion && suggestion.action !== "HOLD" && (
        <div className="border-t border-separator/40 dark:border-white/[0.06] px-4 py-2.5">
          <div className="flex items-start sm:items-center gap-2.5 rounded-lg px-3 py-2 text-caption2 bg-fill/[0.04] dark:bg-white/[0.02]">
            <div className={cn(
              "shrink-0 mt-0.5 sm:mt-0",
              suggestion.action === "TAKE_PROFIT" && "text-green",
              suggestion.action === "CUT_LOSS" && "text-red",
              suggestion.action === "AVERAGE_DOWN" && "text-blue",
            )}>
              {suggestion.action === "TAKE_PROFIT" ? (
                <Lightning size={16} weight="fill" />
              ) : suggestion.action === "CUT_LOSS" ? (
                <Lightbulb size={16} weight="fill" />
              ) : (
                <Lightbulb size={16} weight="fill" />
              )}
            </div>
            <p className="text-label-secondary font-medium leading-snug sm:leading-normal">
              <strong className={cn(
                "font-bold mr-1",
                suggestion.action === "TAKE_PROFIT" && "text-green",
                suggestion.action === "CUT_LOSS" && "text-red",
                suggestion.action === "AVERAGE_DOWN" && "text-blue",
              )}>
                {suggestion.action === "TAKE_PROFIT" && "Take Profit"}
                {suggestion.action === "CUT_LOSS" && "Cut Loss"}
                {suggestion.action === "AVERAGE_DOWN" && "Average Down"}
              </strong>
              <span className="text-label-quaternary mx-1">&middot;</span>
              {suggestion.reason}
            </p>
          </div>
        </div>
      )}
    </article>
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

function CloseSheet({
  entry,
  onDismiss,
  onConfirm,
}: {
  entry: PortfolioEntry | null;
  onDismiss: () => void;
  onConfirm: (id: string, exitPrice: number, exitDate: string) => Promise<void>;
}) {
  const [exitPrice, setExitPrice] = useState("");
  const [exitDate, setExitDate] = useState(() => todayISO());

  const priceValue = Number(exitPrice);
  const valid = priceValue > 0 && Boolean(exitDate);

  return (
    <Sheet
      open={entry !== null}
      onClose={onDismiss}
      title={entry ? `Close ${entry.ticker}` : ""}
    >
      {entry && (
        <div className="space-y-4">
          <p className="text-footnote leading-snug text-label-secondary/60">
            Record the price you actually exited at. This only updates your journal — no order is
            placed anywhere.
          </p>

          <label className="block">
            <span className="mb-1.5 block text-footnote font-medium text-label-secondary/70">
              Exit price (₹)
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="0.05"
              min={0}
              value={exitPrice}
              onChange={(e) => setExitPrice(e.target.value)}
              placeholder={String(entry.entryPrice)}
              className="w-full rounded-[12px] border border-separator/50 bg-bg px-3.5 py-2.5 text-body text-label focus:border-blue focus:outline-none dark:border-white/[0.10] dark:bg-white/[0.05]"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-footnote font-medium text-label-secondary/70">
              Exit date
            </span>
            <input
              type="date"
              value={exitDate}
              max={todayISO()}
              onChange={(e) => setExitDate(e.target.value)}
              className="w-full rounded-[12px] border border-separator/50 bg-bg px-3.5 py-2.5 text-body text-label focus:border-blue focus:outline-none dark:border-white/[0.10] dark:bg-white/[0.05]"
            />
          </label>

          {valid && (
            <p className="numeric text-footnote text-label-secondary/60">
              Result:{" "}
              <span
                className={cn(
                  "font-semibold",
                  priceValue >= entry.entryPrice ? "text-green" : "text-red",
                )}
              >
                {priceValue >= entry.entryPrice ? "+" : ""}
                {formatINR((priceValue - entry.entryPrice) * entry.quantity)}
              </span>
            </p>
          )}

          <Button
            fullWidth
            size="lg"
            disabled={!valid}
            onClick={async () => {
              await onConfirm(entry.id, priceValue, exitDate);
              setExitPrice("");
              onDismiss();
            }}
          >
            Close position
          </Button>
        </div>
      )}
    </Sheet>
  );
}

function EditSheet({
  entry,
  onDismiss,
  onConfirm,
}: {
  entry: PortfolioEntry | null;
  onDismiss: () => void;
  onConfirm: (id: string, updates: Partial<PortfolioEntry>) => Promise<void>;
}) {
  const [quantity, setQuantity] = useState(entry ? String(entry.quantity) : "");
  const [entryPrice, setEntryPrice] = useState(entry ? String(entry.entryPrice) : "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [saving, setSaving] = useState(false);

  const quantityVal = Number(quantity);
  const priceVal = Number(entryPrice);
  const valid = quantityVal > 0 && priceVal > 0;

  return (
    <Sheet
      open={entry !== null}
      onClose={onDismiss}
      title={entry ? `Edit ${entry.ticker} Entry` : ""}
    >
      {entry && (
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-footnote font-medium text-label-secondary/70">
              Quantity
            </span>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded-[12px] border border-separator/50 bg-bg px-3.5 py-2.5 text-body text-label focus:border-blue focus:outline-none dark:border-white/[0.10] dark:bg-white/[0.05]"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-footnote font-medium text-label-secondary/70">
              Entry price (₹)
            </span>
            <input
              type="number"
              step="0.05"
              min={0}
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
              className="w-full rounded-[12px] border border-separator/50 bg-bg px-3.5 py-2.5 text-body text-label focus:border-blue focus:outline-none dark:border-white/[0.10] dark:bg-white/[0.05]"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-footnote font-medium text-label-secondary/70">
              Notes
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-[12px] border border-separator/50 bg-bg px-3.5 py-2.5 text-body text-label focus:border-blue focus:outline-none dark:border-white/[0.10] dark:bg-white/[0.05]"
            />
          </label>

          <Button
            fullWidth
            size="lg"
            disabled={!valid || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onConfirm(entry.id, {
                  quantity: quantityVal,
                  entryPrice: priceVal,
                  note: note.trim() || null,
                });
                onDismiss();
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
