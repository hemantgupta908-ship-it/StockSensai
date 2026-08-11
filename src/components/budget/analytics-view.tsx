"use client";

/**
 * Spending visualisations: pie by category, cumulative line, and a calendar
 * heatmap. All are inline SVG so the budget environment adds no chart
 * dependency to the bundle.
 */

import { useMemo, useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChartPie as PieIcon, CaretDown, CaretUp, X } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import {
  dayKey,
  getCumulativeTotals,
  getDailyTotals,
  getCategoryTotals,
  getSpendingByCategory,
  getSpendingSummary,
} from "@/lib/budget/calculations";
import { getIcon } from "@/lib/budget/icons";
import { useBudget, useCategoryLookup } from "./budget-provider";
import { IconBadge } from "./icon-picker";
import { Amount, Card, CategoryDot, EmptyState, SegmentedTabs, Section } from "./budget-ui";

type Range = "month" | "3months" | "year";

function rangeStart(range: Range): Date {
  const now = new Date();
  if (range === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (range === "3months") return new Date(now.getFullYear(), now.getMonth() - 2, 1);
  return new Date(now.getFullYear(), 0, 1);
}

export function AnalyticsView() {
  const { allWallets, transactions, objectives, categories } = useBudget();
  const [range, setRange] = useState<Range>("month");
  const [direction, setDirection] = useState<"expense" | "income">("expense");

  const start = rangeStart(range);
  const end = new Date();

  const inRange = useMemo(
    () =>
      transactions.filter((t) => {
        const d = new Date(t.dateCreated).getTime();
        return d >= start.getTime() && d <= end.getTime();
      }),
    // `end` is "now" and would change every render; the range key is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, range],
  );

  const summary = useMemo(() => getSpendingSummary(allWallets, inRange, objectives), [allWallets, inRange, objectives]);
  const byCategory = useMemo(
    () => getSpendingByCategory(allWallets, inRange, { income: direction === "income" }, objectives),
    [allWallets, inRange, direction, objectives, categories],
  );

  return (
    <>
      <SegmentedTabs
        className="mb-4"
        value={range}
        onChange={setRange}
        options={[
          { value: "month", label: "This month" },
          { value: "3months", label: "3 months" },
          { value: "year", label: "This year" },
        ]}
      />

      <Card className="mb-5 !p-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-caption2 uppercase tracking-wide text-label-secondary/50">Income</p>
            <Amount value={summary.income} className="text-subhead font-semibold text-green" />
          </div>
          <div>
            <p className="text-caption2 uppercase tracking-wide text-label-secondary/50">Expense</p>
            <Amount value={summary.expense} className="text-subhead font-semibold text-red" />
          </div>
          <div>
            <p className="text-caption2 uppercase tracking-wide text-label-secondary/50">Net</p>
            <Amount value={summary.net} colour showSign className="text-subhead font-semibold" />
          </div>
        </div>
      </Card>

      <Section title="By category">
        <SegmentedTabs
          className="mb-3"
          value={direction}
          onChange={setDirection}
          options={[
            { value: "expense", label: "Expense" },
            { value: "income", label: "Income" },
          ]}
        />
        <CategoryBreakdown byCategory={byCategory} />
      </Section>

      <Section title="Cumulative total">
        <Card>
          <LineGraph start={start} end={end} />
        </Card>
      </Section>

      <Section title="Daily spending">
        <Card>
          <Heatmap start={start} end={end} />
        </Card>
      </Section>
    </>
  );
}

/** Donut plus ranked list — Cashew's category breakdown. */
export function CategoryBreakdown({ byCategory, title, hideLegend, noCard, layout = "row", large, reverse, counts, direction }: { byCategory: Map<string, number>; title?: string; hideLegend?: boolean; noCard?: boolean; layout?: "row" | "col"; large?: boolean; reverse?: boolean;
  /** Transactions behind each category. Supplying it switches the legend to the detailed rows used on the account screen. */
  counts?: Map<string, number>;
  /** Labels the share as "% of outgoing" / "% of incoming" and signs the amount. */
  direction?: "outgoing" | "incoming";
}) {
  const { byPk, subsByParent } = useCategoryLookup();
  const { transactions } = useBudget();
  const [selectedPk, setSelectedPk] = useState<string | null>(null);
  const [expandedSubcategories, setExpandedSubcategories] = useState<Set<string>>(new Set());

  const toggleSubcategories = (catPk: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedSubcategories((prev) => {
      const next = new Set(prev);
      if (next.has(catPk)) {
        next.delete(catPk);
      } else {
        next.add(catPk);
      }
      return next;
    });
  };
  const [expanded, setExpanded] = useState(false);
  const entries = [...byCategory.entries()];
  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  const displayedEntries = useMemo(() => {
    if (selectedPk) {
      return entries.filter(([pk]) => pk === selectedPk);
    }
    if (!expanded) {
      return entries.slice(0, 2);
    }
    return entries;
  }, [entries, selectedPk, expanded]);

  if (entries.length === 0 || total === 0) {
    return <EmptyState icon={PieIcon} title="Nothing to chart yet" />;
  }

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const svgElements: React.ReactNode[] = [];
  const selectedSvgElements: React.ReactNode[] = [];
  const floatingIcons: React.ReactNode[] = [];
  const selectedFloatingIcons: React.ReactNode[] = [];

  const selectedCategory = selectedPk ? byPk.get(selectedPk) : null;
  const selectedParent = selectedCategory?.mainCategoryPk ? byPk.get(selectedCategory.mainCategoryPk) : null;
  const selectedValue = selectedPk ? (byCategory.get(selectedPk) ?? 0) : 0;
  const selectedPercent = selectedPk && total > 0 ? Math.round((selectedValue / total) * 100) : 0;

  entries.forEach(([categoryPk, value], index) => {
    const category = byPk.get(categoryPk);
    const parent = category?.mainCategoryPk ? byPk.get(category.mainCategoryPk) : null;
    const share = value / total;
    const dash = share * circumference;
    const catName = category?.name ?? "Uncategorised";
    const color = category?.colour ?? parent?.colour ?? "#8E8E93";
    
    const isSelected = selectedPk === categoryPk;
    const isDimmed = selectedPk !== null && !isSelected;
    
    // Premium interaction: instead of translating (which causes geometric overlapping of stroke butt-caps),
    // we increase the stroke width of the selected slice so it 'pops' out radially.
    const strokeWidth = isSelected ? 40 : 32;
    const angle = ((offset + dash / 2) / circumference) * 2 * Math.PI;

    const circleNode = (
      <circle
        key={categoryPk}
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
          setSelectedPk(selectedPk === categoryPk ? null : categoryPk);
        }}
      >
        <title>{`${catName} — ${Math.round(share * 100)}% (${value.toFixed(2)})`}</title>
      </circle>
    );

    if (isSelected) {
      selectedSvgElements.push(circleNode);
    } else {
      svgElements.push(circleNode);
    }

    // Show icon if selected, or if nothing is selected show top 5
    const shouldShowIcon = selectedPk !== null ? isSelected : (index < 5 && share > 0.04);

    if (shouldShowIcon) {
      const outerEdgeRadius = isSelected ? 74 : 68;
      const iconX = 80 + outerEdgeRadius * Math.sin(angle);
      const iconY = 80 - outerEdgeRadius * Math.cos(angle);
      const iconName = category?.iconName ?? parent?.iconName;
      const emoji = category?.emojiIconName ?? parent?.emojiIconName ?? "✨";
      const Icon = getIcon(iconName);
      const iconR = isSelected ? 16 : 14;
      const iconInnerSize = isSelected ? 20 : 18;
      
      const iconNode = (
        <g 
          key={`icon-${categoryPk}`} 
          className="cursor-pointer transition-all duration-300"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedPk(selectedPk === categoryPk ? null : categoryPk);
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
        </g>
      );
      
      if (isSelected) {
        selectedFloatingIcons.push(iconNode);
      } else {
        floatingIcons.push(iconNode);
      }
    }
    offset += dash;
  });

  const Wrapper = noCard ? "div" : Card;

  return (
    <Wrapper className={noCard ? "flex flex-col flex-1" : undefined}>
      {title ? (
        <h3 className={cn("mb-4 text-footnote font-semibold uppercase tracking-wide text-label-secondary/60", noCard && "text-center")}>
          {title}
        </h3>
      ) : null}
      <div 
        className={cn("flex flex-1 items-center gap-6", hideLegend ? "justify-center" : (layout === "col" || selectedPk ? "flex-col" : "flex-col sm:flex-row"))}
        onClick={selectedPk ? () => setSelectedPk(null) : undefined}
      >
        {reverse && !hideLegend ? (
          <div className={cn("shrink-0", large ? "w-[200px]" : "w-full flex-1")}>
            {selectedPk ? (
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-caption2 font-semibold uppercase tracking-wider text-label-secondary/60">
                  Filtered Category
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedPk(null)}
                  className="text-caption2 font-semibold text-accent hover:underline"
                >
                  Show All
                </button>
              </div>
            ) : null}
            <ul className="space-y-3">
              {displayedEntries.map(([categoryPk, value]) => {
                const category = byPk.get(categoryPk);
                const parent = category?.mainCategoryPk ? byPk.get(category.mainCategoryPk) : null;
                const share = value / total;
                const isSelected = selectedPk === categoryPk;
                return (
                  <li
                    key={categoryPk}
                    onClick={() => setSelectedPk(isSelected ? null : categoryPk)}
                    className={cn(
                      "flex items-center cursor-pointer transition-colors p-1 rounded-lg hover:opacity-80 select-none",
                      large ? "gap-3" : "gap-3",
                      isSelected && "bg-accent/10"
                    )}
                  >
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: category?.colour ?? parent?.colour ?? "#8E8E93" }} />
                    <span className={cn("min-w-0 flex-1 truncate text-label", large ? "text-[12px]" : "text-footnote")}>
                      {parent ? <span className="opacity-60">{parent.name} • </span> : null}
                      {category?.name ?? "Uncategorised"}
                    </span>
                    <span className={cn("shrink-0 text-label-secondary/60 text-right w-8", large ? "text-[12px]" : "text-caption")}>
                      {Math.round(share * 100)}%
                    </span>
                    <Amount value={value} className={cn("shrink-0 font-medium text-right", large ? "text-[12px] w-16" : "text-footnote w-20")} />
                  </li>
                );
              })}
            </ul>
            {!selectedPk && entries.length > 2 ? (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="mt-3 flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl text-subhead font-semibold transition-all select-none border bg-fill/10 text-label border-separator/40 hover:bg-fill/20 dark:bg-white/[0.08] dark:text-white dark:border-white/10 dark:hover:bg-white/[0.14] active:scale-[0.99] shadow-sm"
              >
                <span>{expanded ? "Show less" : `View more (${entries.length - 2} more)`}</span>
                {expanded ? <CaretUp size={16} weight="bold" /> : <CaretDown size={16} weight="bold" />}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="relative flex flex-1 items-center justify-center py-2 w-full">
          <svg viewBox="0 0 160 160" className={cn("shrink-0 overflow-visible", large ? "h-[450px] w-[450px] max-h-[460px] max-w-full" : "h-[220px] w-[220px]")}>
            <g transform="rotate(-90 80 80)">
              {svgElements}
              {selectedSvgElements}
            </g>
            {floatingIcons}
            {selectedFloatingIcons}
          </svg>
        </div>

        {!reverse && !hideLegend && counts ? (
          <div className="w-full flex-1 space-y-1">
            {selectedPk ? (
              <div 
                className="w-full max-w-sm mx-auto rounded-3xl bg-bg-secondary dark:bg-white/[0.04] p-4 flex flex-col gap-4 shadow-sm border border-separator/20 relative mt-2 cursor-default"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => setSelectedPk(null)}
                  className="absolute -top-3 -left-3 flex h-7 w-7 items-center justify-center rounded-full bg-bg-primary text-label hover:scale-105 transition-transform shadow border border-separator/10 z-10"
                >
                  <X size={14} weight="bold" />
                </button>
                
                {(() => {
                  const category = byPk.get(selectedPk);
                  const parent = category?.mainCategoryPk ? byPk.get(category.mainCategoryPk) : null;
                  const value = byCategory.get(selectedPk) ?? 0;
                  const catName = category?.name ?? "Uncategorised";
                  const catColour = category?.colour ?? parent?.colour ?? "#8E8E93";
                  const percent = Math.round((value / total) * 100);
                  const count = counts.get(selectedPk) ?? 0;
                  const outgoing = direction !== "incoming";
                  
                  const categorySubs = (subsByParent.get(selectedPk) ?? []).map((sub) => {
                    const subTransactions = transactions.filter(
                      (t) => (t.categoryFk === sub.categoryPk || t.subCategoryFk === sub.categoryPk) && (outgoing ? !t.income : t.income),
                    );
                    const subSum = subTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
                    return { sub, subSum, count: subTransactions.length };
                  }).filter((s) => s.subSum > 0);

                  const isSubExpanded = expandedSubcategories.has(selectedPk);

                  return (
                    <>
                      <div className="flex items-center gap-4">
                        <IconBadge iconName={category?.iconName} colour={catColour} size={44} fallback={catName} />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-footnote font-semibold text-label truncate">{catName}</h4>
                          <p className="text-caption2 text-label-secondary/70">{percent}% of total</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <Amount value={outgoing ? -value : value} colour showSign={false} className="text-footnote font-bold" />
                            <p className="text-caption2 text-label-secondary/70">{count} {count === 1 ? "transaction" : "transactions"}</p>
                          </div>
                          {categorySubs.length > 0 ? (
                            <button
                              type="button"
                              onClick={(e) => toggleSubcategories(selectedPk, e)}
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
                            key={`subs-${selectedPk}`}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ type: "spring", stiffness: 350, damping: 28 }}
                            className="overflow-hidden space-y-1.5"
                          >
                            <div className="pt-2 border-t border-separator/10 space-y-1.5">
                              {categorySubs.map(({ sub, subSum }) => {
                                const subPct = value > 0 ? Math.round((subSum / value) * 100) : 0;
                                return (
                                  <div key={sub.categoryPk} className="flex items-center justify-between text-caption bg-fill/5 p-2 rounded-lg dark:bg-white/[0.04]">
                                    <span className="font-medium text-label-secondary dark:text-white/70 truncate flex items-center gap-1.5">
                                      <span>{sub.emojiIconName ?? "▫️"}</span> {sub.name}
                                      <span className="text-[10px] text-label-secondary/50 dark:text-white/40">({subPct}% of {catName})</span>
                                    </span>
                                    <Amount
                                      value={outgoing ? -subSum : subSum}
                                      colour
                                      showSign={!outgoing}
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
            {!selectedPk ? (
              <>
                {displayedEntries.map(([categoryPk, value]) => {
              const category = byPk.get(categoryPk);
              const parent = category?.mainCategoryPk ? byPk.get(category.mainCategoryPk) : null;
              const catName = category?.name ?? "Uncategorised";
              const catColour =
                category?.colour ?? parent?.colour ?? (direction === "incoming" ? "#4CAF50" : "#E91E63");
              const percent = Math.round((value / total) * 100);
              const count = counts.get(categoryPk) ?? 0;
              const outgoing = direction !== "incoming";
              const isSelected = selectedPk === categoryPk;

              // Subcategories belonging to this parent category with recorded transactions
              const categorySubs = (subsByParent.get(categoryPk) ?? []).map((sub) => {
                const subTransactions = transactions.filter(
                  (t) => (t.categoryFk === sub.categoryPk || t.subCategoryFk === sub.categoryPk) && (outgoing ? !t.income : t.income),
                );
                const subSum = subTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
                return { sub, subSum, count: subTransactions.length };
              }).filter((s) => s.subSum > 0);

              const isSubExpanded = expandedSubcategories.has(categoryPk);

              return (
                <div key={categoryPk} className="space-y-1.5">
                  <div
                    onClick={() => setSelectedPk(isSelected ? null : categoryPk)}
                    className={cn(
                      "flex items-center justify-between gap-3 py-2.5 px-2.5 cursor-pointer transition-all hover:bg-fill/[0.06] rounded-xl select-none border border-transparent",
                      isSelected
                        ? "bg-accent/15 hover:bg-accent/20 border-accent/30 shadow-sm"
                        : "dark:hover:bg-white/[0.05]"
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <IconBadge iconName={category?.iconName} colour={catColour} size={36} fallback={catName} />
                      <div className="min-w-0">
                        <p className="truncate text-subhead font-semibold text-label">{catName}</p>
                        <p className="text-caption text-label-secondary/70 dark:text-white/60">
                          {percent}% of {outgoing ? "outgoing" : "incoming"} • {count}{" "}
                          {count === 1 ? "transaction" : "transactions"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Amount
                        value={outgoing ? -value : value}
                        colour
                        showSign={!outgoing}
                        className="text-subhead font-bold"
                      />
                      {categorySubs.length > 0 ? (
                        <button
                          type="button"
                          onClick={(e) => toggleSubcategories(categoryPk, e)}
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

                  {/* Subcategories list underneath (Collapsible with smooth Framer Motion Accordion) */}
                  <AnimatePresence initial={false}>
                    {categorySubs.length > 0 && isSubExpanded ? (
                      <motion.div
                        key={`subs-${categoryPk}`}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ type: "spring", stiffness: 350, damping: 28 }}
                        className="overflow-hidden pl-11 space-y-1 pt-0.5 pb-1"
                      >
                        {categorySubs.map(({ sub, subSum }) => {
                          const subPct = value > 0 ? Math.round((subSum / value) * 100) : 0;
                          return (
                            <div key={sub.categoryPk} className="flex items-center justify-between text-caption bg-fill/5 p-2 rounded-lg dark:bg-white/[0.04]">
                              <span className="font-medium text-label-secondary dark:text-white/70 truncate flex items-center gap-1.5">
                                <span>{sub.emojiIconName ?? "▫️"}</span> {sub.name}
                                <span className="text-[10px] text-label-secondary/50 dark:text-white/40">({subPct}% of {catName})</span>
                              </span>
                              <Amount
                                value={outgoing ? -subSum : subSum}
                                colour
                                showSign={!outgoing}
                                className="shrink-0 text-caption font-semibold"
                              />
                            </div>
                          );
                        })}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              );
            })}
            {entries.length > 2 ? (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="mt-3 flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl text-subhead font-semibold transition-all select-none border bg-fill/10 text-label border-separator/40 hover:bg-fill/20 dark:bg-white/[0.08] dark:text-white dark:border-white/10 dark:hover:bg-white/[0.14] active:scale-[0.99] shadow-sm"
              >
                <span>{expanded ? "Show less" : `View more (${entries.length - 2} more)`}</span>
                {expanded ? <CaretUp size={16} weight="bold" /> : <CaretDown size={16} weight="bold" />}
              </button>
            ) : null}
            </>
          ) : null}
          </div>
        ) : !reverse && !hideLegend ? (
          <div className="w-full flex-1 space-y-3">
            {selectedPk ? (
              <div 
                className="w-full max-w-sm mx-auto rounded-3xl bg-bg-secondary dark:bg-white/[0.04] p-4 flex items-center gap-4 shadow-sm border border-separator/20 relative mt-2 cursor-default"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => setSelectedPk(null)}
                  className="absolute -top-3 -left-3 flex h-7 w-7 items-center justify-center rounded-full bg-bg-primary text-label hover:scale-105 transition-transform shadow border border-separator/10"
                >
                  <X size={14} weight="bold" />
                </button>
                
                {(() => {
                  const category = byPk.get(selectedPk);
                  const parent = category?.mainCategoryPk ? byPk.get(category.mainCategoryPk) : null;
                  const value = byCategory.get(selectedPk) ?? 0;
                  const catName = category?.name ?? "Uncategorised";
                  const catColour = category?.colour ?? parent?.colour ?? "#8E8E93";
                  const percent = Math.round((value / total) * 100);
                  const count = transactions.filter(t => t.categoryFk === selectedPk || t.subCategoryFk === selectedPk).length;
                  const outgoing = direction !== "incoming";

                  return (
                    <>
                      <IconBadge iconName={category?.iconName} colour={catColour} size={44} fallback={catName} />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-footnote font-semibold text-label truncate">{catName}</h4>
                        <p className="text-caption2 text-label-secondary/70">{percent}% of total</p>
                      </div>
                      <div className="text-right shrink-0">
                        <Amount value={outgoing ? -value : value} colour showSign={false} className="text-footnote font-bold" />
                        <p className="text-caption2 text-label-secondary/70">{count} {count === 1 ? "transaction" : "transactions"}</p>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : null}
            {!selectedPk ? (
              <ul className="space-y-3">
                {displayedEntries.map(([categoryPk, value]) => {
                  const category = byPk.get(categoryPk);
                  const parent = category?.mainCategoryPk ? byPk.get(category.mainCategoryPk) : null;
                  const share = value / total;
                  const isSelected = selectedPk === categoryPk;
                  return (
                    <li
                      key={categoryPk}
                      onClick={() => setSelectedPk(isSelected ? null : categoryPk)}
                      className={cn(
                        "flex items-center gap-3 cursor-pointer transition-colors hover:opacity-80 p-1 rounded-lg select-none",
                        isSelected && "bg-accent/10"
                      )}
                    >
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: category?.colour ?? parent?.colour ?? "#8E8E93" }} />
                      <span className="min-w-0 flex-1 truncate text-label text-footnote font-medium">
                        {parent ? <span className="opacity-60">{parent.name} • </span> : null}
                        {category?.name ?? "Uncategorised"}
                      </span>
                      <span className="shrink-0 text-caption text-label-secondary/60 w-10 text-right">
                        {Math.round(share * 100)}%
                      </span>
                      <Amount value={value} className="shrink-0 font-medium w-20 text-right text-footnote" />
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {!selectedPk && entries.length > 2 ? (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="mt-3 flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl text-subhead font-semibold transition-all select-none border bg-fill/10 text-label border-separator/40 hover:bg-fill/20 dark:bg-white/[0.08] dark:text-white dark:border-white/10 dark:hover:bg-white/[0.14] active:scale-[0.99] shadow-sm"
              >
                <span>{expanded ? "Show less" : `View more (${entries.length - 2} more)`}</span>
                {expanded ? <CaretUp size={16} weight="bold" /> : <CaretDown size={16} weight="bold" />}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Wrapper>
  );
}

function getSmoothPath(points: { x: number; y: number }[], tension = 0.15): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  if (points.length === 2) return `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)},${points[1].y.toFixed(1)}`;

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

/** Running balance across the range. */
export function LineGraph({ start, end }: { start: Date; end: Date }) {
  const { transactions, allWallets } = useBudget();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [transactions.length]);

  const rawPoints = useMemo(
    () => getCumulativeTotals(allWallets, transactions, start, end),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allWallets, transactions, start.getTime()],
  );

  const points = useMemo(() => {
    if (rawPoints.length < 3) return rawPoints;
    return rawPoints.map((p, i) => {
      if (i === 0 || i === rawPoints.length - 1) return p;
      const prev = rawPoints[i - 1].value;
      const curr = p.value;
      const next = rawPoints[i + 1].value;
      return { ...p, value: (prev + curr * 2 + next) / 4 };
    });
  }, [rawPoints]);

  if (points.length < 2) {
    return <p className="py-6 text-center text-caption text-label-secondary/50">Not enough data.</p>;
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = max - min || 1;

  const width = Math.max(320, points.length * 8);
  const height = 120;
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((p.value - min) / span) * height;
    return { x, y };
  });

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((pct) => {
    const val = min + span * pct;
    const y = height - pct * height;
    return { value: val, y, pct };
  });

  const compactFormatter = new Intl.NumberFormat('en-IN', { notation: "compact", maximumFractionDigits: 1 });
  const formatCompact = (val: number) => {
    if (val === 0) return "0";
    const str = compactFormatter.format(Math.abs(val));
    return val < 0 ? `-${str}` : str;
  };

  const path = getSmoothPath(coords, 0.25);

  const zeroY = height - ((0 - min) / span) * height;
  const last = points[points.length - 1].value;

  const activeIndex = hoverIndex !== null ? hoverIndex : points.length - 1;
  const activePoint = points[activeIndex];
  const activeCoord = coords[activeIndex];

  function handleMove(e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const relX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const pct = relX / rect.width;
    const idx = Math.round(pct * (points.length - 1));
    setHoverIndex(Math.max(0, Math.min(points.length - 1, idx)));
  }

  const monthLabels: { label: string; xPercent: number; year: number }[] = [];

  points.forEach((p, index) => {
    const reverseIndex = points.length - 1 - index;
    if (reverseIndex % 7 === 0) {
      const date = new Date(p.date);
      const xPercent = (index / (points.length - 1)) * 100;
      const label = date.toLocaleString("en-US", { day: "numeric", month: "short" });
      const year = date.getFullYear();
      monthLabels.push({ label, xPercent, year });
    }
  });

  return (
    <div className="relative">
      {/* Top Hover Inspection Badge */}
      <div className="mb-2 relative flex items-center justify-between px-1">
        <span className="text-caption font-medium text-label-secondary/70">
          {new Date(activePoint.date).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wide text-label-secondary/40">
          Net Worth
        </span>
        <div className="flex items-center gap-1.5 text-subhead font-semibold">
          <span className="text-caption text-label-secondary/50">
            {hoverIndex !== null ? "Selected:" : "Net change:"}
          </span>
          <Amount value={activePoint.value} colour showSign />
        </div>
      </div>

      <div className="relative">
        <div className="relative overflow-x-auto no-scrollbar" ref={scrollRef}>
        <div style={{ width: `${Math.max(100, (width / 320) * 100)}%`, minWidth: '100%' }}>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-[130px] w-full cursor-crosshair touch-none overflow-visible"
            preserveAspectRatio="none"
            onMouseMove={handleMove}
            onTouchMove={handleMove}
            onMouseLeave={() => setHoverIndex(null)}
            onTouchEnd={() => setHoverIndex(null)}
          >
        <defs>
          <pattern id="lineGraphDotPattern" x="0" y="0" width="4.5" height="4.5" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="0.45" fill="rgb(var(--sys-gray))" opacity="0.85" />
          </pattern>
          <linearGradient id="lineGraphDotFadeGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="35%" stopColor="white" stopOpacity="0.75" />
            <stop offset="70%" stopColor="white" stopOpacity="0.3" />
            <stop offset="100%" stopColor="white" stopOpacity="0.05" />
          </linearGradient>
          <mask id="lineGraphMask">
            <path d={`${path} L${width},${height} L0,${height} Z`} fill="url(#lineGraphDotFadeGradient)" />
          </mask>
          <linearGradient id="lineGraphGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--sys-gray))" stopOpacity="0.15" />
            <stop offset="100%" stopColor="rgb(var(--sys-gray))" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* X-axis Vertical Grid Lines */}
        {monthLabels.map((m, i) => {
          const x = (m.xPercent / 100) * width;
          return (
            <line
              key={i}
              x1={x}
              y1="0"
              x2={x}
              y2={height}
              stroke="rgb(var(--separator))"
              strokeWidth="1"
              strokeDasharray="2 4"
              opacity="0.3"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        {/* Dotted Grid Area Fill with Top-to-Bottom Density Fade */}
        <rect
          x="0"
          y="0"
          width={width}
          height={height}
          fill="url(#lineGraphDotPattern)"
          mask="url(#lineGraphMask)"
        />

        {/* Subtle Gradient Background Area */}
        <path
          d={`${path} L${width},${height} L0,${height} Z`}
          fill="url(#lineGraphGrad)"
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

        {/* Hover Crosshair Line & Glowing Focus Point */}
        {hoverIndex !== null && activeCoord ? (
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
              fill="rgb(var(--sys-gray))"
              stroke="#FFFFFF"
              strokeWidth="2.5"
              className="drop-shadow-md"
            />
          </g>
        ) : null}
      </svg>

            <div className="relative mt-1 h-4 w-full overflow-visible">
              {monthLabels.map((m, i) => {
                return (
                  <span
                    key={`${m.year}-${m.label}-${i}`}
                    className="absolute top-0 text-[10px] font-medium text-label-secondary/60 -translate-x-1/2 whitespace-nowrap"
                    style={{ left: `${m.xPercent}%` }}
                  >
                    {m.label}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Y-axis Labels */}
        <div className="absolute top-0 bottom-5 left-0 w-12 pointer-events-none z-10">
          {yTicks.map((tick, i) => (
            <div key={i} className="absolute left-1" style={{ top: `calc(${100 - tick.pct * 100}% - 7px)` }}>
              <span className="text-[10px] font-medium text-label-secondary/50 drop-shadow-sm">
                ₹{formatCompact(tick.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** GitHub-style calendar of daily spend. */
export function Heatmap({ start, end }: { start: Date; end: Date }) {
  const { transactions, allWallets } = useBudget();
  const heatmapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (heatmapRef.current) {
      heatmapRef.current.scrollLeft = heatmapRef.current.scrollWidth;
    }
  }, [transactions.length]);

  const daily = useMemo(
    () => getDailyTotals(allWallets, transactions, start, end),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allWallets, transactions, start.getTime()],
  );

  const days = [...daily.entries()];
  const spendMagnitudes = days.map(([, v]) => Math.abs(Math.min(0, v)));
  const incomeMagnitudes = days.map(([, v]) => Math.max(0, v));
  const peakSpend = Math.max(...spendMagnitudes, 1);
  const peakIncome = Math.max(...incomeMagnitudes, 1);

  // Pad to a whole week so columns line up under the weekday labels.
  const firstDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const leadingBlanks = firstDay.getDay();

  const monthLabels: { label: string; colIndex: number; year: number }[] = [];

  days.forEach(([key], index) => {
    const reverseIndex = days.length - 1 - index;
    // Show a label every 21 days (3 weeks)
    if (reverseIndex % 21 === 0) {
      const date = new Date(key);
      const colIndex = Math.floor((leadingBlanks + index) / 7);
      const label = date.toLocaleString("en-US", { day: "numeric", month: "short" });
      const year = date.getFullYear();
      monthLabels.push({ label, colIndex, year });
    }
  });

  return (
    <div>
      <div className="overflow-x-auto no-scrollbar" ref={heatmapRef}>
        <div className="w-max pb-1">
          <div className="grid grid-flow-col grid-rows-7 gap-[3px]">
            {Array.from({ length: leadingBlanks }).map((_, i) => (
              <span key={`blank-${i}`} className="h-3.5 w-3.5" />
            ))}
            {days.map(([key, value]) => {
              const isIncome = value > 0;
              const isSpend = value < 0;
              const intensity = isIncome ? (value / peakIncome) : isSpend ? (Math.abs(value) / peakSpend) : 0;
              return (
                <span
                  key={key}
                  title={`${key}: ${value.toFixed(2)}`}
                  className={cn(
                    "h-3.5 w-3.5 rounded-[3px]",
                    value === 0 && "bg-fill/12",
                  )}
                  style={
                    value !== 0
                      ? { backgroundColor: `rgb(var(${isIncome ? '--sys-green' : '--sys-red'}) / ${0.15 + intensity * 0.85})` }
                      : undefined
                  }
                />
              );
            })}
          </div>
          <div className="relative h-6 mt-1.5">
            {monthLabels.map((m, i) => {
              return (
                <div
                  key={`${m.year}-${m.label}-${i}`}
                  className="absolute top-0 flex flex-col items-center text-[10px] font-medium text-label-secondary/60 -translate-x-1/2 whitespace-nowrap"
                  style={{ left: m.colIndex * 17 + 7 }}
                >
                  <svg width="5" height="4" viewBox="0 0 5 4" className="fill-label-secondary/40 mb-0.5">
                    <polygon points="2.5,0 5,4 0,4" />
                  </svg>
                  <span>{m.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-end gap-x-5 gap-y-1.5 text-[9px] font-medium text-label-secondary/50">
        <div className="flex items-center gap-1">
          <span>Less</span>
          {[0.15, 0.4, 0.65, 1].map((a) => (
            <span
              key={a}
              className="h-2.5 w-2.5 rounded-[2px]"
              style={{ backgroundColor: `rgb(var(--sys-red) / ${a})` }}
            />
          ))}
          <span>More Spend</span>
        </div>
        <div className="flex items-center gap-1">
          <span>Less</span>
          {[0.15, 0.4, 0.65, 1].map((a) => (
            <span
              key={a}
              className="h-2.5 w-2.5 rounded-[2px]"
              style={{ backgroundColor: `rgb(var(--sys-green) / ${a})` }}
            />
          ))}
          <span>More Income</span>
        </div>
      </div>
    </div>
  );
}

/** This-month summary for the home screen. */
export function SpendingSummaryWidget() {
  const { transactions, allWallets, objectives } = useBudget();

  const summary = useMemo(() => {
    return getSpendingSummary(allWallets, transactions, objectives);
  }, [transactions, allWallets, objectives]);

  return (
    <Card>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-caption uppercase tracking-wide text-label-secondary/50">Income</p>
          <Amount value={summary.income} className="text-subhead font-semibold text-green" />
        </div>
        <div>
          <p className="text-caption uppercase tracking-wide text-label-secondary/50">Expense</p>
          <Amount value={summary.expense} className="text-subhead font-semibold text-red" />
        </div>
        <div>
          <p className="text-caption uppercase tracking-wide text-label-secondary/50">Net</p>
          <Amount value={summary.net} colour showSign className="text-subhead font-semibold" />
        </div>
      </div>
    </Card>
  );
}

/** A stacked horizontal bar showing category breakdown. */
export function CategoryStackedBar({ byCategory, title }: { byCategory: Map<string, number>; title?: string }) {
  const { byPk } = useCategoryLookup();
  const entries = [...byCategory.entries()];
  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  if (entries.length === 0 || total === 0) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      {title ? (
        <div className="flex justify-between text-caption2 text-label-secondary/70 uppercase tracking-wide">
          <span>{title}</span>
          <Amount value={total} className="font-medium text-label" />
        </div>
      ) : null}
      <div className="flex h-6 w-full overflow-hidden rounded-md bg-fill/5">
        {entries.map(([categoryPk, value]) => {
          const category = byPk.get(categoryPk);
          const share = value / total;
          return (
            <div
              key={categoryPk}
              className="h-full transition-opacity hover:opacity-80"
              style={{ width: `${share * 100}%`, backgroundColor: category?.colour ?? "#8E8E93" }}
              title={`${category?.name ?? "Uncategorised"} — ${Math.round(share * 100)}% (${value.toFixed(2)})`}
            />
          );
        })}
      </div>
    </div>
  );
}

/** All-time category breakdown widget for the home screen (Pie charts). */
export function CategoryBreakdownWidget() {
  const { transactions, allWallets, objectives } = useBudget();
  const [mobileTab, setMobileTab] = useState<"outgoing" | "incoming">("outgoing");

  const expenseTotals = useMemo(
    () => getCategoryTotals(allWallets, transactions, { income: false }, objectives),
    [transactions, allWallets, objectives],
  );
  const incomeTotals = useMemo(
    () => getCategoryTotals(allWallets, transactions, { income: true }, objectives),
    [transactions, allWallets, objectives],
  );

  const expenseByCategory = useMemo(
    () => new Map([...expenseTotals].map(([pk, v]): [string, number] => [pk, v.sum])),
    [expenseTotals],
  );
  const incomeByCategory = useMemo(
    () => new Map([...incomeTotals].map(([pk, v]): [string, number] => [pk, v.sum])),
    [incomeTotals],
  );
  const expenseCounts = useMemo(
    () => new Map([...expenseTotals].map(([pk, v]): [string, number] => [pk, v.count])),
    [expenseTotals],
  );
  const incomeCounts = useMemo(
    () => new Map([...incomeTotals].map(([pk, v]): [string, number] => [pk, v.count])),
    [incomeTotals],
  );

  return (
    <>
      {/* Mobile Single Card matching Account Details view */}
      <Card className="flex sm:hidden flex-col !p-4 space-y-4">
        {/* Full-width Segmented Tab Switcher */}
        <div className="flex rounded-full bg-fill/10 p-1 text-subhead font-semibold">
          <button
            type="button"
            onClick={() => setMobileTab("outgoing")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded-full py-2 transition-all",
              mobileTab === "outgoing"
                ? "bg-bg-elevated text-red shadow-sm font-bold"
                : "text-label-secondary/70 hover:text-label",
            )}
          >
            🔻 Outgoing
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("incoming")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded-full py-2 transition-all",
              mobileTab === "incoming"
                ? "bg-bg-elevated text-green shadow-sm font-bold"
                : "text-label-secondary/70 hover:text-label",
            )}
          >
            🔺 Incoming
          </button>
        </div>

        {mobileTab === "outgoing" ? (
          <CategoryBreakdown byCategory={expenseByCategory} counts={expenseCounts} direction="outgoing" noCard layout="col" />
        ) : (
          <CategoryBreakdown byCategory={incomeByCategory} counts={incomeCounts} direction="incoming" noCard layout="col" />
        )}
      </Card>

      {/* Desktop / Tablet 2 Side-by-Side Cards */}
      <div className="hidden sm:grid grid-cols-2 gap-4">
        <Card className="flex flex-col !p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-label-secondary/60 mb-3">
            All-Time Outgoing
          </h3>
          <CategoryBreakdown byCategory={expenseByCategory} counts={expenseCounts} direction="outgoing" noCard layout="col" />
        </Card>

        <Card className="flex flex-col !p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-label-secondary/60 mb-3">
            All-Time Incoming
          </h3>
          <CategoryBreakdown byCategory={incomeByCategory} counts={incomeCounts} direction="incoming" noCard layout="col" />
        </Card>
      </div>
    </>
  );
}

/** All-time category stacked bars widget for the home screen. */
export function CategoryStackedBarWidget() {
  const { transactions, allWallets, objectives, categories } = useBudget();

  const expenseByCategory = useMemo(() => {
    return getSpendingByCategory(allWallets, transactions, { income: false }, objectives);
  }, [transactions, allWallets, objectives, categories]);

  const incomeByCategory = useMemo(() => {
    return getSpendingByCategory(allWallets, transactions, { income: true }, objectives);
  }, [transactions, allWallets, objectives, categories]);

  return (
    <Card className="flex flex-col gap-5 justify-center h-full !py-6">
      <CategoryStackedBar byCategory={expenseByCategory} title="All-Time Expenses" />
      <CategoryStackedBar byCategory={incomeByCategory} title="All-Time Income" />
    </Card>
  );
}

export { dayKey };
