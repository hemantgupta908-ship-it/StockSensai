"use client";

/**
 * Account-scoped transaction view.
 *
 * When you tap an account card, this component renders its transactions with
 * the account's chosen colour as the accent — header, FAB, and progress all
 * pick it up via CSS custom properties.
 */

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowsLeftRight, CreditCard, Plus, Star, UploadSimple } from "@phosphor-icons/react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { type Transaction } from "@/lib/budget/types";
import { getWalletBalance, getSpendingSummary, countsTowardsTotal } from "@/lib/budget/calculations";
import { getCreditCardStatus, isCreditCard, dayInMonth } from "@/lib/budget/credit";
import { formatCurrencyAmount } from "@/lib/budget/currency";
import { useBudget, useCategoryLookup } from "./budget-provider";
import { IconBadge } from "./icon-picker";
import {
  Amount,
  EmptyState,
  SearchField,
  SegmentedTabs,
  ProgressBar,
  formatDayHeading,
  useGroupedByDay,
} from "./budget-ui";
import { TransactionGroup, TransactionRow } from "./transaction-row";
import { TransactionModal } from "./transaction-modal";
import { ImportPreviewModal } from "./import-preview-modal";
import { CONTAINER_WIDTHS } from "@/components/ui/page-container";

type DirectionFilter = "all" | "expense" | "income";

