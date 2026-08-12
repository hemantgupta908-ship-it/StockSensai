"use client";
import { useShallow } from "zustand/react/shallow";

/**
 * Account-scoped transaction view.
 *
 * Full detailed dashboard view matching mobile account view spec:
 * - Account Total hero card with transaction count
 * - Time range selector (All Time, Month, Year)
 * - Breakdown summary stats (Expense, Income)
 * - Smooth balance trend line graph
 * - Dual category stacked horizontal bars (Outgoing / Incoming)
 * - Segmented Outgoing / Incoming doughnut breakdown with floating icons
 * - Detailed category list with subcategory breakdowns
 * - Account transaction history list & FAB button
 */

import { useMemo, useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowsLeftRight,
  CaretDown,
  CaretUp,
  Clock,
  CreditCard,
  List,
  Plus,
  Star,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import Link from "next/link";
import { MobileSidebar } from "@/components/ui/mobile-sidebar";

import { cn } from "@/lib/utils";
import { type Transaction, type TransactionCategory } from "@/lib/budget/types";
import {
  affectsWalletBalance,
  getWalletBalance,
  getSpendingSummary,
  isBalanceCorrection,
  isExcludedFromTotals,
  isPolicyPremium,
  isTransfer,
  countsTowardsTotal,
} from "@/lib/budget/calculations";
import { getCreditCardStatus, isCreditCard, dayInMonth } from "@/lib/budget/credit";
import { formatCurrencyAmount } from "@/lib/budget/currency";
import { getIcon } from "@/lib/budget/icons";
import { useBudget, useCategoryLookup } from "./budget-provider";
import { IconBadge } from "./icon-picker";
import {
  Amount,
  Card,
  EmptyState,
  SearchField,
  SegmentedTabs,
  ProgressBar,
  formatDayHeading,
  useGroupedByDay,
} from "./budget-ui";
import { TransactionGroup, TransactionRow } from "./transaction-row";
import { TransactionModal } from "./transaction-modal";
import { CONTAINER_WIDTHS } from "@/components/ui/page-container";

/**
 * Loaded on demand, and only once the user actually opens the importer.
 *
 * It pulls in `xlsx`, which is ~880 kB minified — statically imported it landed
 * in this route's first-load bundle for every visit, whether or not anyone
 * imported a spreadsheet. Rendering it conditionally (rather than always, with
 * `open={false}`) is what keeps the chunk from being fetched on mount.
 */
const ImportPreviewModal = dynamic(
  () => import("./import-preview-modal").then((m) => m.ImportPreviewModal),
  { ssr: false },
);

type DirectionFilter = "all" | "expense" | "income";
type TimeRange = "all" | "month" | "year";

type CycleGroup = {
  key: string;
  cycleStart: Date;
  cycleEnd: Date;
  spend: number;
  payments: number;
  items: Transaction[];
  unpaidAmount?: number;
};

function getSmoothPath(points: { x: number; y: number }[], tension = 0.15): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  if (points.length === 2)
    return `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)},${points[1].y.toFixed(1)}`;

  let d = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 >= points.length ? points.length - 1 : i + 2];

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }

  return d;
}

