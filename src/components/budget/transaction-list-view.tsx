"use client";

/**
 * The full transactions list: search, filters, day grouping and a running
 * summary for whatever the current filter selects.
 */

import { useMemo, useState } from "react";
import { ArrowsLeftRight, SlidersHorizontal } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { TransactionSpecialType, type Transaction } from "@/lib/budget/types";
import { getSpendingSummary } from "@/lib/budget/calculations";
import { useBudget, useCategoryLookup } from "./budget-provider";
import {
  Amount,
  AddFab,
  Card,
  EmptyState,
  SearchField,
  SegmentedTabs,
  SelectInput,
  formatDayHeading,
  useGroupedByDay,
} from "./budget-ui";
import { TransactionGroup, TransactionRow } from "./transaction-row";
import { TransactionModal } from "./transaction-modal";

type DirectionFilter = "all" | "expense" | "income";

export function TransactionListView() {
  const { transactions, categories, wallets, allWallets, settings, objectives } = useBudget();
  const { byPk } = useCategoryLookup();

  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [categoryFk, setCategoryFk] = useState("");
  const [walletFk, setWalletFk] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [displayLimit, setDisplayLimit] = useState(100);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = transactions.filter((t) => {
      if (direction === "expense" && t.income) return false;
      if (direction === "income" && !t.income) return false;
      if (categoryFk && t.categoryFk !== categoryFk && t.subCategoryFk !== categoryFk) return false;
      if (walletFk && t.walletFk !== walletFk) return false;
      
      // In the global "All" view, transfers appear twice (once for each account).
      // Filter out the income half to show a single unified row.
      if (!walletFk && direction === "all" && t.pairedTransactionFk && t.income) return false;
      
      if (!needle) return true;
      const category = byPk.get(t.categoryFk)?.name ?? "";
      return (
        t.name.toLowerCase().includes(needle) ||
        t.note.toLowerCase().includes(needle) ||
        category.toLowerCase().includes(needle) ||
        String(Math.abs(t.amount)).includes(needle)
      );
    });

    switch (settings.sortTransactions) {
      case "date-oldest":
        list = list.sort(
          (a, b) => new Date(a.dateCreated).getTime() - new Date(b.dateCreated).getTime(),
        );
        break;
      case "amount-highest":
        list = list.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
        break;
      case "amount-lowest":
        list = list.sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount));
        break;
      default:
        list = list.sort(
          (a, b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime(),
        );
    }
    return list;
  }, [transactions, query, direction, categoryFk, walletFk, byPk, settings.sortTransactions]);

  const displayed = useMemo(() => filtered.slice(0, displayLimit), [filtered, displayLimit]);

  const summary = useMemo(
    () => getSpendingSummary(allWallets, displayed, objectives),
    [allWallets, displayed, objectives],
  );
  const grouped = useGroupedByDay(displayed);
  const filtersActive = Boolean(categoryFk || walletFk);

  function openEdit(t: Transaction) {
    setEditing(t);
    setModalOpen(true);
  }

  return (
    <>
      <SearchField value={query} onChange={setQuery} placeholder="Search transactions..." />

      <div className="mb-3 flex items-center gap-2">
        <SegmentedTabs
          className="flex-1"
          value={direction}
          onChange={setDirection}
          options={[
            { value: "all", label: "All" },
            { value: "expense", label: "Expense" },
            { value: "income", label: "Income" },
          ]}
        />
        <button
          type="button"
          onClick={() => setShowFilters((s) => !s)}
          aria-label="Filters"
          className={cn(
            "rounded-ios p-2.5 transition-colors",
            filtersActive || showFilters
              ? "bg-green/12 text-green"
              : "bg-fill/10 text-label-secondary/60",
          )}
        >
          <SlidersHorizontal size={17} />
        </button>
      </div>

      {showFilters ? (
        <div className="mb-3 grid grid-cols-2 gap-2 rounded-card bg-bg-secondary p-3">
          <label className="block">
            <span className="mb-1 block text-caption text-label-secondary/60">Category</span>
            <SelectInput value={categoryFk} onChange={(e) => setCategoryFk(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.categoryPk} value={c.categoryPk}>
                  {c.name}
                </option>
              ))}
            </SelectInput>
          </label>
          <label className="block">
            <span className="mb-1 block text-caption text-label-secondary/60">Account</span>
            <SelectInput value={walletFk} onChange={(e) => setWalletFk(e.target.value)}>
              <option value="">All accounts</option>
              {wallets.map((w) => (
                <option key={w.walletPk} value={w.walletPk}>
                  {w.name}
                </option>
              ))}
            </SelectInput>
          </label>
        </div>
      ) : null}

      <Card className="mb-4 !p-3">
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

      {filtered.length === 0 ? (
        <EmptyState
          icon={ArrowsLeftRight}
          title="No transactions found"
          description={
            query || filtersActive
              ? "Try a different search or clear your filters."
              : "Add your first transaction to get started."
          }
        />
      ) : (
        <div className="space-y-4">
          {settings.transactionsGroupedByDay ? (
            grouped.map(([day, items]) => (
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
            ))
          ) : (
            <TransactionGroup>
              {displayed.map((t) => (
                <TransactionRow key={t.transactionPk} transaction={t} onEdit={openEdit} />
              ))}
            </TransactionGroup>
          )}

          {filtered.length > displayLimit ? (
            <div className="pt-4 pb-12 text-center">
              <button
                onClick={() => setDisplayLimit((l) => l + 100)}
                className="rounded-full bg-fill/5 px-6 py-2.5 text-footnote font-medium text-label-secondary transition-colors hover:bg-fill/10 active:scale-95"
              >
                Load more ({filtered.length - displayLimit} remaining)
              </button>
            </div>
          ) : null}
        </div>
      )}

      <AddFab
        onClick={() => {
          setEditing(null);
          setModalOpen(true);
        }}
        label="Add transaction"
      />
      <TransactionModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        editing={editing}
      />
    </>
  );
}

/** Compact recent-transactions block for the home screen. */
export function RecentTransactions({ limit = 8 }: { limit?: number }) {
  const { transactions } = useBudget();
  const [editing, setEditing] = useState<Transaction | null>(null);

  const recent = useMemo(
    () =>
      [...transactions]
        .filter((t) => t.type !== TransactionSpecialType.upcoming || t.paid)
        .sort((a, b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime())
        .slice(0, limit),
    [transactions, limit],
  );

  if (recent.length === 0) {
    return (
      <EmptyState
        icon={ArrowsLeftRight}
        title="No transactions yet"
        description="Tap the + button to record your first one."
      />
    );
  }

  return (
    <>
      <TransactionGroup>
        {recent.map((t) => (
          <TransactionRow key={t.transactionPk} transaction={t} onEdit={setEditing} showAccount />
        ))}
      </TransactionGroup>
      <TransactionModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        editing={editing}
      />
    </>
  );
}
