"use client";
import { useShallow } from "zustand/react/shallow";

/**
 * A single transaction line, shared by every list in the budget environment.
 *
 * Scheduled transactions carry inline pay/skip actions because that is the
 * action users take most often from a list — Cashew surfaces the same controls
 * on its upcoming and subscription rows.
 */

import { ArrowsLeftRight, Check, Clock, Repeat, SkipForward } from "@phosphor-icons/react";

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
  showDate = false,
  showActions = true,
}: {
  transaction: Transaction;
  onEdit?: (t: Transaction) => void;
  showAccount?: boolean;
  showDate?: boolean;
  showActions?: boolean;
}) {
  const { byPk } = useCategoryLookup();
  const { wallets, settings, upsertTransaction, upsertTransactions, objectives  } = useBudget(useShallow((s) => ({ wallets: s.wallets, settings: s.settings, upsertTransaction: s.upsertTransaction, upsertTransactions: s.upsertTransactions, objectives: s.objectives })));

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

  let amountColor = transaction.income ? "text-green" : "text-red";
  if (transfer) {
    amountColor = "text-label";
  } else if (transaction.objectiveLoanFk) {
    const loan = objectives.find((o) => o.objectivePk === transaction.objectiveLoanFk);
    if (loan) {
      if (loan.income === true && transaction.income === false) {
        // Paying borrowed loan (counts as expense) -> standard expense color
        amountColor = "text-red";
      } else if (loan.income === false && transaction.income === false) {
        // Lent money (disbursement, excluded) -> purple
        amountColor = "text-purple";
      } else if (loan.income === false && transaction.income === true) {
        // Collected money (repayment, excluded) -> blue
        amountColor = "text-blue";
      } else if (loan.income === true && transaction.income === true) {
        // Borrowed money received (disbursement, excluded) -> teal
        amountColor = "text-teal";
      }
    }
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
          // Without this the dot always fell through to the category's first
          // letter, even where an icon was set.
          iconName={category?.iconName}
        />

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-subhead text-label">
              {(() => {
                const raw = transaction.name || category?.name || "Transaction";
                return raw === "Cycle Payment" ? "Card Payment" : raw;
              })()}
            </span>
            {transaction.type === TransactionSpecialType.subscription ||
            transaction.type === TransactionSpecialType.repetitive ? (
              <Repeat size={12} className="shrink-0 text-label-secondary/40" />
            ) : null}
            {transfer ? (
              <ArrowsLeftRight size={12} className="shrink-0 text-label-secondary/40" />
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
              {showDate ? `${new Date(transaction.dateCreated).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · ` : ""}
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
            amountColor,
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
            className="rounded-full bg-accent/15 p-1.5 text-accent transition-colors hover:bg-accent/20"
          >
            <Check size={15} />
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