type CycleGroup = {
  key: string;
  cycleStart: Date;
  cycleEnd: Date;
  spend: number;
  payments: number;
  items: Transaction[];
};

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
  const { wallets, transactions, allWallets, settings, objectives } = useBudget();
  const { byPk } = useCategoryLookup();

  const wallet = wallets.find((w) => w.walletPk === walletPk);
  const accent = wallet?.colour ?? "#4CAF50";

  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return transactions
      .filter((t) => {
        if (t.walletFk !== walletPk) return false;
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
      .sort(
        (a, b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime(),
      );
  }, [transactions, walletPk, query, direction, byPk]);

  const summary = useMemo(
    () => getSpendingSummary(allWallets, filtered, objectives),
    [allWallets, filtered, objectives],
  );

  const dailyBalances = useMemo(() => {
    if (!walletPk) return new Map<string, number>();
    const sorted = transactions
      .filter((t) => t.walletFk === walletPk)
      .sort((a, b) => new Date(a.dateCreated).getTime() - new Date(b.dateCreated).getTime());
      
    let current = 0;
    const balances = new Map<string, number>();
    for (const t of sorted) {
      if (countsTowardsTotal(t)) {
        current += t.amount;
      }
      const d = new Date(t.dateCreated);
      const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      balances.set(dayKey, current);
    }
    return balances;
  }, [transactions, walletPk]);

  const dayGroups = useGroupedByDay(filtered);
  const cycleGroups = useGroupedByCycle(filtered, wallet && isCreditCard(wallet) ? (wallet.statementDay ?? null) : null);

  const cycleGroupsWithUnpaid = useMemo(() => {
    if (!cycleGroups || !card) return cycleGroups;
    let accumulatedSpend = 0;
    return cycleGroups.map(group => {
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
            <Link
              href="/budget/accounts"
              className="-ml-1 flex items-center gap-0.5 rounded-full p-1.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              aria-label="Back"
              style={{ color: accent }}
            >
              <ArrowLeft size={22} />
            </Link>

            <IconBadge
              iconName={wallet.iconName}
              colour={accent}
              size={36}
              fallback={wallet.name}
            />

            <div className="min-w-0 flex-1">
              <h1 className="flex items-center gap-2 truncate text-headline font-semibold text-label">
                {wallet.name}
                {isPrimary ? (
                  <Star size={13} className="shrink-0 fill-amber text-amber" />
                ) : null}
                {card ? (
                  <CreditCard size={14} className="shrink-0 text-label-secondary/50" />
                ) : null}
              </h1>
              <p className="text-caption text-label-secondary/60">
                {card ? "Credit card" : "Account"} transactions
              </p>
            </div>

            <div className="shrink-0 text-right">
              <span
                className={cn(
                  "block text-title3 font-semibold tabular-nums",
                  card
                    ? card.outstanding > 0
                      ? "text-red"
                      : "text-green"
                    : balance < 0
                      ? "text-red"
                      : "text-label",
                  settings.hideAmounts && "blur-[6px]",
                )}
              >
                {formatCurrencyAmount(card ? card.outstanding : balance, wallet.currency, {
                  decimals: settings.showDecimals ? wallet.decimals : 0,
                })}
              </span>
              {card ? (
                <span className="text-caption2 text-label-secondary/50">
                  {card.outstanding > 0 ? "owed" : "clear"}
                </span>
              ) : null}
            </div>
          </div>

          {/* Credit card utilization bar */}
          {card && card.utilisation !== null ? (
            <div className="mt-2">
              <ProgressBar
                percent={card.utilisation}
                colour={card.highUtilisation ? "rgb(var(--sys-orange))" : accent}
                height={5}
              />
              <div className="mt-1 flex justify-between text-caption2 text-label-secondary/60">
                <span>{Math.round(card.utilisation * 100)}% used</span>
                <span>
                  {formatCurrencyAmount(card.available ?? 0, wallet.currency, { decimals: 0 })}{" "}
                  available
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      {/* Content */}
      <main className={cn("mx-auto pb-10 pt-5", CONTAINER_WIDTHS.wide)}>
        <div className="flex gap-2 items-center mb-4">
          <div className="flex-1">
            <SearchField value={query} onChange={setQuery} placeholder="Search transactions..." />
          </div>
          <button
            onClick={() => setImportOpen(true)}
            className="flex h-11 items-center gap-2 rounded-[14px] bg-fill/5 px-4 text-sm font-semibold text-label transition-colors hover:bg-fill/10 active:scale-[0.98] shrink-0 ring-1 ring-black/5 dark:ring-white/10"
          >
            <UploadSimple size={16} />
            <span className="hidden sm:inline">Upload</span>
          </button>
        </div>

        <div className="mb-3">
          <SegmentedTabs
            value={direction}
            onChange={setDirection}
            options={[
              { value: "all", label: "All" },
              { value: "expense", label: "Expense" },
              { value: "income", label: "Income" },
            ]}
          />
        </div>

        {/* Statement card */}
        {card && card.remainingStatementBalance > 0 ? (
          <div className="mb-4 rounded-[20px] bg-bg-secondary p-4 shadow-sm ring-1 ring-black/5 dark:ring-white/10 flex items-center justify-between gap-4">
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
              className="rounded-[10px] bg-green px-4 py-2 text-subhead font-semibold text-white transition-transform active:scale-[0.98] whitespace-nowrap"
            >
              Pay Bill
            </button>
          </div>
        ) : null}

        {/* Summary card */}
        <div className="mb-4 rounded-[20px] bg-bg-secondary p-4 shadow-sm ring-1 ring-black/5 dark:ring-white/10">
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
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={ArrowsLeftRight}
            title="No transactions found"
            description={
              query
                ? "Try a different search."
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
                    {group.unpaidAmount !== undefined && group.unpaidAmount > 0 ? (
                      <button
                        onClick={() => {
                          setEditing(null);
                          setModalDefaultTab("transfer");
                          setModalDefaults({
                            amount: group.unpaidAmount,
                            toWalletFk: walletPk,
                            name: `Cycle Payment`,
                          } as any);
                          setModalOpen(true);
                        }}
                        className="ml-1 rounded-[8px] bg-green/15 px-2.5 py-1 text-[12px] font-semibold text-green transition-colors hover:bg-green/25 active:scale-95"
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

      <ImportPreviewModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        defaultWalletFk={walletPk}
      />
    </div>
  );
}
