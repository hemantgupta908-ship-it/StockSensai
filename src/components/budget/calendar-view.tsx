"use client";
import { useShallow } from "zustand/react/shallow";

/**
 * Calendar View Component matching reference design.
 * Features:
 * - Scrollable Month selector ribbon (June, July, August, September, etc.)
 * - Monthly Net balance banner (▼ Expenses, ▲ Income, = Net)
 * - 7-column weekday grid (Sun..Sat)
 * - Daily transaction dots (Green for income, Red for expense)
 * - Compact formatted daily totals (e.g. ₹3.8K, ₹42.4K)
 * - Active day highlight pill
 * - Selected day transaction breakdown list below
 *
 * Layout: one narrow column on phones, calendar beside a sticky day panel from
 * `lg` up. The stacked phone layout left roughly half a desktop viewport empty
 * either side of a 576px column, so above `lg` the day breakdown moves out of
 * the scroll flow and into that space instead of being appended below the fold.
 * Every desktop-only rule is `lg:`-prefixed, so the phone layout is unchanged.
 */

import { useMemo, useState, useRef, useEffect } from "react";
import {
  CaretLeft,
  CaretRight,
  ArrowsLeftRight,
  Plus,
  ArrowDownRight,
  ArrowUpRight,
  Clock,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { type Transaction } from "@/lib/budget/types";
import { formatCurrencyAmount, getCurrencyInfo } from "@/lib/budget/currency";
import { useBudget, useCategoryLookup } from "./budget-provider";
import { AddFab, Amount, Card, CategoryDot, EmptyState } from "./budget-ui";
import { TransactionGroup, TransactionRow } from "./transaction-row";
import { TransactionModal } from "./transaction-modal";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarView() {
  const { transactions, wallets, settings  } = useBudget(useShallow((s) => ({ transactions: s.transactions, wallets: s.wallets, settings: s.settings })));
  const { byPk } = useCategoryLookup();

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [editingModalOpen, setEditingModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  const monthRibbonRef = useRef<HTMLDivElement>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Scroll active month into view on month change
  useEffect(() => {
    if (monthRibbonRef.current) {
      const activeEl = monthRibbonRef.current.querySelector("[data-active='true']");
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    }
  }, [month, year]);

  // Generate 12 months for smooth horizontal scroll ribbon around current year
  const monthsRibbon = useMemo(() => {
    const months = [];
    for (let i = -5; i <= 6; i++) {
      const d = new Date(year, month + i, 1);
      months.push(d);
    }
    return months;
  }, [year, month]);

  // Filter transactions for current selected month
  const monthTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (!t.paid && t.skipPaid) return false;
      const d = new Date(t.dateCreated);
      return d.getFullYear() === year && d.getMonth() === month;
    });
  }, [transactions, year, month]);

  // Compute monthly summary
  const monthlyTotals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of monthTransactions) {
      if (t.income) {
        income += Math.abs(t.amount);
      } else {
        expense += Math.abs(t.amount);
      }
    }
    return {
      income,
      expense,
      net: income - expense,
    };
  }, [monthTransactions]);

  // Map daily totals and dots for the calendar grid
  const daysData = useMemo(() => {
    const daysMap = new Map<number, { income: number; expense: number; hasIncome: boolean; hasExpense: boolean; count: number }>();
    for (const t of monthTransactions) {
      const d = new Date(t.dateCreated);
      const dayNum = d.getDate();
      const existing = daysMap.get(dayNum) ?? { income: 0, expense: 0, hasIncome: false, hasExpense: false, count: 0 };
      if (t.income) {
        existing.income += Math.abs(t.amount);
        existing.hasIncome = true;
      } else {
        existing.expense += Math.abs(t.amount);
        existing.hasExpense = true;
      }
      existing.count += 1;
      daysMap.set(dayNum, existing);
    }
    return daysMap;
  }, [monthTransactions]);

  /**
   * Largest expense categories in the visible month.
   *
   * Only rendered in the desktop side column: picking an empty day there leaves
   * a tall panel holding a single "no transactions" line, so the month's shape
   * fills it regardless of which day is selected.
   */
  const topCategories = useMemo(() => {
    const totals = new Map<string, number>();
    for (const t of monthTransactions) {
      if (t.income) continue;
      totals.set(t.categoryFk, (totals.get(t.categoryFk) ?? 0) + Math.abs(t.amount));
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [monthTransactions]);

  // Calculate calendar grid days
  const calendarGrid = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const grid: ({ day: number; date: Date } | null)[] = [];
    
    // Empty slots before 1st of month
    for (let i = 0; i < firstDayIndex; i++) {
      grid.push(null);
    }
    
    // Days 1..daysInMonth
    for (let day = 1; day <= daysInMonth; day++) {
      grid.push({
        day,
        date: new Date(year, month, day),
      });
    }

    return grid;
  }, [year, month]);

  // Transactions for selected date
  const selectedDayTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const d = new Date(t.dateCreated);
      return (
        d.getFullYear() === selectedDate.getFullYear() &&
        d.getMonth() === selectedDate.getMonth() &&
        d.getDate() === selectedDate.getDate()
      );
    }).sort((a, b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime());
  }, [transactions, selectedDate]);

  function isSameDay(d1: Date, d2: Date) {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  }

  const isToday = (d: Date) => isSameDay(d, new Date());

  return (
    <div className="pb-2 select-none">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
      {/* Calendar column — centred and phone-width until the grid splits. */}
      <div className="mx-auto w-full max-w-xl lg:mx-0 lg:max-w-none">
      {/* Top Header & Month Ribbon */}
      <div className="bg-bg-elevated rounded-[24px] p-3 shadow-xs border border-separator/20 lg:p-3.5 xl:p-4">
        {/* Month Selector Scrollable Ribbon with Year */}
        <div
          ref={monthRibbonRef}
          className="flex items-center gap-5 overflow-x-auto no-scrollbar py-1 px-3 text-center border-b border-separator/15"
        >
          {monthsRibbon.map((m) => {
            const isSelectedMonth = m.getMonth() === month && m.getFullYear() === year;
            return (
              <button
                key={`${m.getFullYear()}-${m.getMonth()}`}
                type="button"
                data-active={isSelectedMonth}
                onClick={() => {
                  setCurrentDate(new Date(m.getFullYear(), m.getMonth(), 1));
                  setSelectedDate(new Date(m.getFullYear(), m.getMonth(), 1));
                }}
                className={cn(
                  "relative py-1.5 px-2 text-subhead font-medium shrink-0 transition-colors flex flex-col items-center",
                  isSelectedMonth ? "text-label font-bold" : "text-label-secondary/50 hover:text-label-secondary"
                )}
              >
                <div className="flex items-center gap-1">
                  <span>{MONTH_NAMES[m.getMonth()]}</span>
                  <span className={cn("text-[10px] font-bold tracking-tight", isSelectedMonth ? "text-accent" : "text-label-secondary/40")}>
                    {m.getFullYear()}
                  </span>
                </div>
                {isSelectedMonth ? (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-label" />
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Monthly Summary Banner: Expense, Income, Net */}
        {/*
          `justify-around` reads as a cluster at phone width but strands the three
          figures at opposite ends of a wide desktop card, so above `lg` they stay
          centred with a fixed gap instead of spreading.
        */}
        <div className="mt-2 flex items-center justify-around rounded-xl bg-fill/5 p-2 dark:bg-white/[0.03] text-caption font-semibold lg:justify-center lg:gap-10 lg:text-subhead">
          <div className="flex items-center gap-1 text-red">
            <span className="text-[11px]">▼</span>
            <span>{formatCurrencyAmount(monthlyTotals.expense, undefined, { decimals: 0, compact: true })}</span>
          </div>

          <div className="h-3 w-[1px] bg-separator/30" />

          <div className="flex items-center gap-1 text-green font-bold">
            <span className="text-[11px]">▲</span>
            <span>{formatCurrencyAmount(monthlyTotals.income, undefined, { decimals: 0, compact: true })}</span>
          </div>

          <div className="h-3 w-[1px] bg-separator/30" />

          <div className="flex items-center gap-1 text-label">
            <span className="text-[11px] text-label-secondary/60">=</span>
            <span>{formatCurrencyAmount(monthlyTotals.net, undefined, { decimals: 0, compact: true })}</span>
          </div>
        </div>

        {/* Weekday Headers */}
        <div className="mt-2.5 grid grid-cols-7 text-center text-caption font-bold text-label-secondary/60 xl:text-subhead">
          {WEEKDAY_NAMES.map((name) => (
            <div key={name} className="py-0.5">
              {name}
            </div>
          ))}
        </div>

        {/* 7-Column Calendar Day Cells Grid */}
        <div className="mt-1 grid grid-cols-7 gap-y-1.5 gap-x-1 lg:gap-y-2 lg:gap-x-1.5 text-center">
          {calendarGrid.map((item, idx) => {
            if (!item) {
              return <div key={`empty-${idx}`} className="h-11 lg:h-14 xl:h-16" />;
            }

            const dayData = daysData.get(item.day);
            const isSelected = isSameDay(item.date, selectedDate);
            const isCurrentToday = isToday(item.date);
            const netDayValue = (dayData?.income ?? 0) - (dayData?.expense ?? 0);

            return (
              <button
                key={item.day}
                type="button"
                onClick={() => setSelectedDate(item.date)}
                className={cn(
                  "group relative flex h-11 flex-col items-center justify-between rounded-[12px] p-1 transition-all active:scale-95 lg:h-14 xl:h-16 lg:justify-center lg:gap-0.5 lg:rounded-[14px] lg:p-1.5",
                  isSelected
                    ? "bg-accent text-accent-fg shadow-md font-bold"
                    : dayData
                      ? "border border-separator/30 bg-bg-secondary hover:border-separator/70"
                      : "hover:bg-fill/10"
                )}
              >
                {/* Date Number */}
                <span className={cn("text-caption font-bold leading-none lg:text-subhead xl:text-body", isSelected ? "text-white" : isCurrentToday ? "text-accent font-extrabold" : "text-label")}>
                  {item.day}
                </span>

                {/* Income / Expense Indicator Dots */}
                <div className="flex items-center gap-1">
                  {dayData?.hasIncome ? (
                    <span className={cn("h-1.5 w-1.5 rounded-full lg:h-1.5 lg:w-1.5", isSelected ? "bg-white" : "bg-green")} />
                  ) : null}
                  {dayData?.hasExpense ? (
                    <span className={cn("h-1.5 w-1.5 rounded-full lg:h-1.5 lg:w-1.5", isSelected ? "bg-white/80" : "bg-red")} />
                  ) : null}
                </div>

                {/* Day Amount Subtext */}
                <span className={cn("text-[10px] font-bold leading-none tabular-nums truncate max-w-full lg:text-[11px]", isSelected ? "text-white/90" : netDayValue > 0 ? "text-green" : netDayValue < 0 ? "text-red/80" : "text-label-secondary/40")}>
                  {dayData ? formatCurrencyAmount(Math.abs(netDayValue), undefined, { decimals: 0, compact: true }) : "₹0"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      </div>

      {/*
        Selected day column. Sticky from `lg` so scrolling a long month keeps the
        day breakdown in view; capped and scrollable so a heavy day can't run off
        the bottom of a pinned panel with no way to reach it.
      */}
      <div className="mx-auto w-full max-w-xl space-y-4 lg:mx-0 lg:max-w-none lg:sticky lg:top-[72px] lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:no-scrollbar">
      {/* Selected Day Transactions Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-2 lg:px-3">
          <h3 className="text-subhead font-bold text-label lg:text-headline">
            {selectedDate.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
          </h3>
          <span className="text-caption font-medium text-label-secondary/60 lg:text-footnote">
            {selectedDayTransactions.length} transaction{selectedDayTransactions.length === 1 ? "" : "s"}
          </span>
        </div>

        {selectedDayTransactions.length === 0 ? (
          <Card className="text-center !py-8 lg:!py-10">
            <p className="text-caption text-label-secondary/60 lg:text-subhead">No transactions recorded for this day</p>
          </Card>
        ) : (
          <TransactionGroup>
            {selectedDayTransactions.map((t) => (
              <TransactionRow
                key={t.transactionPk}
                transaction={t}
                onEdit={(trans) => {
                  setEditingTransaction(trans);
                  setEditingModalOpen(true);
                }}
                showAccount
                large
              />
            ))}
          </TransactionGroup>
        )}
      </div>

      {/* Month context — desktop only, so the phone layout stays as it was. */}
      {topCategories.length > 0 ? (
        <div className="hidden lg:block">
          <div className="rounded-[24px] border border-separator/20 bg-bg-elevated p-4 shadow-xs xl:p-5">
            <div className="flex items-baseline justify-between">
              <h3 className="text-headline font-bold text-label">Top spend</h3>
              <span className="text-footnote font-medium text-label-secondary/60">
                {MONTH_NAMES[month]} {year}
              </span>
            </div>

            <div className="mt-4 space-y-3.5">
              {topCategories.map(([pk, total]) => {
                const category = byPk.get(pk);
                const share = monthlyTotals.expense > 0 ? total / monthlyTotals.expense : 0;
                return (
                  <div key={pk} className="flex items-center gap-3">
                    <CategoryDot
                      size={34}
                      colour={category?.colour}
                      label={category?.name}
                      emoji={category?.emojiIconName}
                      iconName={category?.iconName}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-subhead font-semibold text-label">
                          {category?.name ?? "Uncategorised"}
                        </span>
                        <span className="shrink-0 text-subhead font-bold tabular-nums text-label">
                          {formatCurrencyAmount(total, undefined, { decimals: 0, compact: true })}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fill/10">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(share * 100, 2)}%`,
                            backgroundColor: category?.colour ?? "#8E8E93",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
      </div>
      </div>

      {/* Floating Add Transaction FAB */}
      <AddFab
        onClick={() => {
          setEditingTransaction(null);
          setEditingModalOpen(true);
        }}
        label="Add transaction"
      />

      <TransactionModal
        open={editingModalOpen}
        onClose={() => {
          setEditingModalOpen(false);
          setEditingTransaction(null);
        }}
        editing={editingTransaction}
      />
    </div>
  );
}
