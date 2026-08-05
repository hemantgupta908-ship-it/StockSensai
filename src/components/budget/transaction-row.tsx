"use client";

/**
 * A single transaction line, shared by every list in the budget environment.
 *
 * Scheduled transactions carry inline pay/skip actions because that is the
 * action users take most often from a list — Cashew surfaces the same controls
 * on its upcoming and subscription rows.
 */

import { Check, Repeat, SkipForward, Clock, ArrowLeftRight } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  TransactionSpecialType,
  type Transaction,
} from "@/lib/budget/types";
import { isOverdue, isTransfer } from "@/lib/budget/calculations";
import { markAsPaid, markAsSkipped } from "@/lib/budget/recurring";
import { newId } from "@/lib/budget/factory";
import { reoccurrenceLabel } from "@/lib/budget/period";
import { useBudget, useCategoryLookup } from "./budget-provider";
import { Amount, CategoryDot } from "./budget-ui";

export function TransactionRow({
  transaction,
  onEdit,
  showAccount,
  showActions = true,
}: {
  transaction: Transaction;
  onEdit?: (t: Transaction) => void;
  showAccount?: boolean;
  showActions?: boolean;
}) {
  const { byPk } = useCategoryLookup();
  const { wallets, settings, upsertTransaction, upsertTransactions } = useBudget();

  const category = byPk.get(transaction.categoryFk);
  const subCategory = transaction.subCategoryFk ? byPk.get(transaction.subCategoryFk) : null;
  const wallet = wallets.find((w) => w.walletPk === transaction.walletFk);
  const overdue = isOverdue(transaction);
  const scheduled =
    transaction.type !== null &&
    transaction.type !== TransactionSpecialType.credit &&
    transaction.type !== TransactionSpecialType.debt;
  const unsettled = scheduled && !transaction.paid && !transaction.skipPaid;
  const transfer = isTransfer(transaction);

  /** Settle the transaction and, if it repeats, write the next instance. */
  function pay() {
    const outcome = markAsPaid(transaction, newId);
    if (outcome.created) upsertTransactions([outcome.updated, outcome.created]);
    else upsertTransaction(outcome.updated);
  }

  function skip() {
    const outcome = markAsSkipped(transaction, newId);
    if (outcome.created) upsertTransactions([outcome.updated, outcome.created]);
    else upsertTransaction(outcome.updated);
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <button
        type="button"
        onClick={() => onEdit?.(transaction)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <CategoryDot
          colour={category?.colour}
          label={category?.name}
          emoji={category?.emojiIconName}
        />

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-subhead text-label">
              {transaction.name || category?.name || "Transaction"}
            </span>
            {transaction.type === TransactionSpecialType.subscription ||
            transaction.type === TransactionSpecialType.repetitive ? (
              <Repeat size={12} className="shrink-0 text-label-secondary/40" />
            ) : null}
            {transfer ? (
              <ArrowLeftRight size={12} className="shrink-0 text-label-secondary/40" />
            ) : null}
          </span>

          <span className="flex items-center gap-1.5 text-caption text-label-secondary/60">
            {overdue ? (
              <span className="flex items-center gap-0.5 font-medium text-red">
                <Clock size={10} /> Overdue
              </span>
            ) : unsettled ? (
              <span className="flex items-center gap-0.5 font-medium text-amber">
                <Clock size={10} /> Upcoming
              </span>
            ) : null}
            {transaction.skipPaid ? <span className="text-label-secondary/50">Skipped</span> : null}
            <span className="truncate">
              {subCategory ? `${category?.name} › ${subCategory.name}` : (category?.name ?? "")}
              {showAccount || settings.accountLabel ? ` · ${wallet?.name ?? ""}` : ""}
              {transaction.reoccurrence !== null && transaction.periodLength !== null
                ? ` · ${reoccurrenceLabel(transaction.reoccurrence, transaction.periodLength)}`
                : ""}
            </span>
          </span>
        </span>

        <Amount
          value={transaction.amount}
          currency={wallet?.currency}
          showSign
          className={cn(
            "shrink-0 text-subhead font-semibold",
            transaction.income ? "text-green" : "text-label",
            unsettled && "opacity-50",
          )}
        />
      </button>

      {showActions && unsettled ? (
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={skip}
            aria-label="Skip"
            className="rounded-full p-1.5 text-label-secondary/50 transition-colors hover:bg-fill/15"
          >
            <SkipForward size={15} />
          </button>
          <button
            type="button"
            onClick={pay}
            aria-label="Mark as paid"
            className="rounded-full bg-green/12 p-1.5 text-green transition-colors hover:bg-green/20"
          >
            <Check size={15} strokeWidth={2.6} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** A card of transaction rows with hairline separators. */
export function TransactionGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-separator/40 overflow-hidden rounded-card bg-bg-secondary">
      {children}
    </div>
  );
}
