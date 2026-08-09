"use client";

/**
 * Spending visualisations: pie by category, cumulative line, and a calendar
 * heatmap. All are inline SVG so the budget environment adds no chart
 * dependency to the bundle.
 */

import { useMemo, useState } from "react";
import { ChartPie as PieIcon } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import {
  dayKey,
  getCumulativeTotals,
  getDailyTotals,
  getSpendingByCategory,
  getSpendingSummary,
} from "@/lib/budget/calculations";
import { useBudget, useCategoryLookup } from "./budget-provider";
import { Amount, Card, CategoryDot, EmptyState, SegmentedTabs, Section } from "./budget-ui";

type Range = "month" | "3months" | "year";

function rangeStart(range: Range): Date {
  const now = new Date();
  if (range === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (range === "3months") return new Date(now.getFullYear(), now.getMonth() - 2, 1);
  return new Date(now.getFullYear(), 0, 1);
}

export function AnalyticsView() {
  const { allWallets, transactions, objectives } = useBudget();
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
    [allWallets, inRange, direction, objectives],
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
export function CategoryBreakdown({ byCategory }: { byCategory: Map<string, number> }) {
  const { byPk } = useCategoryLookup();
  const entries = [...byCategory.entries()];
  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  if (entries.length === 0 || total === 0) {
    return <EmptyState icon={PieIcon} title="Nothing to chart yet" />;
  }

  // Build the donut as stacked stroke-dasharray arcs on one circle.
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <Card>
      <div className="flex flex-col items-center gap-5 sm:flex-row">
        <svg viewBox="0 0 160 160" className="h-[150px] w-[150px] shrink-0 -rotate-90">
          {entries.map(([categoryPk, value]) => {
            const category = byPk.get(categoryPk);
            const share = value / total;
            const dash = share * circumference;
            const el = (
              <circle
                key={categoryPk}
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke={category?.colour ?? "#8E8E93"}
                strokeWidth="24"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return el;
          })}
        </svg>

        <ul className="w-full flex-1 space-y-2">
          {entries.slice(0, 8).map(([categoryPk, value]) => {
            const category = byPk.get(categoryPk);
            const share = value / total;
            return (
              <li key={categoryPk} className="flex items-center gap-2.5">
                <CategoryDot
                  colour={category?.colour}
                  label={category?.name}
                  emoji={category?.emojiIconName}
                  size={24}
                />
                <span className="min-w-0 flex-1 truncate text-footnote text-label">
                  {category?.name ?? "Uncategorised"}
                </span>
                <span className="shrink-0 text-caption text-label-secondary/60">
                  {Math.round(share * 100)}%
                </span>
                <Amount value={value} className="shrink-0 text-footnote font-medium" />
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}

/** Running balance across the range. */
export function LineGraph({ start, end }: { start: Date; end: Date }) {
  const { transactions, allWallets } = useBudget();

  const points = useMemo(
    () => getCumulativeTotals(allWallets, transactions, start, end),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allWallets, transactions, start.getTime()],
  );

  if (points.length < 2) {
    return <p className="py-6 text-center text-caption text-label-secondary/50">Not enough data.</p>;
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = max - min || 1;

  const width = 320;
  const height = 120;
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((p.value - min) / span) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const zeroY = height - ((0 - min) / span) * height;
  const last = points[points.length - 1].value;

  const monthLabels: { label: string; xPercent: number; year: number }[] = [];
  let currentMonth = -1;

  points.forEach((p, index) => {
    const date = new Date(p.date);
    if (date.getMonth() !== currentMonth) {
      currentMonth = date.getMonth();
      const xPercent = (index / (points.length - 1)) * 100;
      const label = date.toLocaleString("en-US", { month: "short" });
      const year = date.getFullYear();
      monthLabels.push({ label, xPercent, year });
    }
  });

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[120px] w-full" preserveAspectRatio="none">
        <line
          x1="0"
          y1={zeroY}
          x2={width}
          y2={zeroY}
          stroke="rgb(var(--separator))"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <path
          d={`${path} L${width},${zeroY} L0,${zeroY} Z`}
          fill={last >= 0 ? "rgb(var(--sys-green) / 0.12)" : "rgb(var(--sys-red) / 0.12)"}
        />
        <path
          d={path}
          fill="none"
          stroke={last >= 0 ? "rgb(var(--sys-green))" : "rgb(var(--sys-red))"}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      
      <div className="relative mt-1 h-4 w-full overflow-hidden">
        {monthLabels.map((m, i) => {
          const showYear = i === 0 || m.label === "Jan";
          return (
            <span
              key={`${m.year}-${m.label}-${i}`}
              className="absolute top-0 text-[10px] font-medium text-label-secondary/60"
              style={{ left: `${m.xPercent}%` }}
            >
              {m.label} {showYear ? `'${String(m.year).slice(-2)}` : ""}
            </span>
          );
        })}
      </div>

      <p className="mt-3 text-center text-caption text-label-secondary/60">
        Net change over the period: <Amount value={last} colour showSign className="font-medium" />
      </p>
    </div>
  );
}

/** GitHub-style calendar of daily spend. */
export function Heatmap({ start, end }: { start: Date; end: Date }) {
  const { transactions, allWallets } = useBudget();

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
  let currentMonth = -1;

  days.forEach(([key], index) => {
    const date = new Date(key);
    if (date.getMonth() !== currentMonth) {
      currentMonth = date.getMonth();
      const colIndex = Math.floor((leadingBlanks + index) / 7);
      const label = date.toLocaleString("en-US", { month: "short" });
      const year = date.getFullYear();
      monthLabels.push({ label, colIndex, year });
    }
  });

  return (
    <div>
      <div className="overflow-x-auto">
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
          <div className="relative h-5 mt-1.5">
            {monthLabels.map((m, i) => {
              const showYear = i === 0 || m.label === "Jan";
              return (
                <span
                  key={`${m.year}-${m.label}-${i}`}
                  className="absolute top-0 text-[10px] font-medium text-label-secondary/60"
                  style={{ left: m.colIndex * 17 }}
                >
                  {m.label} {showYear ? `'${String(m.year).slice(-2)}` : ""}
                </span>
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-end gap-x-6 gap-y-2 text-caption2 text-label-secondary/50">
        <div className="flex items-center gap-1.5">
          <span>Less</span>
          {[0.15, 0.4, 0.65, 1].map((a) => (
            <span
              key={a}
              className="h-3 w-3 rounded-[3px]"
              style={{ backgroundColor: `rgb(var(--sys-red) / ${a})` }}
            />
          ))}
          <span>More Spend</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span>Less</span>
          {[0.15, 0.4, 0.65, 1].map((a) => (
            <span
              key={a}
              className="h-3 w-3 rounded-[3px]"
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
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const inMonth = transactions.filter(
      (t) => new Date(t.dateCreated).getTime() >= start.getTime(),
    );
    return getSpendingSummary(allWallets, inMonth, objectives);
  }, [transactions, allWallets, objectives]);

  return (
    <Card className="!p-3">
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
  );
}

export { dayKey };
