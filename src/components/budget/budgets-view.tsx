"use client";

/**
 * Budgets: the list, the per-budget detail with history, and the editor.
 *
 * All figures come from `lib/budget/calculations`, which is a direct port of
 * Cashew's queries — nothing is recomputed differently here.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { PieChart, ChevronRight, History } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  BudgetReoccurence,
  BudgetTransactionFilters,
  type Budget,
} from "@/lib/budget/types";
import {
  getBudgetSnapshot,
  getBudgetSpentByCategory,
  getBudgetTransactions,
  getCategoryLimitAmount,
} from "@/lib/budget/calculations";
import {
  firstDayOfMonth,
  fromDateInputValue,
  getBudgetDate,
  getDatePastToDetermineBudgetDate,
  reoccurrenceLabel,
  toDateInputValue,
} from "@/lib/budget/period";
import { createBudget } from "@/lib/budget/factory";
import { useBudget, useCategoryLookup } from "./budget-provider";
import {
  AddFab,
  Amount,
  Card,
  CategoryDot,
  ConfirmButton,
  EmptyState,
  Field,
  PrimaryButton,
  ProgressBar,
  SearchField,
  SegmentedTabs,
  SelectInput,
  Sheet,
  TextInput,
  Toggle,
} from "./budget-ui";
import { TransactionGroup, TransactionRow } from "./transaction-row";

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export function BudgetsListView() {
  const { budgets } = useBudget();
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);

  const visible = useMemo(
    () =>
      budgets
        .filter((b) => !b.archived)
        .filter((b) => b.name.toLowerCase().includes(query.trim().toLowerCase()))
        .sort((a, b) => a.order - b.order),
    [budgets, query],
  );

  return (
    <>
      {budgets.length > 3 ? (
        <SearchField value={query} onChange={setQuery} placeholder="Search budgets..." />
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          icon={PieChart}
          title="No budgets found"
          description="A budget sets a planned limit for spending or saving within a period."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {visible.map((budget) => (
            <BudgetCard key={budget.budgetPk} budget={budget} />
          ))}
        </div>
      )}

      <AddFab onClick={() => setEditorOpen(true)} label="Add budget" />
      <BudgetEditor open={editorOpen} onClose={() => setEditorOpen(false)} />
    </>
  );
}

/** Summary card: spent, remaining, progress and the period label. */
export function BudgetCard({ budget, compact = false }: { budget: Budget; compact?: boolean }) {
  const { transactions, categories, allWallets } = useBudget();

  const snapshot = useMemo(
    () => getBudgetSnapshot(allWallets, transactions, budget, categories),
    [allWallets, transactions, budget, categories],
  );

  const over = snapshot.spent > budget.amount;

  return (
    <Card href={`/budget/budgets/${budget.budgetPk}`} className="!p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-headline text-label">{budget.name}</p>
          <p className="text-caption text-label-secondary/60">
            {reoccurrenceLabel(budget.reoccurrence, budget.periodLength)} ·{" "}
            {snapshot.range.start.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} –{" "}
            {snapshot.range.end.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </p>
        </div>
        <ChevronRight size={18} className="mt-1 shrink-0 text-label-secondary/30" />
      </div>

      <ProgressBar percent={snapshot.percent} colour={budget.colour} className="mb-2" />

      <div className="flex items-baseline justify-between gap-2">
        <p className="text-footnote text-label-secondary">
          <Amount value={snapshot.spent} className="font-semibold text-label" /> of{" "}
          <Amount value={budget.amount} /> {budget.income ? "saved" : "spent"}
        </p>
        <p className={cn("text-footnote font-semibold", over ? "text-red" : "text-green")}>
          {over ? (
            <>
              <Amount value={Math.abs(snapshot.remaining)} /> over
            </>
          ) : (
            <>
              <Amount value={snapshot.remaining} /> left
            </>
          )}
        </p>
      </div>

      {!compact && snapshot.daysRemaining > 0 && !over ? (
        <p className="mt-1 text-caption text-label-secondary/50">
          You can spend <Amount value={snapshot.perDayRemaining} /> a day for the next{" "}
          {snapshot.daysRemaining} day{snapshot.daysRemaining === 1 ? "" : "s"}
        </p>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export function BudgetDetailView({ budgetPk }: { budgetPk: string }) {
  const { budgets, transactions, categories, categoryBudgetLimits, allWallets, deleteBudget } =
    useBudget();
  const { byPk } = useCategoryLookup();
  const [periodIndex, setPeriodIndex] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);

  const budget = budgets.find((b) => b.budgetPk === budgetPk);

  const view = useMemo(() => {
    if (!budget) return null;
    const probe = getDatePastToDetermineBudgetDate(periodIndex, budget);
    const range = getBudgetDate(budget, probe);
    const members = getBudgetTransactions(transactions, budget, range, categories);
    const spent = members.reduce((sum, t) => sum + t.amount, 0) * (budget.income ? 1 : -1);
    const byCategory = getBudgetSpentByCategory(allWallets, transactions, budget, range, categories);
    return { range, members, spent, byCategory };
  }, [budget, periodIndex, transactions, categories, allWallets]);

  if (!budget || !view) {
    return <EmptyState icon={PieChart} title="Budget not found" />;
  }

  const percent = budget.amount === 0 ? 0 : view.spent / budget.amount;
  const remaining = budget.amount - view.spent;
  const isCurrent = periodIndex === 0;

  return (
    <>
      <Card className="mb-4 text-center">
        <p className="text-caption uppercase tracking-wide text-label-secondary/50">
          {view.range.start.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} –{" "}
          {view.range.end.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
        <p className="my-2">
          <Amount value={view.spent} className="text-largetitle font-semibold" />
          <span className="block text-footnote text-label-secondary/60">
            of <Amount value={budget.amount} /> {budget.income ? "saved" : "spent"}
          </span>
        </p>
        <ProgressBar percent={percent} colour={budget.colour} height={12} className="my-3" />
        <p className={cn("text-subhead font-semibold", remaining < 0 ? "text-red" : "text-green")}>
          {remaining < 0 ? (
            <>
              <Amount value={Math.abs(remaining)} /> over budget
            </>
          ) : (
            <>
              <Amount value={remaining} /> remaining
            </>
          )}
        </p>
      </Card>

      {/* Period paging — index 0 is the current period, higher is further back. */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setPeriodIndex((i) => i + 1)}
          className="flex items-center gap-1 rounded-ios bg-fill/10 px-3 py-2 text-footnote text-label-secondary transition-colors hover:bg-fill/20"
        >
          <History size={14} /> Previous period
        </button>
        <button
          type="button"
          onClick={() => setPeriodIndex((i) => Math.max(0, i - 1))}
          disabled={isCurrent}
          className="rounded-ios bg-fill/10 px-3 py-2 text-footnote text-label-secondary transition-colors hover:bg-fill/20 disabled:opacity-30"
        >
          Next period
        </button>
      </div>

      {view.byCategory.size > 0 ? (
        <section className="mb-5">
          <h2 className="mb-2 px-1 text-footnote font-semibold uppercase tracking-wide text-label-secondary/60">
            By category
          </h2>
          <Card className="space-y-3">
            {[...view.byCategory.entries()].map(([categoryPk, value]) => {
              const category = byPk.get(categoryPk);
              const limit = getCategoryLimitAmount(budget, categoryBudgetLimits, categoryPk);
              const share = budget.amount === 0 ? 0 : value / budget.amount;
              return (
                <div key={categoryPk} className="flex items-center gap-3">
                  <CategoryDot colour={category?.colour} label={category?.name} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2">
                      <span className="truncate text-footnote text-label">
                        {category?.name ?? "Uncategorised"}
                      </span>
                      <Amount value={value} className="text-footnote font-medium" />
                    </div>
                    <ProgressBar
                      percent={limit ? value / limit : share}
                      colour={category?.colour}
                      height={5}
                      className="mt-1"
                    />
                    {limit ? (
                      <span className="text-caption2 text-label-secondary/50">
                        limit <Amount value={limit} />
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </Card>
        </section>
      ) : null}

      <section className="mb-5">
        <h2 className="mb-2 px-1 text-footnote font-semibold uppercase tracking-wide text-label-secondary/60">
          Transactions ({view.members.length})
        </h2>
        {view.members.length === 0 ? (
          <EmptyState icon={PieChart} title="Nothing in this period yet" />
        ) : (
          <TransactionGroup>
            {[...view.members]
              .sort((a, b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime())
              .map((t) => (
                <TransactionRow key={t.transactionPk} transaction={t} showActions={false} />
              ))}
          </TransactionGroup>
        )}
      </section>

      <div className="space-y-2">
        <PrimaryButton onClick={() => setEditorOpen(true)}>Edit Budget</PrimaryButton>
        <ConfirmButton
          idleLabel="Delete Budget"
          confirmLabel="Tap again — transactions are kept"
          onConfirm={() => {
            deleteBudget(budget.budgetPk);
            window.location.href = "/budget/budgets";
          }}
        />
      </div>

      <BudgetEditor open={editorOpen} onClose={() => setEditorOpen(false)} editing={budget} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

export function BudgetEditor({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing?: Budget;
}) {
  const { categories, wallets, upsertBudget, budgets } = useBudget();

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [income, setIncome] = useState(false);
  const [reoccurrence, setReoccurrence] = useState(String(BudgetReoccurence.monthly));
  const [periodLength, setPeriodLength] = useState("1");
  const [startDate, setStartDate] = useState(() => toDateInputValue(new Date()));
  const [addedOnly, setAddedOnly] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedWallets, setSelectedWallets] = useState<string[]>([]);
  const [filters, setFilters] = useState<BudgetTransactionFilters[]>([]);
  const [pinned, setPinned] = useState(true);

  // Load the record being edited whenever the sheet opens.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const key = editing?.budgetPk ?? "new";
  if (open && loadedFor !== key) {
    setLoadedFor(key);
    if (editing) {
      setName(editing.name);
      setAmount(String(editing.amount));
      setIncome(editing.income);
      setReoccurrence(String(editing.reoccurrence ?? BudgetReoccurence.monthly));
      setPeriodLength(String(editing.periodLength));
      setStartDate(toDateInputValue(new Date(editing.startDate)));
      setAddedOnly(editing.addedTransactionsOnly);
      setSelectedCategories(editing.categoryFks ?? []);
      setSelectedWallets(editing.walletFks ?? []);
      setFilters(editing.budgetTransactionFilters ?? []);
      setPinned(editing.pinned);
    } else {
      setName("");
      setAmount("");
      setIncome(false);
      setReoccurrence(String(BudgetReoccurence.monthly));
      setPeriodLength("1");
      setStartDate(toDateInputValue(firstDayOfMonth(new Date())));
      setAddedOnly(false);
      setSelectedCategories([]);
      setSelectedWallets([]);
      setFilters([]);
      setPinned(true);
    }
  }
  if (!open && loadedFor !== null) setLoadedFor(null);

  function toggleFilter(filter: BudgetTransactionFilters) {
    setFilters((current) =>
      current.includes(filter) ? current.filter((f) => f !== filter) : [...current, filter],
    );
  }

  function handleSave() {
    const base = editing ?? createBudget();
    const start = fromDateInputValue(startDate);
    upsertBudget({
      ...base,
      name: name.trim() || "Budget",
      amount: Number(amount) || 0,
      income,
      reoccurrence: Number(reoccurrence) as BudgetReoccurence,
      periodLength: Number(periodLength) || 1,
      startDate: start.toISOString(),
      endDate: base.endDate,
      addedTransactionsOnly: addedOnly,
      categoryFks: selectedCategories.length > 0 ? selectedCategories : null,
      walletFks: selectedWallets.length > 0 ? selectedWallets : null,
      budgetTransactionFilters: filters,
      pinned,
      order: editing?.order ?? budgets.length,
    });
    onClose();
  }

  const relevantCategories = categories.filter((c) => c.income === income && c.categoryPk !== "0");

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Edit Budget" : "Create Budget"}
      footer={
        <PrimaryButton onClick={handleSave} disabled={!name.trim() || !Number(amount)}>
          {editing ? "Save Changes" : "Create Budget"}
        </PrimaryButton>
      }
    >
      <SegmentedTabs
        className="mb-4"
        value={income ? "savings" : "expense"}
        onChange={(v) => {
          setIncome(v === "savings");
          setSelectedCategories([]);
        }}
        options={[
          { value: "expense", label: "Expense budget" },
          { value: "savings", label: "Savings budget" },
        ]}
      />
      <p className="mb-4 text-caption text-label-secondary/60">
        {income
          ? "Track your income and budget your savings. Income transactions are included automatically."
          : "Track your expenses and budget your spending. Expense transactions are included automatically."}
      </p>

      <Field label="Name">
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Monthly Spending"
        />
      </Field>

      <Field label="Amount">
        <TextInput
          type="number"
          inputMode="decimal"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Every">
          <TextInput
            type="number"
            min="1"
            value={periodLength}
            onChange={(e) => setPeriodLength(e.target.value)}
          />
        </Field>
        <Field label="Period">
          <SelectInput value={reoccurrence} onChange={(e) => setReoccurrence(e.target.value)}>
            <option value={BudgetReoccurence.daily}>Days</option>
            <option value={BudgetReoccurence.weekly}>Weeks</option>
            <option value={BudgetReoccurence.monthly}>Months</option>
            <option value={BudgetReoccurence.yearly}>Years</option>
            <option value={BudgetReoccurence.custom}>Custom (fixed dates)</option>
          </SelectInput>
        </Field>
      </div>

      <Field
        label="Starts on"
        hint="The period resets from this date — a 15th start means the 15th to the 14th."
      >
        <TextInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </Field>

      <div className="mb-3 border-t border-separator/40 pt-2">
        <Toggle
          checked={addedOnly}
          onChange={setAddedOnly}
          label="Added transactions only"
          description="Only include transactions you explicitly add to this budget."
        />
        <Toggle checked={pinned} onChange={setPinned} label="Show on home page" />
      </div>

      {!addedOnly ? (
        <>
          <Field label="Categories" hint="Leave empty to include every category.">
            <div className="flex flex-wrap gap-1.5">
              {relevantCategories.map((c) => {
                const active = selectedCategories.includes(c.categoryPk);
                return (
                  <button
                    key={c.categoryPk}
                    type="button"
                    onClick={() =>
                      setSelectedCategories((current) =>
                        active
                          ? current.filter((pk) => pk !== c.categoryPk)
                          : [...current, c.categoryPk],
                      )
                    }
                    className={cn(
                      "rounded-full px-3 py-1.5 text-caption transition-colors",
                      active ? "bg-green text-white" : "bg-fill/10 text-label-secondary",
                    )}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Accounts" hint="Leave empty to include every account.">
            <div className="flex flex-wrap gap-1.5">
              {wallets.map((w) => {
                const active = selectedWallets.includes(w.walletPk);
                return (
                  <button
                    key={w.walletPk}
                    type="button"
                    onClick={() =>
                      setSelectedWallets((current) =>
                        active ? current.filter((pk) => pk !== w.walletPk) : [...current, w.walletPk],
                      )
                    }
                    className={cn(
                      "rounded-full px-3 py-1.5 text-caption transition-colors",
                      active ? "bg-green text-white" : "bg-fill/10 text-label-secondary",
                    )}
                  >
                    {w.name}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="border-t border-separator/40 pt-2">
            <p className="mb-1 text-footnote font-medium text-label-secondary">Also include</p>
            <Toggle
              checked={filters.includes(BudgetTransactionFilters.includeIncome)}
              onChange={() => toggleFilter(BudgetTransactionFilters.includeIncome)}
              label={income ? "Expense transactions" : "Income transactions"}
            />
            <Toggle
              checked={filters.includes(BudgetTransactionFilters.includeDebtAndCredit)}
              onChange={() => toggleFilter(BudgetTransactionFilters.includeDebtAndCredit)}
              label="Lent and borrowed"
              description="Lent and borrowed transactions will be included in the budget."
            />
            <Toggle
              checked={filters.includes(BudgetTransactionFilters.includeBalanceCorrection)}
              onChange={() => toggleFilter(BudgetTransactionFilters.includeBalanceCorrection)}
              label="Balance correction"
              description="Include account transfers and correction transactions."
            />
            <Toggle
              checked={filters.includes(BudgetTransactionFilters.addedToOtherBudget)}
              onChange={() => toggleFilter(BudgetTransactionFilters.addedToOtherBudget)}
              label="Added to other budgets"
            />
            <Toggle
              checked={filters.includes(BudgetTransactionFilters.addedToObjective)}
              onChange={() => toggleFilter(BudgetTransactionFilters.addedToObjective)}
              label="Added to a goal"
            />
          </div>
        </>
      ) : (
        <p className="rounded-ios bg-fill/10 px-3 py-2 text-caption text-label-secondary/70">
          This budget will only include transactions that have been added to it.
        </p>
      )}
    </Sheet>
  );
}

/** Pinned budgets, for the home screen. */
export function PinnedBudgets() {
  const { budgets } = useBudget();
  const pinned = budgets.filter((b) => b.pinned && !b.archived).sort((a, b) => a.order - b.order);

  if (pinned.length === 0) {
    return (
      <Link
        href="/budget/budgets"
        className="flex items-center gap-3 rounded-[18px] bg-bg-secondary p-4 shadow-sm ring-1 ring-black/5 transition-transform active:scale-[0.98] dark:ring-white/10"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fill/5 text-label-secondary">
          <PieChart size={20} />
        </div>
        <div className="flex-1">
          <span className="block text-subhead font-medium text-label">Create a budget</span>
          <span className="block text-caption text-label-secondary/60">
            Set a planned limit for your spending
          </span>
        </div>
        <ChevronRight size={18} className="text-label-secondary/30" />
      </Link>
    );
  }

  return (
    <div className="space-y-3">
      {pinned.map((b) => (
        <BudgetCard key={b.budgetPk} budget={b} compact />
      ))}
    </div>
  );
}
