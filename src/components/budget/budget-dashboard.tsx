"use client";
import { useShallow } from "zustand/react/shallow";

/**
 * The budget home screen.
 *
 * Cashew lets each widget be reordered and hidden; the same widgets are here,
 * driven by the environment's own settings so the stock app's home screen is
 * unaffected.
 *
 * Layout: a full-width hero (net worth, accounts, this month), then the
 * remaining widgets in a two-column masonry from `xl` up. A single stacked
 * column is right on a phone but leaves a desktop looking like a narrow strip
 * in a field of whitespace, which is what the widths here are correcting.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  CaretRight,
  CaretUp,
  CaretDown,
  Faders,
  Eye,
  EyeClosed,
  Minus,
  Plus,
  Equals,
  TrendUp,
  CreditCard,
  ArrowsLeftRight,
  Target,
  HandCoins,
  Calendar,
  ShieldCheck,
  ListDashes,
  ChartPie,
  ChartLine,
  SquaresFour,
} from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { getNetWorth, getCumulativeTotals } from "@/lib/budget/calculations";
import { useBudget, usePolicySavings } from "./budget-provider";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AddFab, Amount, Card, Section, Sheet, Toggle } from "./budget-ui";
import { IconBadge } from "./icon-picker";
import { AccountsSummary } from "./accounts-view";
import { PinnedBudgets } from "./budgets-view";
import { PinnedObjectives } from "./objectives-view";
import { RecentTransactions } from "./transaction-list-view";
import { CreditDebtWidget, UpcomingWidget } from "./upcoming-view";
import { PoliciesWidget } from "./policies-view";
import { SpendingSummaryWidget, CategoryBreakdownWidget, CategoryStackedBarWidget, LineGraph, Heatmap } from "./analytics-view";
import { TransactionModal } from "./transaction-modal";
import { type BudgetSettings } from "@/lib/budget/defaults";

const WIDGET_META: { id: string; label: string; settingKey: keyof BudgetSettings; icon: any }[] = [
  { id: "netWorth", label: "Net Worth", settingKey: "showNetWorth", icon: TrendUp },
  { id: "walletSwitcher", label: "Accounts", settingKey: "showWalletSwitcher", icon: CreditCard },
  { id: "allSpendingSummary", label: "Income & Expenses", settingKey: "showAllSpendingSummary", icon: ArrowsLeftRight },
  { id: "budgets", label: "Budgets", settingKey: "showPinnedBudgets", icon: ChartPie },
  { id: "objectives", label: "Goals", settingKey: "showObjectives", icon: Target },
  { id: "creditDebt", label: "Lent & Borrowed", settingKey: "showCreditDebt", icon: HandCoins },
  { id: "upcoming", label: "Overdue & Upcoming", settingKey: "showUpcomingTransactions", icon: Calendar },
  { id: "policies", label: "Policies", settingKey: "showPolicies", icon: ShieldCheck },
  { id: "recentTransactions", label: "Transactions List", settingKey: "showRecentTransactions", icon: ListDashes },
  { id: "transactions", label: "Transactions List", settingKey: "showRecentTransactions", icon: ListDashes },
  { id: "pieChart", label: "Pie Chart", settingKey: "showPieChart", icon: ChartPie },
  { id: "lineGraph", label: "Spending Graph", settingKey: "showLineGraph", icon: ChartLine },
  { id: "heatmap", label: "Heatmap", settingKey: "showHeatmap", icon: SquaresFour },
];

const DEFAULT_ORDER = [
  "netWorth",
  "walletSwitcher",
  "allSpendingSummary",
  "creditDebt",
  "upcoming",
  "policies",
  "recentTransactions",
  "pieChart",
  "lineGraph",
  "heatmap",
];

export function BudgetDashboard() {
  const { transactions, allWallets, settings, loading, updateSettings  } = useBudget(useShallow((s) => ({ transactions: s.transactions, allWallets: s.allWallets, settings: s.settings, loading: s.loading, updateSettings: s.updateSettings })));
  const [addOpen, setAddOpen] = useState(false);
  const [netWorthSettingsOpen, setNetWorthSettingsOpen] = useState(false);

  const savings = usePolicySavings();
  const netWorth = useMemo(
    () => getNetWorth(allWallets, transactions, savings.netWorthContribution),
    [allWallets, transactions, savings.netWorthContribution],
  );

  const allTimeStart = useMemo(() => {
    if (!transactions || transactions.length === 0) return new Date();
    let minTime = Date.now();
    for (const t of transactions) {
      const time = new Date(t.dateCreated).getTime();
      if (time < minTime) minTime = time;
    }
    const d = new Date(minTime);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }, [transactions]);

  const rawOrder = settings.homePageOrder && settings.homePageOrder.length > 0 ? settings.homePageOrder : DEFAULT_ORDER;

  const effectiveOrder = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const id of rawOrder) {
      const meta = WIDGET_META.find((m) => m.id === id);
      if (meta && !seen.has(meta.settingKey)) {
        seen.add(meta.settingKey);
        list.push(meta.id);
      }
    }
    for (const item of DEFAULT_ORDER) {
      const meta = WIDGET_META.find((m) => m.id === item);
      if (meta && !seen.has(meta.settingKey)) {
        seen.add(meta.settingKey);
        list.push(meta.id);
      }
    }
    return list;
  }, [rawOrder]);

  const netWorthTrendPoints = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return getCumulativeTotals(allWallets, transactions, start, end);
  }, [allWallets, transactions]);

  const sparklineData = useMemo(() => {
    if (netWorthTrendPoints.length < 2) return null;
    const vals = netWorthTrendPoints.map((p: { value: number }) => p.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const w = 300;
    const h = 70;
    const pointsStr = netWorthTrendPoints
      .map((p: { value: number }, i: number) => {
        const x = (i / (netWorthTrendPoints.length - 1)) * w;
        const y = h - ((p.value - min) / range) * (h - 15) - 8;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    return { pointsStr, w, h };
  }, [netWorthTrendPoints]);

  function moveWidget(index: number, dir: number) {
    const nextIndex = index + dir;
    if (nextIndex < 0 || nextIndex >= effectiveOrder.length) return;
    const newOrder = [...effectiveOrder];
    const temp = newOrder[index];
    newOrder[index] = newOrder[nextIndex];
    newOrder[nextIndex] = temp;
    updateSettings({ homePageOrder: newOrder });
  }

  if (loading) {
    return (
      <div className="grid gap-4 xl:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-card bg-bg-secondary" />
        ))}
      </div>
    );
  }

  const renderWidgetMap: Record<string, React.ReactNode> = {
    netWorth: settings.showNetWorth ? (
      <button
        key="netWorth"
        type="button"
        onClick={() => setNetWorthSettingsOpen(true)}
        className="text-left transition-transform active:scale-[0.98] outline-none rounded-[24px] focus-visible:ring-2 focus-visible:ring-accent w-full"
      >
        <Card className="relative overflow-hidden flex flex-col justify-center !py-7 text-center hover:bg-fill/5 transition-colors group">
          {/* Subtle Background Net Worth Sparkline Curve */}
          {sparklineData ? (
            <div className="absolute inset-0 pointer-events-none opacity-25 dark:opacity-20 transition-opacity group-hover:opacity-40">
              <svg
                viewBox={`0 0 ${sparklineData.w} ${sparklineData.h}`}
                className="h-full w-full overflow-visible"
                preserveAspectRatio="none"
              >
                <defs>
                  {/* Fine dot pattern (smaller dots r=0.45, 4.5px grid spacing) */}
                  <pattern id="dotGridPattern" x="0" y="0" width="4.5" height="4.5" patternUnits="userSpaceOnUse">
                    <circle cx="1.5" cy="1.5" r="0.45" fill="var(--accent, #007AFF)" opacity="0.85" />
                  </pattern>

                  {/* Vertical Fade Mask: 100% white at top near curve, fading to black at bottom */}
                  <linearGradient id="dotFadeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="white" stopOpacity="1" />
                    <stop offset="35%" stopColor="white" stopOpacity="0.75" />
                    <stop offset="70%" stopColor="white" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="white" stopOpacity="0.05" />
                  </linearGradient>

                  <mask id="sparklineMask">
                    {/* Trendline Area Polygon */}
                    <polygon
                      points={`0,${sparklineData.h} ${sparklineData.pointsStr} ${sparklineData.w},${sparklineData.h}`}
                      fill="url(#dotFadeGradient)"
                    />
                  </mask>

                  <linearGradient id="netWorthCardSparkGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent, #007AFF)" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="var(--accent, #007AFF)" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Dense Dotted Grid Area Fill with Top-to-Bottom Density Fade */}
                <rect
                  x="0"
                  y="0"
                  width={sparklineData.w}
                  height={sparklineData.h}
                  fill="url(#dotGridPattern)"
                  mask="url(#sparklineMask)"
                />
                {/* Subtle Gradient Area Background */}
                <polygon
                  points={`0,${sparklineData.h} ${sparklineData.pointsStr} ${sparklineData.w},${sparklineData.h}`}
                  fill="url(#netWorthCardSparkGrad)"
                />
                {/* Sparkline Curve */}
                <polyline
                  points={sparklineData.pointsStr}
                  fill="none"
                  stroke="var(--accent, #007AFF)"
                  strokeWidth="1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          ) : null}

          <div className="relative z-10">
            <p className="text-caption uppercase tracking-wider font-semibold text-label-secondary/60">Net worth</p>
            <Amount value={netWorth} className="text-largetitle font-bold" colour />
          </div>
        </Card>
      </button>
    ) : null,
    walletSwitcher: settings.showWalletSwitcher ? (
      <Section key="walletSwitcher" className="!mb-0">
        <AccountsSummary />
      </Section>
    ) : null,
    allSpendingSummary: settings.showAllSpendingSummary ? (
      <Section key="allSpendingSummary" className="!mb-0">
        <SpendingSummaryWidget />
      </Section>
    ) : null,
    budgets: settings.showPinnedBudgets ? (
      <Section key="budgets" className="!mb-0">
        <PinnedBudgets />
      </Section>
    ) : null,
    objectives: settings.showObjectives ? (
      <Section key="objectives" className="!mb-0">
        <PinnedObjectives />
      </Section>
    ) : null,
    creditDebt: settings.showCreditDebt ? (
      <Section key="creditDebt" className="!mb-0">
        <CreditDebtWidget />
      </Section>
    ) : null,
    upcoming: settings.showUpcomingTransactions ? (
      <Section key="upcoming" className="!mb-0">
        <UpcomingWidget />
      </Section>
    ) : null,
    policies: settings.showPolicies ? (
      <Section key="policies" className="!mb-0">
        <PoliciesWidget />
      </Section>
    ) : null,
    recentTransactions: (settings.showRecentTransactions ?? true) ? (
      <Section key="recentTransactions" title="Recent transactions" action={<SeeAll href="/budget/transactions" />} className="!mb-0">
        <RecentTransactions />
      </Section>
    ) : null,
    transactions: (settings.showRecentTransactions ?? true) ? (
      <Section key="transactions" title="Recent transactions" action={<SeeAll href="/budget/transactions" />} className="!mb-0">
        <RecentTransactions />
      </Section>
    ) : null,
    pieChart: (settings.showPieChart ?? true) ? (
      <div key="pieChart" className="space-y-6">
        <Section className="!mb-0">
          <CategoryBreakdownWidget />
        </Section>
        <Section className="!mb-0">
          <CategoryStackedBarWidget />
        </Section>
      </div>
    ) : null,
    lineGraph: settings.showLineGraph ? (
      <Section key="lineGraph" className="!mb-0">
        <Card>
          <LineGraph start={allTimeStart} end={new Date()} />
        </Card>
      </Section>
    ) : null,
    heatmap: settings.showHeatmap ? (
      <Section key="heatmap" className="!mb-0">
        <Card>
          <Heatmap start={allTimeStart} end={new Date()} />
        </Card>
      </Section>
    ) : null,
  };

  return (
    <>
      {/* Mobile View: Sequential list using custom homePageOrder */}
      <div className="flex flex-col gap-6 xl:hidden">
        {effectiveOrder.map((id, index) => {
          const content = renderWidgetMap[id];
          if (!content) return null;
          return (
            <motion.div
              key={id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: index * 0.05, ease: [0.25, 1, 0.5, 1] }}
            >
              {content}
            </motion.div>
          );
        })}
      </div>

      {/* Desktop View: Structured 2-column layout */}
      <div className="hidden xl:block">
        {/* Hero: Net worth & accounts summary */}
        <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(260px,340px)_1fr]">
          {settings.showNetWorth ? (
            <button 
              type="button" 
              onClick={() => setNetWorthSettingsOpen(true)}
              className="text-left transition-transform active:scale-[0.98] outline-none rounded-[24px] focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Card className="relative overflow-hidden flex h-full flex-col justify-center !py-7 text-center hover:bg-fill/5 transition-colors group">
                {/* Subtle Background Net Worth Sparkline Curve */}
                {sparklineData ? (
                  <div className="absolute inset-0 pointer-events-none opacity-25 dark:opacity-20 transition-opacity group-hover:opacity-40">
                    <svg
                      viewBox={`0 0 ${sparklineData.w} ${sparklineData.h}`}
                      className="h-full w-full overflow-visible"
                      preserveAspectRatio="none"
                    >
                      <defs>
                        <pattern id="dotGridDesktopPattern" x="0" y="0" width="4.5" height="4.5" patternUnits="userSpaceOnUse">
                          <circle cx="1.5" cy="1.5" r="0.45" fill="var(--accent, #007AFF)" opacity="0.85" />
                        </pattern>
                        <linearGradient id="dotFadeDesktopGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="white" stopOpacity="1" />
                          <stop offset="35%" stopColor="white" stopOpacity="0.75" />
                          <stop offset="70%" stopColor="white" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="white" stopOpacity="0.05" />
                        </linearGradient>
                        <mask id="sparklineDesktopMask">
                          <polygon
                            points={`0,${sparklineData.h} ${sparklineData.pointsStr} ${sparklineData.w},${sparklineData.h}`}
                            fill="url(#dotFadeDesktopGradient)"
                          />
                        </mask>
                        <linearGradient id="netWorthDesktopSparkGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--accent, #007AFF)" stopOpacity="0.12" />
                          <stop offset="100%" stopColor="var(--accent, #007AFF)" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      <rect
                        x="0"
                        y="0"
                        width={sparklineData.w}
                        height={sparklineData.h}
                        fill="url(#dotGridDesktopPattern)"
                        mask="url(#sparklineDesktopMask)"
                      />
                      <polygon
                        points={`0,${sparklineData.h} ${sparklineData.pointsStr} ${sparklineData.w},${sparklineData.h}`}
                        fill="url(#netWorthDesktopSparkGrad)"
                      />
                      <polyline
                        points={sparklineData.pointsStr}
                        fill="none"
                        stroke="var(--accent, #007AFF)"
                        strokeWidth="1"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                ) : null}

                <div className="relative z-10">
                  <p className="text-caption uppercase tracking-wider font-semibold text-label-secondary/60">
                    Net worth
                  </p>
                  <Amount value={netWorth} className="text-largetitle font-bold" colour />
                </div>
              </Card>
            </button>
          ) : null}

          <div className="min-w-0 space-y-4">
            {settings.showWalletSwitcher ? (
              <Section className="!mb-0">
                <AccountsSummary />
              </Section>
            ) : null}
            {settings.showAllSpendingSummary ? (
              <Section className="!mb-0">
                <SpendingSummaryWidget />
              </Section>
            ) : null}
          </div>
        </div>

        {/* Balanced 2-column grid on wide screens */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          {/* Left Column: Financial overview cards & Recent Transactions */}
          <div className="space-y-6 min-w-0">
            {settings.showCreditDebt ? (
              <Section className="!mb-0">
                <CreditDebtWidget />
              </Section>
            ) : null}

            {settings.showUpcomingTransactions ? (
              <Section className="!mb-0">
                <UpcomingWidget />
              </Section>
            ) : null}

            {settings.showPolicies ? (
              <Section className="!mb-0">
                <PoliciesWidget />
              </Section>
            ) : null}

            {settings.showRecentTransactions ?? true ? (
              <Section title="Recent transactions" action={<SeeAll href="/budget/transactions" />} className="!mb-0">
                <RecentTransactions />
              </Section>
            ) : null}
          </div>

          {/* Right Column: Analytics, Breakdown Widgets, Trend Graph & Heatmap */}
          <div className="space-y-6 min-w-0">
            {settings.showPieChart ?? true ? (
              <>
                <Section className="!mb-0">
                  <CategoryBreakdownWidget />
                </Section>
                <Section className="!mb-0">
                  <CategoryStackedBarWidget />
                </Section>
              </>
            ) : null}

            {settings.showLineGraph ? (
              <Section className="!mb-0">
                <Card>
                  <LineGraph start={allTimeStart} end={new Date()} />
                </Card>
              </Section>
            ) : null}

            {settings.showHeatmap ? (
              <Section className="!mb-0">
                <Card>
                  <Heatmap start={allTimeStart} end={new Date()} />
                </Card>
              </Section>
            ) : null}
          </div>
        </div>
      </div>

      <AddFab onClick={() => setAddOpen(true)} label="Add transaction" />
      <TransactionModal open={addOpen} onClose={() => setAddOpen(false)} />
      <NetWorthSettingsModal open={netWorthSettingsOpen} onClose={() => setNetWorthSettingsOpen(false)} />
    </>
  );
}