function formatCompactAmount(num: number): string {
  const abs = Math.abs(num);
  if (abs >= 100000) return `₹${(abs / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `₹${(abs / 1000).toFixed(1)}K`;
  return `₹${Math.round(abs)}`;
}

function useGroupedByCycle(transactions: Transaction[], statementDay: number | null) {
  return useMemo(() => {
    if (statementDay === null) return null;

    const groups = new Map<string, CycleGroup>();

    for (const t of transactions) {
      const d = new Date(t.dateCreated);
      const dMonthStatement = dayInMonth(d.getFullYear(), d.getMonth(), statementDay);

      let cycleEnd: Date;
      if (d.getTime() <= dMonthStatement.getTime()) {
        cycleEnd = dMonthStatement;
      } else {
        cycleEnd = dayInMonth(d.getFullYear(), d.getMonth() + 1, statementDay);
      }

      const cycleStart = dayInMonth(cycleEnd.getFullYear(), cycleEnd.getMonth() - 1, statementDay);
      const key = `${cycleEnd.getFullYear()}-${String(cycleEnd.getMonth() + 1).padStart(2, "0")}-${String(cycleEnd.getDate()).padStart(2, "0")}`;

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          cycleStart,
          cycleEnd,
          spend: 0,
          payments: 0,
          items: [],
        });
      }

      const group = groups.get(key)!;
      group.items.push(t);
      if (t.paid && !t.income) {
        group.spend += Math.abs(t.amount);
      } else if (t.paid && t.income) {
        group.payments += Math.abs(t.amount);
      }
    }

    return [...groups.values()].sort((a, b) => b.cycleEnd.getTime() - a.cycleEnd.getTime());
  }, [transactions, statementDay]);
}

export function AccountTransactionsView({ walletPk }: { walletPk: string }) {
  const { wallets, transactions, allWallets, settings, objectives, categories  } = useBudget(useShallow((s) => ({ wallets: s.wallets, transactions: s.transactions, allWallets: s.allWallets, settings: s.settings, objectives: s.objectives, categories: s.categories })));
  const { byPk, main, subsByParent } = useCategoryLookup();

  const wallet = wallets.find((w) => w.walletPk === walletPk);
  const accent = wallet?.colour ?? "#4CAF50";

  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [doughnutTab, setDoughnutTab] = useState<"outgoing" | "incoming">("outgoing");
  const [selectedCategoryPk, setSelectedCategoryPk] = useState<string | null>(null);
  const [doughnutExpanded, setDoughnutExpanded] = useState(false);
  const [expandedSubcategories, setExpandedSubcategories] = useState<Set<string>>(new Set());

  const [accountHoverIndex, setAccountHoverIndex] = useState<number | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [modalDefaults, setModalDefaults] = useState<Partial<Transaction> | undefined>(undefined);
  const [modalDefaultTab, setModalDefaultTab] = useState<"expense" | "income" | "transfer" | undefined>(undefined);

  const balance = useMemo(
    () => (wallet ? getWalletBalance(transactions, wallet.walletPk) : 0),
    [transactions, wallet],
  );

  const card = useMemo(
    () => (wallet && isCreditCard(wallet) ? getCreditCardStatus(wallet, transactions) : null),
    [wallet, transactions],
  );

  // Filter transactions for this wallet based on timeRange
  const walletTransactions = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();

    return transactions.filter((t) => {
      if (t.walletFk !== walletPk) return false;
      const tTime = new Date(t.dateCreated).getTime();
      if (timeRange === "month" && tTime < startOfMonth) return false;
      if (timeRange === "year" && tTime < startOfYear) return false;
      return true;
    });
  }, [transactions, walletPk, timeRange]);

  /**
   * Income and expense totals for the summary card.
   *
   * Counts exactly what the category breakdown below counts, so the headline
   * figure and the list under it cannot disagree: balance corrections are
   * reconciliations, transfers are money changing pockets, and lending is money
   * expected back — none of them are earning or spending.
   */
  const breakdownStats = useMemo(() => {
    let expenseSum = 0;
    let expenseCount = 0;
    let incomeSum = 0;
    let incomeCount = 0;

    for (const t of walletTransactions) {
      if (!countsTowardsTotal(t)) continue;
      if (isBalanceCorrection(t) || isTransfer(t) || t.objectiveLoanFk) continue;

      const amt = Math.abs(t.amount);
      if (t.income) {
        incomeSum += amt;
        incomeCount++;
      } else {
        expenseSum += amt;
        expenseCount++;
      }
    }

    return { expenseSum, expenseCount, incomeSum, incomeCount };
  }, [walletTransactions]);

  // Daily running balance points for trend line graph
  const rawTrendPoints = useMemo(() => {
    const sorted = [...walletTransactions].sort(
      (a, b) => new Date(a.dateCreated).getTime() - new Date(b.dateCreated).getTime(),
    );

    let running = 0;
    const pointsMap = new Map<string, { date: Date; value: number }>();
    for (const t of sorted) {
      if (affectsWalletBalance(t)) {
        running += t.amount;
      }
      const d = new Date(t.dateCreated);
      const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      pointsMap.set(dayKey, { date: d, value: running });
    }
    return [...pointsMap.values()];
  }, [walletTransactions]);

  const trendPoints = useMemo(() => {
    if (rawTrendPoints.length < 3) return rawTrendPoints;
    return rawTrendPoints.map((p, i) => {
      if (i === 0 || i === rawTrendPoints.length - 1) return p;
      const prev = rawTrendPoints[i - 1].value;
      const curr = p.value;
      const next = rawTrendPoints[i + 1].value;
      return { ...p, value: (prev + curr * 2 + next) / 4 };
    });
  }, [rawTrendPoints]);

  // Category breakdown maps for outgoing and incoming.
  //
  // Transfers are money changing pockets, not spending — a credit card bill
  // payment is the clearest case, since the spending was already counted when
  // the card was used and counting the settlement again bills it twice. Leaving
  // them in also inflated the denominator, so every real category's share of
  // outgoing read lower than it was.
  const outgoingByCategory = useMemo(() => {
    const map = new Map<string, { sum: number; count: number }>();

    for (const t of walletTransactions) {
      if (!countsTowardsTotal(t) || t.income) continue;
      // One rule for what counts as spending, shared with the home screen and
      // the totals, so the same transaction cannot be spending on one screen and
      // not on another: transfers, balance corrections, lending and policy
      // premiums are all money moved rather than consumed. Repaying money you
      // borrowed is still an expense, and this already draws that line — a loan
      // EMI stays in the Loan category while cash lent to someone leaves it.
      if (isExcludedFromTotals(t, objectives)) continue;
      const key = t.categoryFk;
      const existing = map.get(key) ?? { sum: 0, count: 0 };
      map.set(key, { sum: existing.sum + Math.abs(t.amount), count: existing.count + 1 });
    }
    return map;
  }, [walletTransactions, objectives]);

  /** Premiums paid from this account — savings, so reported but not spending. */
  const savings = useMemo(() => {
    let total = 0;
    let count = 0;
    for (const t of walletTransactions) {
      if (!countsTowardsTotal(t) || t.income || !isPolicyPremium(t)) continue;
      total += Math.abs(t.amount);
      count++;
    }
    return { total, count };
  }, [walletTransactions]);

  /** Money lent out of this account, reported beside the categories, not inside them. */
  const lentOut = useMemo(() => {
    let total = 0;
    let count = 0;
    for (const t of walletTransactions) {
      if (!countsTowardsTotal(t) || t.income) continue;
      if (!t.objectiveLoanFk || !isExcludedFromTotals(t, objectives)) continue;
      total += Math.abs(t.amount);
      count++;
    }
    return { total, count };
  }, [walletTransactions, objectives]);

  /**
   * Money sent to settle a credit card, kept out of the breakdown above.
   *
   * Paying a card bill is not spending — that already happened when the card was
   * used, and is counted on the card's own account. But the cash really does
   * leave this account, so it is reported beside the categories rather than
   * silently dropped. A transfer counts as a card payment when the other leg
   * lands on a credit card wallet.
   */
  const cardPayments = useMemo(() => {
    let total = 0;
    let count = 0;
    for (const t of walletTransactions) {
      if (!countsTowardsTotal(t) || t.income || !isTransfer(t)) continue;
      const paired = t.pairedTransactionFk
        ? transactions.find((x) => x.transactionPk === t.pairedTransactionFk)
        : null;
      if (!paired) continue;
      const destination = wallets.find((w) => w.walletPk === paired.walletFk);
      if (destination && isCreditCard(destination)) {
        total += Math.abs(t.amount);
        count++;
      }
    }
    return { total, count };
  }, [walletTransactions, transactions, wallets]);

  // Grouped by the category the transaction was actually filed under, the same
  // way outgoing is. Income used to be sorted by sniffing its name for "salary"
  // or "bank", with anything unrecognised reported as Salary — inventing a
  // breakdown rather than showing the one that was recorded.
  const incomingByCategory = useMemo(() => {
    const map = new Map<string, { sum: number; count: number }>();
    for (const t of walletTransactions) {
      if (!countsTowardsTotal(t) || !t.income) continue;
      // Same rule in reverse: collecting back money you lent is not earning.
      if (isExcludedFromTotals(t, objectives)) continue;
      const existing = map.get(t.categoryFk) ?? { sum: 0, count: 0 };
      map.set(t.categoryFk, { sum: existing.sum + Math.abs(t.amount), count: existing.count + 1 });
    }
    return map;
  }, [walletTransactions, objectives]);

  // Active breakdown map based on doughnutTab
  const activeBreakdown = doughnutTab === "outgoing" ? outgoingByCategory : incomingByCategory;
  const activeTotal = useMemo(
    () => [...activeBreakdown.values()].reduce((sum, item) => sum + item.sum, 0),
    [activeBreakdown],
  );

  const sortedCategoryEntries = useMemo(() => {
    return [...activeBreakdown.entries()].sort((a, b) => b[1].sum - a[1].sum);
  }, [activeBreakdown]);

  // Filtered transactions for list view
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return walletTransactions
      .filter((t) => {
        if (direction === "expense" && t.income) return false;
        if (direction === "income" && !t.income) return false;
        if (!needle) return true;
        const category = byPk.get(t.categoryFk)?.name ?? "";
        return (
          t.name.toLowerCase().includes(needle) ||
          t.note.toLowerCase().includes(needle) ||
          category.toLowerCase().includes(needle) ||
          String(Math.abs(t.amount)).includes(needle)
        );
      })
      .sort((a, b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime());
  }, [walletTransactions, query, direction, byPk]);

  const summary = useMemo(
    () => getSpendingSummary(allWallets, filtered, objectives),
    [allWallets, filtered, objectives],
  );

  const dailyBalances = useMemo(() => {
    const sorted = [...walletTransactions].sort(
      (a, b) => new Date(a.dateCreated).getTime() - new Date(b.dateCreated).getTime(),
    );
    let current = 0;
    const balances = new Map<string, number>();
    for (const t of sorted) {
      if (affectsWalletBalance(t)) {
        current += t.amount;
      }
      const d = new Date(t.dateCreated);
      const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;
      balances.set(dayKey, current);
    }
    return balances;
  }, [walletTransactions]);

  const dayGroups = useGroupedByDay(filtered);
  const cycleGroups = useGroupedByCycle(
    filtered,
    wallet && isCreditCard(wallet) ? (wallet.statementDay ?? null) : null,
  );

  const cycleGroupsWithUnpaid = useMemo(() => {
    if (!cycleGroups || !card) return cycleGroups;
    let accumulatedSpend = 0;
    return cycleGroups.map((group) => {
      const unpaidAmount = Math.max(0, Math.min(group.spend, card.outstanding - accumulatedSpend));
      accumulatedSpend += group.spend;
      return { ...group, unpaidAmount };
    });
  }, [cycleGroups, card]);

  const isPrimary = wallet?.walletPk === settings.primaryWalletPk;

  function openEdit(t: Transaction) {
    setEditing(t);
    setModalOpen(true);
  }

  if (!wallet) {
    return (
      <div className={cn("mx-auto pb-10 pt-5", CONTAINER_WIDTHS.wide)}>
        <EmptyState icon={ArrowsLeftRight} title="Account not found" />
      </div>
    );
  }

  return (
    <div
      className="min-h-[100dvh]"
      style={{
        "--account-accent": accent,
        background: `linear-gradient(180deg, ${accent}15 0%, ${accent}03 100%)`,
      } as React.CSSProperties}
    >
      {/* Accent-themed header */}
      <header
        className="sticky top-0 z-30 border-b safe-top"
        style={{
          background: `linear-gradient(135deg, ${accent}18 0%, ${accent}08 100%)`,
          borderColor: `${accent}25`,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <div className={cn("mx-auto py-3", CONTAINER_WIDTHS.wide)}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="-ml-1 flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/10 focus:outline-none"
              aria-label="Open menu"
              style={{ color: accent }}
            >
              <div className="flex w-[18px] flex-col gap-[4px]">
                <span className="h-[2px] w-full rounded-full bg-current" />
                <span className="h-[2px] w-full rounded-full bg-current" />
                <span className="h-[2px] w-full rounded-full bg-current" />
              </div>
            </button>

            <IconBadge
              iconName={wallet.iconName}
              colour={accent}
              size={36}
              fallback={wallet.name}
            />

            <div className="min-w-0 flex-1">
              <h1 className="flex items-center gap-2 truncate text-headline font-semibold text-label">
                {wallet.name}
                {isPrimary ? <Star size={13} className="shrink-0 fill-amber text-amber" /> : null}
                {card ? <CreditCard size={14} className="shrink-0 text-label-secondary/50" /> : null}
              </h1>
              <p className="text-caption text-label-secondary/60">
                {(wallet.currency ?? "INR").toUpperCase()} Account Details
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Body */}
      <main className={cn("mx-auto pb-12 pt-4 space-y-5", CONTAINER_WIDTHS.wide)}>
        {/* 1. Account Total Hero Card */}
        <div className="rounded-[24px] bg-bg-secondary p-6 shadow-sm text-center relative">
          <div className="absolute top-4 right-4">
            <TimeRangeSelector value={timeRange} onChange={setTimeRange} accent={accent} />
          </div>
          <p className="text-caption uppercase tracking-wider font-semibold text-label-secondary/60">
            Account Total
          </p>
          <div className="mt-1 flex items-baseline justify-center gap-2">
            <span
              className={cn(
                "text-title1 sm:text-largetitle font-bold tabular-nums",
                card ? (card.outstanding > 0 ? "text-red" : "text-green") : balance < 0 ? "text-red" : "text-green",
              )}
            >
              {formatCurrencyAmount(card ? card.outstanding : balance, wallet.currency, {
                decimals: settings.showDecimals ? wallet.decimals : 2,
                obfuscate: settings.hideAmounts,
              })}
            </span>
            <span className="text-subhead font-semibold text-label-secondary/70">
              {(wallet.currency ?? "INR").toUpperCase()}
            </span>
          </div>
          <p className="mt-1 text-caption text-label-secondary/50 font-medium">
            {walletTransactions.length} transactions
          </p>
        </div>

        {/*
          3. Breakdown Summary Card
        */}
        <Card className="!p-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-caption2 uppercase tracking-wide text-label-secondary/50">Income</p>
              <Amount value={breakdownStats.incomeSum} className="text-subhead font-semibold text-green" />
            </div>
            <div>
              <p className="text-caption2 uppercase tracking-wide text-label-secondary/50">Expense</p>
              <Amount value={breakdownStats.expenseSum} className="text-subhead font-semibold text-red" />
            </div>
            <div>
              <p className="text-caption2 uppercase tracking-wide text-label-secondary/50">Net</p>
              <Amount value={breakdownStats.incomeSum - breakdownStats.expenseSum} colour showSign className="text-subhead font-semibold" />
            </div>
          </div>
        </Card>

        {/* 4. Smooth Balance Trend Line Graph Card */}
        {trendPoints.length >= 2 ? (
          <div className="rounded-[22px] bg-bg-secondary p-4 shadow-sm space-y-2">
            {(() => {
              const activeIdx = accountHoverIndex !== null ? accountHoverIndex : trendPoints.length - 1;
              const activePoint = trendPoints[activeIdx];
              return (
                <div className="flex items-center justify-between px-1 mb-1">
                  <span className="text-caption font-medium text-label-secondary/70">
                    {new Date(activePoint.date).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  <div className="flex items-center gap-1.5 text-subhead font-semibold">
                    <span className="text-caption text-label-secondary/50">
                      {accountHoverIndex !== null ? "Selected:" : "Balance:"}
                    </span>
                    <Amount value={activePoint.value} colour showSign />
                  </div>
                </div>
              );
            })()}

            <div className="relative h-[150px] w-full">
              {(() => {
                const values = trendPoints.map((p) => p.value);
                const min = Math.min(...values, 0);
                const max = Math.max(...values, 0);
                const span = max - min || 1;
                const width = 320;
                const height = 120;

                const coords = trendPoints.map((p, i) => ({
                  x: (i / (trendPoints.length - 1)) * width,
                  y: height - ((p.value - min) / span) * height,
                }));

                const path = getSmoothPath(coords, 0.25);
                const zeroY = height - ((0 - min) / span) * height;

                const activeIdx = accountHoverIndex !== null ? accountHoverIndex : trendPoints.length - 1;
                const activeCoord = coords[activeIdx];

                function handleMove(e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) {
                  const svg = e.currentTarget;
                  const rect = svg.getBoundingClientRect();
                  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
                  const relX = Math.max(0, Math.min(rect.width, clientX - rect.left));
                  const pct = relX / rect.width;
                  const idx = Math.round(pct * (trendPoints.length - 1));
                  setAccountHoverIndex(Math.max(0, Math.min(trendPoints.length - 1, idx)));
                }

                return (
                  <svg
                    viewBox={`0 0 ${width} ${height}`}
                    className="h-full w-full cursor-crosshair touch-none overflow-visible"
                    preserveAspectRatio="none"
                    onMouseMove={handleMove}
                    onTouchMove={handleMove}
                    onMouseLeave={() => setAccountHoverIndex(null)}
                    onTouchEnd={() => setAccountHoverIndex(null)}
                  >
                    <defs>
                      <pattern id="accountGraphDotPattern" x="0" y="0" width="4.5" height="4.5" patternUnits="userSpaceOnUse">
                        <circle cx="1.5" cy="1.5" r="0.45" fill="rgb(var(--sys-gray))" opacity="0.85" />
                      </pattern>
                      <linearGradient id="accountGraphDotFadeGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="white" stopOpacity="1" />
                        <stop offset="35%" stopColor="white" stopOpacity="0.75" />
                        <stop offset="70%" stopColor="white" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="white" stopOpacity="0.05" />
                      </linearGradient>
                      <mask id="accountGraphMask">
                        <path d={`${path} L${width},${zeroY} L0,${zeroY} Z`} fill="url(#accountGraphDotFadeGradient)" />
                      </mask>
                      <linearGradient id="accountGraphGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgb(var(--sys-gray))" stopOpacity="0.15" />
                        <stop offset="100%" stopColor="rgb(var(--sys-gray))" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    <line
                      x1="0"
                      y1={zeroY}
                      x2={width}
                      y2={zeroY}
                      stroke="rgb(var(--separator))"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />

                    {/* Dotted Grid Area Fill with Top-to-Bottom Density Fade */}
                    <rect
                      x="0"
                      y="0"
                      width={width}
                      height={height}
                      fill="url(#accountGraphDotPattern)"
                      mask="url(#accountGraphMask)"
                    />

                    {/* Subtle Background Gradient Area */}
                    <path
                      d={`${path} L${width},${zeroY} L0,${zeroY} Z`}
                      fill="url(#accountGraphGrad)"
                    />

                    {/* Thin Trendline Curve */}
                    <path
                      d={path}
                      fill="none"
                      stroke="rgb(var(--sys-gray))"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                    {accountHoverIndex !== null && activeCoord ? (
                      <g>
                        <line
                          x1={activeCoord.x}
                          y1="0"
                          x2={activeCoord.x}
                          y2={height}
                          stroke="rgb(var(--label-secondary))"
                          strokeWidth="1.5"
                          strokeDasharray="3 3"
                          opacity="0.6"
                        />
                        <circle
                          cx={activeCoord.x}
                          cy={activeCoord.y}
                          r="6"
                          fill={accent}
                          stroke="#FFFFFF"
                          strokeWidth="2.5"
                          className="drop-shadow-md"
                        />
                      </g>
                    ) : null}
                  </svg>
                );
              })()}
            </div>
            {/* X-axis date labels */}
            <div className="flex justify-between px-1 text-[11px] font-medium text-label-secondary/60">
              <span>{new Date(trendPoints[0].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              <span>{new Date(trendPoints[Math.floor(trendPoints.length / 2)].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              <span>{new Date(trendPoints[trendPoints.length - 1].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
            </div>
          </div>
        ) : null}

        {/* 5. Dual Stacked Horizontal Category Bars Card */}
        {activeTotal > 0 ? (
          <div className="rounded-[22px] bg-bg-secondary p-5 shadow-sm space-y-4">
            {/* Outgoing Horizontal Stack Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-caption font-semibold text-label-secondary/70">
                <span className="flex items-center gap-1 text-red">🔻 Outgoing</span>
                <span>₹{breakdownStats.expenseSum.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-fill/10 p-0.5">
                {[...outgoingByCategory.entries()].map(([catPk, item]) => {
                  const category = byPk.get(catPk);
                  const parent = category?.mainCategoryPk ? byPk.get(category.mainCategoryPk) : null;
                  const catColor = category?.colour ?? parent?.colour ?? "#8E8E93";
                  const pct = (item.sum / (breakdownStats.expenseSum || 1)) * 100;
                  if (pct <= 0) return null;
                  return (
                    <div
                      key={`out-bar-${catPk}`}
                      className="h-full first:rounded-l-full last:rounded-r-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: catColor }}
                      title={`${category?.name}: ₹${item.sum}`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Incoming Horizontal Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-caption font-semibold text-label-secondary/70">
                <span className="flex items-center gap-1 text-green">🔺 Incoming</span>
                <span>₹{breakdownStats.incomeSum.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-fill/10 p-0.5">
                {[...incomingByCategory.entries()].map(([catPk, item]) => {
                  const category = byPk.get(catPk);
                  const parent = category?.mainCategoryPk ? byPk.get(category.mainCategoryPk) : null;
                  const catColor = category?.colour ?? parent?.colour ?? "#4CAF50";
                  const pct = (item.sum / (breakdownStats.incomeSum || 1)) * 100;
                  if (pct <= 0) return null;
                  return (
                    <div
                      key={`inc-bar-${catPk}`}
                      className="h-full first:rounded-l-full last:rounded-r-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: catColor }}
                      title={`${category?.name}: ₹${item.sum}`}
                    />
                  );
                })}
              </div>
            </div>

            {/* X-axis tick markers */}
            <div className="flex justify-between px-1 text-[10px] font-medium text-label-secondary/50 pt-1">
              <span>₹0</span>
              <span>{formatCompactAmount((breakdownStats.expenseSum + breakdownStats.incomeSum) * 0.25)}</span>
              <span>{formatCompactAmount((breakdownStats.expenseSum + breakdownStats.incomeSum) * 0.5)}</span>
              <span>{formatCompactAmount((breakdownStats.expenseSum + breakdownStats.incomeSum) * 0.75)}</span>
              <span>{formatCompactAmount(Math.max(breakdownStats.expenseSum, breakdownStats.incomeSum))}</span>
            </div>
          </div>
        ) : null}

        {/* 6. Outgoing / Incoming Doughnut Switcher Card */}
        <div className="rounded-[24px] bg-bg-secondary p-5 shadow-sm space-y-4">
          {/* Segmented Tab Switcher */}
          <div className="flex rounded-full bg-fill/10 p-1 text-subhead font-semibold">
            <button
              type="button"
              onClick={() => {
                setDoughnutTab("outgoing");
                setSelectedCategoryPk(null);
              }}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 rounded-full py-2 transition-all",
                doughnutTab === "outgoing"
                  ? "bg-bg-elevated text-red shadow-sm"
                  : "text-label-secondary/70 hover:text-label",
              )}
            >
              🔻 Outgoing
            </button>
            <button
              type="button"
              onClick={() => {
                setDoughnutTab("incoming");
                setSelectedCategoryPk(null);
              }}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 rounded-full py-2 transition-all",
                doughnutTab === "incoming"
                  ? "bg-bg-elevated text-green shadow-sm"
                  : "text-label-secondary/70 hover:text-label",
              )}
            >
              🔺 Incoming
            </button>
          </div>

          {/* Interactive Category Doughnut Chart with Outer Floating Icons */}
          {activeTotal > 0 ? (
            <div className="relative flex items-center justify-center py-4 w-full" onClick={() => setSelectedCategoryPk(null)}>
              {(() => {
                const radius = 52;
                const circumference = 2 * Math.PI * radius;
                let offset = 0;
                const svgElements: React.ReactNode[] = [];
                const selectedSvgElements: React.ReactNode[] = [];
                const floatingIcons: React.ReactNode[] = [];

                sortedCategoryEntries.forEach(([catPk, item], index) => {
                  const share = item.sum / activeTotal;
                  const dash = share * circumference;
                  const category = byPk.get(catPk);
                  const parent = category?.mainCategoryPk ? byPk.get(category.mainCategoryPk) : null;
                  const catName = category?.name ?? "Uncategorised";
                  const color = category?.colour ?? parent?.colour ?? (doughnutTab === "outgoing" ? "#E91E63" : "#4CAF50");

                  const isSelected = selectedCategoryPk === catPk;
                  const isDimmed = selectedCategoryPk !== null && !isSelected;
                  const strokeWidth = isSelected ? 40 : 32;
                  const angle = ((offset + dash / 2) / circumference) * 2 * Math.PI;

                  const circleNode = (
                    <circle
                      key={catPk}
                      cx="80"
                      cy="80"
                      r={radius}
                      fill="none"
                      stroke={color}
                      strokeWidth={strokeWidth}
                      strokeDasharray={`${dash} ${circumference - dash}`}
                      strokeDashoffset={-offset}
                      opacity={isDimmed ? 0.3 : 1}
                      className="transition-all duration-300 ease-out cursor-pointer outline-none hover:opacity-90"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCategoryPk(selectedCategoryPk === catPk ? null : catPk);
                      }}
                    >
                      <title>{`${catName} — ${Math.round(share * 100)}% (₹${item.sum.toFixed(2)})`}</title>
                    </circle>
                  );

                  if (isSelected) {
                    selectedSvgElements.push(circleNode);
                  } else {
                    svgElements.push(circleNode);
                  }

                  const shouldShowIcon = selectedCategoryPk !== null ? isSelected : (index < 5 && share > 0.04);
                  if (shouldShowIcon) {
                    const outerEdgeRadius = isSelected ? 74 : 68;
                    const iconX = 80 + outerEdgeRadius * Math.sin(angle);
                    const iconY = 80 - outerEdgeRadius * Math.cos(angle);
                    const iconName = category?.iconName ?? parent?.iconName;
                    const emoji = category?.emojiIconName ?? parent?.emojiIconName ?? "✨";
                    const Icon = getIcon(iconName);
                    const iconR = isSelected ? 16 : 14;
                    const iconInnerSize = isSelected ? 20 : 18;

                    floatingIcons.push(
                      <g
                        key={`icon-${catPk}`}
                        className="cursor-pointer transition-all duration-300"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCategoryPk(selectedCategoryPk === catPk ? null : catPk);
                        }}
                      >
                        {isSelected ? (
                          <g>
                            <rect x={iconX - 24} y={iconY - 14} width="48" height="28" rx="14" className="fill-white dark:fill-[#1C1C1E]" filter="drop-shadow(0px 2px 4px rgba(0,0,0,0.12))" />
                            <text x={iconX} y={iconY + 1} fontSize="13" fontWeight="bold" textAnchor="middle" dominantBaseline="central" className="text-label" fill="currentColor">
                              {Math.round(share * 100)}%
                            </text>
                          </g>
                        ) : (
                          <>
                            <circle cx={iconX} cy={iconY} r={iconR} className="fill-bg-secondary dark:fill-bg-elevated" stroke={color} strokeWidth={isSelected ? "3.5" : "2.5"} />
                            {Icon ? (
                              <svg x={iconX - iconInnerSize / 2} y={iconY - iconInnerSize / 2} width={iconInnerSize} height={iconInnerSize} className="overflow-visible" style={{ color }}>
                                <Icon size={iconInnerSize} weight="fill" />
                              </svg>
                            ) : (
                              <text x={iconX} y={iconY} fontSize={isSelected ? "18" : "16"} textAnchor="middle" dominantBaseline="central" fill={color}>
                                {emoji}
                              </text>
                            )}
                          </>
                        )}
                      </g>,
                    );
                  }

                  offset += dash;
                });

                const selectedCategory = selectedCategoryPk ? byPk.get(selectedCategoryPk) : null;
                const selectedData = selectedCategoryPk ? activeBreakdown.get(selectedCategoryPk) : null;
                const selectedPercent = selectedData ? Math.round((selectedData.sum / activeTotal) * 100) : 0;

                return (
                  <>
                    <svg viewBox="0 0 160 160" className="h-[220px] w-[220px] shrink-0 overflow-visible">
                      <g transform="rotate(-90 80 80)">
                        {svgElements}
                        {selectedSvgElements}
                      </g>
                      {floatingIcons}
                    </svg>
                  </>
                );
              })()}
            </div>
          ) : (
            <p className="py-6 text-center text-caption text-label-secondary/50">
              No {doughnutTab} data recorded for this account.
            </p>
          )}

          <div className="pt-2">
            <div className="w-full flex-1 space-y-1">
              {selectedCategoryPk ? (
                <div 
                  className="w-full max-w-sm mx-auto rounded-3xl bg-bg-secondary dark:bg-white/[0.04] p-4 flex flex-col gap-4 shadow-sm border border-separator/20 relative mt-2 cursor-default"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryPk(null)}
                    className="absolute -top-3 -left-3 flex h-7 w-7 items-center justify-center rounded-full bg-bg-primary text-label hover:scale-105 transition-transform shadow border border-separator/10 z-10"
                  >
                    <X size={14} weight="bold" />
                  </button>
                  
                  {(() => {
                    const catPk = selectedCategoryPk;
                    const item = activeBreakdown.get(catPk) ?? { sum: 0, count: 0 };
                    const category = byPk.get(catPk);
                    const parent = category?.mainCategoryPk ? byPk.get(category.mainCategoryPk) : null;
                    const catName = category?.name ?? "Uncategorised";
                    const catColor = category?.colour ?? parent?.colour ?? (doughnutTab === "outgoing" ? "#E91E63" : "#4CAF50");
                    const percent = Math.round((item.sum / activeTotal) * 100);

                    const categorySubs = (subsByParent.get(catPk) ?? []).map((sub) => {
                      const subTransactions = walletTransactions.filter(
                        (t) => (t.categoryFk === sub.categoryPk || t.subCategoryFk === sub.categoryPk) && (doughnutTab === "outgoing" ? !t.income : t.income),
                      );
                      const subSum = subTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
                      return { sub, subSum, count: subTransactions.length };
                    }).filter((s) => s.subSum > 0);

                    const isSubExpanded = expandedSubcategories.has(catPk);

                    return (
                      <>
                        <div className="flex items-center gap-4">
                          <IconBadge iconName={category?.iconName} colour={catColor} size={44} fallback={catName} />
                          <div className="flex-1 min-w-0">
                            <h4 className="text-footnote font-semibold text-label truncate">{catName}</h4>
                            <p className="text-caption2 text-label-secondary/70">{percent}% of {doughnutTab}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <Amount value={doughnutTab === "outgoing" ? -item.sum : item.sum} colour showSign={false} className="text-footnote font-bold" />
                              <p className="text-caption2 text-label-secondary/70">{item.count} {item.count === 1 ? "transaction" : "transactions"}</p>
                            </div>
                            {categorySubs.length > 0 ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedSubcategories((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(catPk)) next.delete(catPk);
                                    else next.add(catPk);
                                    return next;
                                  });
                                }}
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-fill/10 text-label-secondary hover:bg-fill/20 hover:text-label transition-all duration-200 active:scale-90 dark:bg-white/10 dark:text-white/80 ml-2"
                                title={isSubExpanded ? "Hide subcategories" : "Show subcategories"}
                              >
                                <div className={cn("transition-transform duration-300 ease-out", isSubExpanded ? "rotate-180" : "rotate-0")}>
                                  <CaretDown size={14} weight="bold" />
                                </div>
                              </button>
                            ) : null}
                          </div>
                        </div>

                        <AnimatePresence initial={false}>
                          {categorySubs.length > 0 && isSubExpanded ? (
                            <motion.div
                              key={`subs-${catPk}`}
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ type: "spring", stiffness: 350, damping: 28 }}
                              className="overflow-hidden space-y-1.5"
                            >
                              <div className="pt-2 border-t border-separator/10 space-y-1.5">
                                {categorySubs.map(({ sub, subSum }) => {
                                  const subPct = Math.round((subSum / item.sum) * 100);
                                  return (
                                    <div key={sub.categoryPk} className="flex items-center justify-between text-caption bg-fill/5 p-2 rounded-lg dark:bg-white/[0.04]">
                                      <span className="font-medium text-label-secondary dark:text-white/70 truncate flex items-center gap-1.5">
                                        <span>{sub.emojiIconName ?? "▫️"}</span> {sub.name}
                                        <span className="text-[10px] text-label-secondary/50 dark:text-white/40">({subPct}% of {catName})</span>
                                      </span>
                                      <Amount
                                        value={doughnutTab === "outgoing" ? -subSum : subSum}
                                        colour
                                        showSign={doughnutTab === "incoming"}
                                        className="shrink-0 text-caption font-semibold"
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                      </>
                    );
                  })()}
                </div>
              ) : null}
            </div>

            {/* Standard List View when nothing is selected */}
            {!selectedCategoryPk ? (
              <div className="divide-y divide-border/20 mt-2">
                {(doughnutExpanded
                  ? sortedCategoryEntries
                  : sortedCategoryEntries.slice(0, 2)
                ).map(([catPk, item]) => {
                  const category = byPk.get(catPk);
                  const parent = category?.mainCategoryPk ? byPk.get(category.mainCategoryPk) : null;
                  const catName = category?.name ?? "Uncategorised";
                  const catColor = category?.colour ?? parent?.colour ?? (doughnutTab === "outgoing" ? "#E91E63" : "#4CAF50");
                  const percent = Math.round((item.sum / activeTotal) * 100);

                  const categorySubs = (subsByParent.get(catPk) ?? []).map((sub) => {
                    const subTransactions = walletTransactions.filter(
                      (t) => (t.categoryFk === sub.categoryPk || t.subCategoryFk === sub.categoryPk) && (doughnutTab === "outgoing" ? !t.income : t.income),
                    );
                    const subSum = subTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
                    return { sub, subSum, count: subTransactions.length };
                  }).filter((s) => s.subSum > 0);

                  const isSubExpanded = expandedSubcategories.has(catPk);

                  return (
                    <div key={`cat-item-${catPk}`} className="py-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <IconBadge iconName={category?.iconName} colour={catColor} size={40} fallback={catName} />
                          <div className="min-w-0">
                            <p className="truncate text-body font-bold text-label">{catName}</p>
                            <p className="text-caption text-label-secondary/70">
                              {percent}% of {doughnutTab} • {item.count} {item.count === 1 ? "transaction" : "transactions"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={cn("text-base font-bold tabular-nums", doughnutTab === "outgoing" ? "text-red" : "text-green")}>
                            {doughnutTab === "outgoing" ? "-" : "+"}₹{item.sum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </span>
                          {categorySubs.length > 0 ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedSubcategories((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(catPk)) next.delete(catPk);
                                  else next.add(catPk);
                                  return next;
                                });
                              }}
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-fill/10 text-label-secondary hover:bg-fill/20 hover:text-label transition-all duration-200 active:scale-90 dark:bg-white/10 dark:text-white/80"
                              title={isSubExpanded ? "Hide subcategories" : "Show subcategories"}
                            >
                              <div className={cn("transition-transform duration-300 ease-out", isSubExpanded ? "rotate-180" : "rotate-0")}>
                                <CaretDown size={14} weight="bold" />
                              </div>
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <AnimatePresence initial={false}>
                        {categorySubs.length > 0 && isSubExpanded ? (
                          <motion.div
                            key={`account-subs-${catPk}`}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ type: "spring", stiffness: 350, damping: 28 }}
                            className="overflow-hidden pl-12 space-y-1.5 pt-1"
                          >
                            {categorySubs.map(({ sub, subSum, count }) => {
                              const subPct = Math.round((subSum / item.sum) * 100);
                              return (
                                <div key={sub.categoryPk} className="flex items-center justify-between text-caption bg-fill/5 p-2 rounded-lg">
                                  <span className="font-medium text-label-secondary truncate flex items-center gap-1.5">
                                    <span>{sub.emojiIconName ?? "▫️"}</span> {sub.name}
                                    <span className="text-[10px] text-label-secondary/50">({subPct}% of category)</span>
                                  </span>
                                  <span className="font-semibold text-label-secondary tabular-nums">
                                    -₹{subSum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                              );
                            })}
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/*
            Card bill payments sit below the divider, outside the percentages.
            The spending they settle is already counted on the card's own
            account, so folding them in here would bill it twice — but the cash
            did leave this account, so it is reported rather than hidden.
            Included inside doughnutExpanded so it hides when collapsed.
          */}
          {doughnutTab === "outgoing" &&
          doughnutExpanded &&
          (cardPayments.count > 0 || lentOut.count > 0 || savings.count > 0) ? (
            <div className="mt-2 space-y-1.5 border-t border-border/20 pt-2">
              {cardPayments.count > 0 ? (
                <NotSpendingRow
                  label="Card Payments"
                  count={cardPayments.count}
                  total={cardPayments.total}
                  currency={wallet?.currency}
                />
              ) : null}
              {lentOut.count > 0 ? (
                <NotSpendingRow
                  label="Lent"
                  count={lentOut.count}
                  total={lentOut.total}
                  currency={wallet?.currency}
                />
              ) : null}
              {savings.count > 0 ? (
                <NotSpendingRow
                  label="Savings (policies)"
                  count={savings.count}
                  total={savings.total}
                  currency={wallet?.currency}
                />
              ) : null}
            </div>
          ) : null}

          {/* View More / Show Less Toggle Button (Bottom of card) */}
          {!selectedCategoryPk && sortedCategoryEntries.length > 2 ? (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setDoughnutExpanded(!doughnutExpanded)}
                className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl text-subhead font-semibold transition-all select-none border bg-fill/10 text-label border-separator/40 hover:bg-fill/20 dark:bg-white/[0.08] dark:text-white dark:border-white/10 dark:hover:bg-white/[0.14] active:scale-[0.99] shadow-sm"
              >
                <span>{doughnutExpanded ? "Show less" : `View more (${sortedCategoryEntries.length - 2} more)`}</span>
                {doughnutExpanded ? <CaretUp size={16} weight="bold" /> : <CaretDown size={16} weight="bold" />}
              </button>
            </div>
          ) : null}
        </div>

        {/* 8. Statement Card (if credit card) */}
        {card && card.remainingStatementBalance > 0 ? (
          <div className="rounded-[20px] bg-bg-secondary p-4 shadow-sm flex items-center justify-between gap-4">
            <div>
              <p className="text-caption2 uppercase tracking-wide text-label-secondary/50">Statement Balance</p>
              <Amount value={card.remainingStatementBalance} className="text-title3 font-semibold text-red" />
              {card.nextDueDate ? (
                <p className="text-caption text-label-secondary mt-0.5">
                  Due {new Date(card.nextDueDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </p>
              ) : null}
            </div>
            <button
              onClick={() => {
                setEditing(null);
                setModalDefaultTab("transfer");
                setModalDefaults({
                  amount: card.remainingStatementBalance,
                  toWalletFk: walletPk,
                  name: `Statement Payment`,
                } as any);
                setModalOpen(true);
              }}
              className="rounded-[10px] bg-accent px-4 py-2 text-subhead font-semibold text-accent-fg transition-transform active:scale-[0.98] whitespace-nowrap"
            >
              Pay Bill
            </button>
          </div>
        ) : null}

        {/* 9. Search & Transaction History List */}
        <div className="space-y-4 pt-2">
          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <SearchField value={query} onChange={setQuery} placeholder="Search account transactions..." />
            </div>
            <button
              onClick={() => setImportOpen(true)}
              className="flex h-11 items-center gap-2 rounded-[14px] bg-fill/5 px-4 text-sm font-semibold text-label transition-colors hover:bg-fill/10 active:scale-[0.98] shrink-0 border border-border/40"
            >
              <UploadSimple size={16} />
              <span className="hidden sm:inline">Upload</span>
            </button>
          </div>

          <SegmentedTabs
            value={direction}
            onChange={setDirection}
            options={[
              { value: "all", label: "All" },
              { value: "expense", label: "Expense" },
              { value: "income", label: "Income" },
            ]}
          />

          {filtered.length === 0 ? (
            <EmptyState
              icon={ArrowsLeftRight}
              title="No transactions found"
              description={
                query
                  ? "Try a different search query."
                  : "No transactions recorded for this account yet."
              }
            />
          ) : cycleGroupsWithUnpaid ? (
            <div className="space-y-6">
              {cycleGroupsWithUnpaid.map((group) => (
                <div key={group.key} className="relative">
                  <div className="mb-2 flex items-center justify-between rounded-md bg-fill/5 px-3 py-2">
                    <div>
                      <h3 className="text-subhead font-semibold text-label">
                        {group.cycleStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} - {group.cycleEnd.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </h3>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-label-secondary/50">Spend</p>
                        <Amount value={group.spend} className="text-footnote font-medium text-label" />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-label-secondary/50">Payments</p>
                        <Amount value={group.payments} className="text-footnote font-medium text-green" />
                      </div>
                      {group.unpaidAmount !== undefined && group.unpaidAmount > 5 ? (
                        <button
                          onClick={() => {
                            setEditing(null);
                            setModalDefaultTab("transfer");
                            setModalDefaults({
                              amount: group.unpaidAmount,
                              toWalletFk: walletPk,
                              name: `Card Payment`,
                            } as any);
                            setModalOpen(true);
                          }}
                          className="ml-1 rounded-[8px] bg-accent/15 px-2.5 py-1 text-[12px] font-semibold text-accent transition-colors hover:bg-accent/25 active:scale-95"
                        >
                          Pay
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <TransactionGroup>
                    {group.items.map((t) => (
                      <TransactionRow key={t.transactionPk} transaction={t} onEdit={openEdit} />
                    ))}
                  </TransactionGroup>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {dayGroups.map(([day, items]) => (
                <div key={day}>
                  <div className="mb-1.5 flex items-baseline justify-between px-1">
                    <h3 className="text-footnote font-semibold text-label-secondary">
                      {formatDayHeading(day)}
                    </h3>
                    <div className="flex items-center gap-3">
                      {dailyBalances.has(day) ? (
                        <span className="text-caption text-label-secondary/70">
                          Bal: <Amount value={dailyBalances.get(day)!} className="font-medium" />
                        </span>
                      ) : null}
                      <Amount
                        value={items.reduce((sum, t) => sum + (t.paid ? t.amount : 0), 0)}
                        colour
                        showSign
                        className="text-caption min-w-[70px] text-right"
                      />
                    </div>
                  </div>
                  <TransactionGroup>
                    {items.map((t) => (
                      <TransactionRow key={t.transactionPk} transaction={t} onEdit={openEdit} />
                    ))}
                  </TransactionGroup>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Accent-coloured FAB */}
      <button
        type="button"
        onClick={() => {
          setEditing(null);
          setModalOpen(true);
        }}
        aria-label="Add transaction"
        className="fixed bottom-[80px] right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-pill transition-transform active:scale-95 lg:bottom-8 lg:right-8"
        style={{ backgroundColor: accent }}
      >
        <Plus size={26} />
      </button>

      <TransactionModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
          setModalDefaults(undefined);
          setModalDefaultTab(undefined);
        }}
        editing={editing}
        defaults={modalDefaults ?? { walletFk: walletPk }}
        defaultTab={modalDefaultTab}
      />

      {importOpen ? (
        <ImportPreviewModal
          open
          onClose={() => setImportOpen(false)}
          defaultWalletFk={walletPk}
        />
      ) : null}

      <MobileSidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}

/**
 * A total that left the account without being spending.
 *
 * Card bill settlements and money lent out both move real cash, but neither is
 * consumption — the first was already counted when the card was used, the
 * second is expected back. They sit below the breakdown, outside the
 * percentages, so the figures stay honest without the money disappearing.
 */
function NotSpendingRow({
  label,
  count,
  total,
  currency,
}: {
  label: string;
  count: number;
  total: number;
  currency: string | null | undefined;
}) {
  const { settings  } = useBudget(useShallow((s) => ({ settings: s.settings })));
  return (
    <div className="flex items-center justify-between gap-3 rounded-[14px] border border-separator/40 bg-fill/5 px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-subhead font-semibold text-label-secondary">{label}</p>
        <p className="text-caption text-label-secondary/60">
          Not spending • {count} {count === 1 ? "transaction" : "transactions"}
        </p>
      </div>
      <span className="shrink-0 text-subhead font-semibold tabular-nums text-label-secondary">
        {formatCurrencyAmount(-total, currency, {
          decimals: settings.showDecimals ? undefined : 0,
          obfuscate: settings.hideAmounts,
        })}
      </span>
    </div>
  );
}

function TimeRangeSelector({ value, onChange, accent }: { value: TimeRange; onChange: (v: TimeRange) => void; accent?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const options: Record<TimeRange, string> = {
    all: "All Time",
    month: "This Month",
    year: "This Year",
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors text-[11px] font-semibold border"
        style={{
          backgroundColor: accent ? `${accent}15` : 'var(--fill-5)',
          color: accent || 'var(--label-secondary)',
          borderColor: accent ? `${accent}30` : 'var(--border-20)'
        }}
      >
        <Clock size={12} />
        <span>{options[value]}</span>
        <CaretDown size={10} className="opacity-70" />
      </button>
      
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-32 rounded-[12px] bg-bg shadow-xl border border-border/40 py-1 z-50 overflow-hidden">
          {(Object.entries(options) as [TimeRange, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => {
                onChange(k);
                setOpen(false);
              }}
              className={cn(
                "w-full text-left px-3 py-1.5 text-[11px] transition-colors hover:bg-fill/10",
                value === k ? "font-semibold" : "text-label-secondary font-medium"
              )}
              style={value === k && accent ? { color: accent, backgroundColor: `${accent}10` } : (value === k ? { color: 'var(--label)', backgroundColor: 'var(--fill-5)' } : {})}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
