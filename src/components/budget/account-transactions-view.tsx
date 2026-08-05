"use client";

/**
 * Account-scoped transaction view.
 *
 * When you tap an account card, this component renders its transactions with
 * the account's chosen colour as the accent — header, FAB, and progress all
 * pick it up via CSS custom properties.
 */

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowLeftRight, CreditCard, Plus, Star } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { type Transaction } from "@/lib/budget/types";
import { getWalletBalance, getSpendingSummary } from "@/lib/budget/calculations";
import { getCreditCardStatus, isCreditCard } from "@/lib/budget/credit";
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
import { CONTAINER_WIDTHS } from "@/components/ui/page-container";

type DirectionFilter = "all" | "expense" | "income";

export function AccountTransactionsView({ walletPk }: { walletPk: string }) {
  const { wallets, transactions, allWallets, settings } = useBudget();
  const { byPk } = useCategoryLookup();

  const wallet = wallets.find((w) => w.walletPk === walletPk);
  const accent = wallet?.colour ?? "#4CAF50";

  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

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
    () => getSpendingSummary(allWallets, filtered),
    [allWallets, filtered],
  );
  const grouped = useGroupedByDay(filtered);

  const isPrimary = wallet?.walletPk === settings.primaryWalletPk;

  function openEdit(t: Transaction) {
    setEditing(t);
    setModalOpen(true);
  }

  if (!wallet) {
    return (
      <div className={cn("mx-auto pb-10 pt-5", CONTAINER_WIDTHS.wide)}>
        <EmptyState icon={ArrowLeftRight} title="Account not found" />
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
              <ArrowLeft size={22} strokeWidth={2.4} />
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
        <SearchField value={query} onChange={setQuery} placeholder="Search transactions..." />

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
            icon={ArrowLeftRight}
            title="No transactions found"
            description={
              query
                ? "Try a different search."
                : "No transactions recorded for this account yet."
            }
          />
        ) : (
          <div className="space-y-4">
            {grouped.map(([day, items]) => (
              <div key={day}>
                <div className="mb-1.5 flex items-baseline justify-between px-1">
                  <h3 className="text-footnote font-semibold text-label-secondary">
                    {formatDayHeading(day)}
                  </h3>
                  <Amount
                    value={items.reduce((sum, t) => sum + (t.paid ? t.amount : 0), 0)}
                    colour
                    showSign
                    className="text-caption"
                  />
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
        <Plus size={26} strokeWidth={2.4} />
      </button>

      <TransactionModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        editing={editing}
        defaults={{ walletFk: walletPk }}
      />
    </div>
  );
}