function SeeAll({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-1 rounded-full bg-accent/10 px-3 py-1 text-footnote font-semibold text-accent transition-all hover:bg-accent/20 active:scale-95"
    >
      <span>See all</span>
      <div className="transition-transform duration-300 ease-out group-hover:translate-x-0.5">
        <CaretRight size={12} weight="bold" />
      </div>
    </Link>
  );
}

/** Divides the Edit Home list into what is on the home screen and what is not. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 px-1 text-caption font-semibold uppercase tracking-wide text-label-secondary/50 first:mt-0">
      {children}
    </p>
  );
}

export function DashboardHeaderAction() {
  const { settings, updateSettings, wallets, exportDatabase, replaceDatabase, transactions  } = useBudget(useShallow((s) => ({ settings: s.settings, updateSettings: s.updateSettings, wallets: s.wallets, exportDatabase: s.exportDatabase, replaceDatabase: s.replaceDatabase, transactions: s.transactions })));
  const [open, setOpen] = useState(false);
  const [editTab, setEditTab] = useState<"widgets" | "accounts">("widgets");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [draggedAccountIndex, setDraggedAccountIndex] = useState<number | null>(null);

  const rawOrder = settings.homePageOrder && settings.homePageOrder.length > 0 ? settings.homePageOrder : DEFAULT_ORDER;

  const effectiveOrder = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const id of rawOrder) {
      const meta = WIDGET_META.find((m) => m.id === id);
      if (meta && !seen.has(meta.settingKey)) {
        seen.add(meta.settingKey);
        list.push(meta.id);
      }
    }
    for (const item of DEFAULT_ORDER) {
      const meta = WIDGET_META.find((m) => m.id === item);
      if (meta && !seen.has(meta.settingKey)) {
        seen.add(meta.settingKey);
        list.push(meta.id);
      }
    }
    return list;
  }, [rawOrder]);

  const sortedWallets = useMemo(
    () => [...wallets].sort((a, b) => a.order - b.order),
    [wallets],
  );

  const shownWallets = useMemo(
    () => sortedWallets.filter((w) => !(settings.homePageHidden ?? []).includes(w.walletPk)),
    [sortedWallets, settings]
  );
  
  const hiddenWallets = useMemo(
    () => sortedWallets.filter((w) => (settings.homePageHidden ?? []).includes(w.walletPk)),
    [sortedWallets, settings]
  );

  /**
   * The list split by whether each widget is actually on the home screen.
   *
   * Shown and hidden widgets used to sit in one undifferentiated list, so the
   * sheet gave no answer to the only question it exists to answer — what is on
   * my home screen. Position is meaningless for a hidden widget, so ordering
   * applies to the shown list alone and hidden ones trail behind it.
   */
  const isShown = (id: string) => {
    const meta = WIDGET_META.find((m) => m.id === id);
    return meta ? Boolean(settings[meta.settingKey] ?? true) : false;
  };

  const shownIds = useMemo(
    () => effectiveOrder.filter((id) => isShown(id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effectiveOrder, settings],
  );
  const hiddenIds = useMemo(
    () => effectiveOrder.filter((id) => !isShown(id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effectiveOrder, settings],
  );

  /** Indices below are positions within `shownIds`, not the combined list. */
  function reorderItems(fromIdx: number, toIdx: number) {
    if (
      fromIdx === toIdx ||
      fromIdx < 0 ||
      toIdx < 0 ||
      fromIdx >= shownIds.length ||
      toIdx >= shownIds.length
    )
      return;
    const newShown = [...shownIds];
    const [moved] = newShown.splice(fromIdx, 1);
    newShown.splice(toIdx, 0, moved);
    updateSettings({ homePageOrder: [...newShown, ...hiddenIds] });
  }

  function reorderAccounts(fromIdx: number, toIdx: number) {
    if (
      fromIdx === toIdx ||
      fromIdx < 0 ||
      toIdx < 0 ||
      fromIdx >= shownWallets.length ||
      toIdx >= shownWallets.length
    )
      return;

    const newShown = [...shownWallets];
    const [moved] = newShown.splice(fromIdx, 1);
    newShown.splice(toIdx, 0, moved);
    
    const allReordered = [...newShown, ...hiddenWallets];

    const db = exportDatabase();
    db.wallets = db.wallets.map((w) => {
      const idx = allReordered.findIndex((sw) => sw.walletPk === w.walletPk);
      if (idx >= 0) return { ...w, order: idx };
      return w;
    });
    replaceDatabase(db);
  }

  function moveWidget(index: number, dir: number) {
    reorderItems(index, index + dir);
  }

  function handleTouchMove(e: React.TouchEvent, currentIndex: number) {
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const row = target?.closest("[data-widget-index]");
    if (row) {
      const targetIdx = Number(row.getAttribute("data-widget-index"));
      if (!isNaN(targetIdx) && targetIdx !== currentIndex) {
        reorderItems(currentIndex, targetIdx);
      }
    }
  }

  function handleAccountTouchMove(e: React.TouchEvent, currentIndex: number) {
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const row = target?.closest("[data-account-index]");
    if (row) {
      const targetIdx = Number(row.getAttribute("data-account-index"));
      if (!isNaN(targetIdx) && targetIdx !== currentIndex) {
        reorderAccounts(currentIndex, targetIdx);
      }
    }
  }

  const HideIcon = settings.hideAmounts ? EyeClosed : Eye;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between py-3 px-3.5 rounded-xl bg-fill/5 hover:bg-fill/10 transition-colors text-subhead font-medium text-label group"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Faders size={18} weight="bold" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-label">Customize Home Layout</p>
            <p className="text-caption text-label-secondary/70">Reorder widgets and hide/show accounts</p>
          </div>
        </div>
        <span className="text-caption font-semibold text-accent group-hover:underline">Edit →</span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Edit Home">
        <div className="flex flex-col gap-2.5 p-4 pb-12">
          {/* Segmented Pill Switcher */}
          <div className="flex rounded-full bg-fill/10 p-1 mb-1 text-subhead font-semibold">
            <button
              type="button"
              onClick={() => setEditTab("widgets")}
              className={cn(
                "flex-1 py-2 text-center rounded-full transition-all",
                editTab === "widgets"
                  ? "bg-bg-elevated text-label shadow-sm font-semibold"
                  : "text-label-secondary/70 hover:text-label",
              )}
            >
              Widgets
            </button>
            <button
              type="button"
              onClick={() => setEditTab("accounts")}
              className={cn(
                "flex-1 py-2 text-center rounded-full transition-all",
                editTab === "accounts"
                  ? "bg-bg-elevated text-label shadow-sm font-semibold"
                  : "text-label-secondary/70 hover:text-label",
              )}
            >
              Accounts
            </button>
          </div>

          <p className="text-caption text-label-secondary/60 mb-2 px-1">
            {editTab === "widgets"
              ? "Drag the = handle or use ▲ ▼ buttons to reorder. Tap − to hide a widget."
              : "Drag the = handle or use ▲ ▼ buttons to reorder your accounts list."}
          </p>

          {editTab === "widgets" ? (
            <>
              <SectionLabel>On your home screen ({shownIds.length})</SectionLabel>

              {shownIds.length === 0 ? (
                <p className="rounded-[18px] border border-dashed border-border/40 px-3 py-6 text-center text-caption text-label-secondary/60">
                  Your home screen is empty. Add a widget from below.
                </p>
              ) : null}

              {shownIds.map((id, index) => {
                const meta = WIDGET_META.find((m) => m.id === id);
                if (!meta) return null;
                const WidgetIcon = meta.icon;
                return (
                  <div
                    key={id}
                    data-widget-index={index}
                    draggable
                    onDragStart={() => setDraggedIndex(index)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (draggedIndex !== null && draggedIndex !== index) {
                        reorderItems(draggedIndex, index);
                        setDraggedIndex(index);
                      }
                    }}
                    onDragEnd={() => setDraggedIndex(null)}
                    className={cn(
                      "flex items-center justify-between gap-3 p-3 rounded-[18px] bg-fill/5 hover:bg-fill/10 transition-all border border-border/20 select-none",
                      draggedIndex === index && "opacity-40 scale-[0.98] border-accent/50",
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-fill/10 text-label">
                        <WidgetIcon size={18} />
                      </div>
                      <span className="text-subhead font-semibold text-label truncate">
                        {meta.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => moveWidget(index, -1)}
                          className="p-1 rounded text-label-secondary hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-20 transition-opacity"
                          title="Move Up"
                        >
                          <CaretUp size={16} />
                        </button>
                        <button
                          type="button"
                          disabled={index === shownIds.length - 1}
                          onClick={() => moveWidget(index, 1)}
                          className="p-1 rounded text-label-secondary hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-20 transition-opacity"
                          title="Move Down"
                        >
                          <CaretDown size={16} />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => updateSettings({ [meta.settingKey]: false })}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-red/15 text-red transition-transform hover:bg-red/25 active:scale-95"
                        title="Hide from home screen"
                      >
                        <Minus size={15} weight="bold" />
                      </button>

                      <div
                        onTouchMove={(e) => handleTouchMove(e, index)}
                        className="text-label-secondary/60 hover:text-label cursor-grab active:cursor-grabbing p-1.5 touch-none shrink-0"
                        title="Drag upward or downward to reorder"
                      >
                        <Equals size={18} weight="bold" />
                      </div>
                    </div>
                  </div>
                );
              })}

              {hiddenIds.length > 0 ? (
                <>
                  <SectionLabel>Hidden ({hiddenIds.length})</SectionLabel>
                  {hiddenIds.map((id) => {
                    const meta = WIDGET_META.find((m) => m.id === id);
                    if (!meta) return null;
                    const WidgetIcon = meta.icon;
                    return (
                      // No drag or arrows: position means nothing until it is shown.
                      <div
                        key={id}
                        className="flex items-center justify-between gap-3 rounded-[18px] border border-border/20 border-dashed bg-fill/[0.02] p-3 select-none"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3 opacity-45">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-fill/10 text-label">
                            <WidgetIcon size={18} />
                          </div>
                          <span className="truncate text-subhead font-semibold text-label">
                            {meta.label}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateSettings({ [meta.settingKey]: true })}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent transition-transform hover:bg-accent/25 active:scale-95"
                          title="Add to home screen"
                        >
                          <Plus size={15} weight="bold" />
                        </button>
                      </div>
                    );
                  })}
                </>
              ) : null}
            </>
          ) : (
            <>
              <SectionLabel>Shown on home screen ({shownWallets.length})</SectionLabel>
              {shownWallets.map((wallet, index) => {
                const accentColour = wallet.colour ?? "#8E8E93";
                return (
                  <div
                    key={wallet.walletPk}
                    data-account-index={index}
                    draggable
                    onDragStart={() => setDraggedAccountIndex(index)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (draggedAccountIndex !== null && draggedAccountIndex !== index) {
                        reorderAccounts(draggedAccountIndex, index);
                        setDraggedAccountIndex(index);
                      }
                    }}
                    onDragEnd={() => setDraggedAccountIndex(null)}
                    className={cn(
                      "flex items-center justify-between gap-3 p-3 rounded-[18px] bg-fill/5 hover:bg-fill/10 transition-all border border-border/20 select-none",
                      draggedAccountIndex === index && "opacity-40 scale-[0.98] border-accent/50",
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <IconBadge
                        iconName={wallet.iconName}
                        colour={accentColour}
                        size={32}
                        fallback={wallet.name}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-subhead font-semibold text-label truncate">
                          {wallet.name}
                        </p>
                        <p className="text-caption text-label-secondary/60 uppercase">
                          {wallet.currency}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      {/* Up / Down reorder buttons */}
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => reorderAccounts(index, index - 1)}
                          className="p-1 rounded text-label-secondary hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-20 transition-opacity"
                          title="Move Up"
                        >
                          <CaretUp size={16} />
                        </button>
                        <button
                          type="button"
                          disabled={index === shownWallets.length - 1}
                          onClick={() => reorderAccounts(index, index + 1)}
                          className="p-1 rounded text-label-secondary hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-20 transition-opacity"
                          title="Move Down"
                        >
                          <CaretDown size={16} />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const newHidden = [...(settings.homePageHidden ?? []), wallet.walletPk];
                          updateSettings({ homePageHidden: newHidden });
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-red/15 text-red transition-transform hover:bg-red/25 active:scale-95"
                        title="Hide from home screen"
                      >
                        <Minus size={15} weight="bold" />
                      </button>

                      {/* Touch & Mouse Drag handle (=) */}
                      <div
                        onTouchMove={(e) => handleAccountTouchMove(e, index)}
                        className="text-label-secondary/60 hover:text-label cursor-grab active:cursor-grabbing p-1.5 touch-none shrink-0"
                        title="Drag upward or downward to reorder account"
                      >
                        <Equals size={18} weight="bold" />
                      </div>
                    </div>
                  </div>
                );
              })}

              {hiddenWallets.length > 0 ? (
                <>
                  <SectionLabel>Hidden ({hiddenWallets.length})</SectionLabel>
                  {hiddenWallets.map((wallet) => {
                    const accentColour = wallet.colour ?? "#8E8E93";
                    return (
                      <div
                        key={wallet.walletPk}
                        className="flex items-center justify-between gap-3 rounded-[18px] border border-border/20 border-dashed bg-fill/[0.02] p-3 select-none"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1 opacity-45">
                          <IconBadge
                            iconName={wallet.iconName}
                            colour={accentColour}
                            size={32}
                            fallback={wallet.name}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-subhead font-semibold text-label truncate">
                              {wallet.name}
                            </p>
                            <p className="text-caption text-label-secondary/60 uppercase">
                              {wallet.currency}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const newHidden = (settings.homePageHidden ?? []).filter((id) => id !== wallet.walletPk);
                            updateSettings({ homePageHidden: newHidden });
                          }}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent transition-transform hover:bg-accent/25 active:scale-95"
                          title="Add to home screen"
                        >
                          <Plus size={15} weight="bold" />
                        </button>
                      </div>
                    );
                  })}
                </>
              ) : null}
              
              <SectionLabel>Virtual Accounts</SectionLabel>
              <div className="flex flex-col gap-1 rounded-[16px] bg-fill/5 p-2 border border-border/20">
                <Toggle
                  checked={settings.showSavingsCard ?? true}
                  onChange={(checked) => updateSettings({ showSavingsCard: checked })}
                  label="Show Savings Card"
                />
              </div>
            </>
          )}
        </div>
      </Sheet>
    </>
  );
}

export function NetWorthSettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { allWallets, upsertWallet, settings, updateSettings  } = useBudget(useShallow((s) => ({ allWallets: s.allWallets, upsertWallet: s.upsertWallet, settings: s.settings, updateSettings: s.updateSettings })));

  return (
    <Sheet open={open} onClose={onClose} title="Net Worth Settings">
      <div className="flex flex-col p-4 pb-12">
        <p className="mb-4 text-callout text-label-secondary">
          Select which accounts should be included in your total net worth.
        </p>
        <div className="flex flex-col gap-1 rounded-[16px] bg-fill/5 p-2">
          {allWallets.list.map((wallet) => (
            <Toggle
              key={wallet.walletPk}
              checked={!wallet.excludeFromNetWorth}
              onChange={(checked) =>
                upsertWallet({ ...wallet, excludeFromNetWorth: !checked })
              }
              label={wallet.name}
            />
          ))}
          <div className="my-1 border-t border-separator/20" />
          <Toggle
            checked={settings.includeSavingsInNetWorth ?? true}
            onChange={(checked) => updateSettings({ includeSavingsInNetWorth: checked })}
            label="Policy Savings"
          />
        </div>
      </div>
    </Sheet>
  );
}
