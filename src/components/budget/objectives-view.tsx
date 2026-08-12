"use client";
import { useShallow } from "zustand/react/shallow";

/**
 * Goals and loans. Both are Cashew `Objective` rows differing only by `type`,
 * so one component serves both with the copy switched.
 *
 * The distinction that matters for the maths: goals accumulate through
 * `objectiveFk`, loans through `objectiveLoanFk`, and a loan with amount −1 is
 * "indefinite" — it has no target, it just tracks a running balance.
 */

import { useMemo, useState } from "react";
import { CaretDown, CaretRight, CreditCard, Flag, PencilSimple, Plus } from "@phosphor-icons/react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import {
  BALANCE_CORRECTION_CATEGORY_PK,
  ObjectiveType,
  TRANSFER_CATEGORY_PK,
  TransactionSpecialType,
  type Objective,
  type Transaction,
} from "@/lib/budget/types";
import {
  getIndefiniteLoanBalance,
  getObjectivePercentageComplete,
  getTotalTowardsObjective,
  isIndefiniteLoan,
} from "@/lib/budget/calculations";
import { createObjective, createTransaction } from "@/lib/budget/factory";
import { ColourPicker, IconBadge, IconPicker } from "./icon-picker";
import {
  atMidday,
  fromDateInputValue,
  monthlySchedule,
  toDateInputValue,
} from "@/lib/budget/period";
import { useBudget } from "./budget-provider";
import {
  AddFab,
  Amount,
  Card,
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
import { CategorySelect } from "./category-select";
import { TransactionGroup, TransactionRow } from "./transaction-row";
import { TransactionModal } from "./transaction-modal";

export function ObjectivesView({ type }: { type: ObjectiveType }) {
  const { objectives, transactions, allWallets  } = useBudget(useShallow((s) => ({ objectives: s.objectives, transactions: s.transactions, allWallets: s.allWallets })));
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Objective | null>(null);
  const [statusFilter, setStatusFilter] = useState<"active" | "closed">("active");

  const isLoan = type === ObjectiveType.loan;

  const visible = useMemo(
    () =>
      objectives
        .filter((o) => o.type === type && !o.archived)
        .filter((o) => {
          const indefinite = isIndefiniteLoan(o);
          const percent = getObjectivePercentageComplete(allWallets, transactions, o);
          const isClosed = !indefinite && percent >= 1;
          return statusFilter === "closed" ? isClosed : !isClosed;
        })
        .filter((o) => o.name.toLowerCase().includes(query.trim().toLowerCase()))
        .sort((a, b) => a.order - b.order),
    [objectives, type, query, statusFilter, allWallets, transactions],
  );

  return (
    <>
      <div className="mb-4 flex flex-col gap-3">
        <SegmentedTabs
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as "active" | "closed")}
          options={[
            { value: "active", label: "Active" },
            { value: "closed", label: "Closed" },
          ]}
        />
        {objectives.filter((o) => o.type === type).length > 3 ? (
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder={isLoan ? "Search loans..." : "Search goals..."}
          />
        ) : null}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={isLoan ? CreditCard : Flag}
          title={isLoan ? "No loans found" : "No goals found"}
          description={
            isLoan
              ? "Loans help you track lent or borrowed money. A long-term loan's balance changes with the transactions added to it."
              : "A goal is a target amount to save or spend over time. Transactions added to it contribute to its progress."
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visible.map((objective) => (
            <ObjectiveCard
              key={objective.objectivePk}
              objective={objective}
              onEdit={() => {
                setEditing(objective);
                setEditorOpen(true);
              }}
            />
          ))}
        </div>
      )}

      <AddFab
        onClick={() => {
          setEditing(null);
          setEditorOpen(true);
        }}
        label={isLoan ? "Add loan" : "Add goal"}
      />
      <ObjectiveEditor
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
        }}
        type={type}
        editing={editing}
      />
    </>
  );
}

/** 1 → "1st", 22 → "22nd". The 11–13 exception is why this is not a lookup. */
function ordinal(day: number): string {
  const suffix =
    day % 100 >= 11 && day % 100 <= 13
      ? "th"
      : day % 10 === 1
        ? "st"
        : day % 10 === 2
          ? "nd"
          : day % 10 === 3
            ? "rd"
            : "th";
  return `${day}${suffix}`;
}

export function ObjectiveCard({
  objective,
  onEdit,
  compact = false,
}: {
  objective: Objective;
  onEdit?: () => void;
  compact?: boolean;
}) {
  const { transactions, allWallets  } = useBudget(useShallow((s) => ({ transactions: s.transactions, allWallets: s.allWallets })));
  const [expanded, setExpanded] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  const indefinite = isIndefiniteLoan(objective);
  const isLoan = objective.type === ObjectiveType.loan;

  const total = useMemo(
    () =>
      indefinite
        ? getIndefiniteLoanBalance(allWallets, transactions, objective)
        : getTotalTowardsObjective(allWallets, transactions, objective),
    [allWallets, transactions, objective, indefinite],
  );
  const percent = useMemo(
    () => (indefinite ? 0 : getObjectivePercentageComplete(allWallets, transactions, objective)),
    [allWallets, transactions, objective, indefinite],
  );

  const members = useMemo(
    () =>
      transactions
        .filter((t) =>
          isLoan
            ? t.objectiveLoanFk === objective.objectivePk
            : t.objectiveFk === objective.objectivePk,
        )
        .sort((a, b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime()),
    [transactions, objective, isLoan],
  );

  const reached = !indefinite && percent >= 1;
  const overdue =
    objective.endDate !== null && !reached && new Date(objective.endDate).getTime() < Date.now();

  return (
    <>
      <Card className="group relative overflow-hidden rounded-2xl border border-separator/40 bg-bg-secondary p-5 shadow-card hover:shadow-md hover:border-accent/30 transition-all duration-200">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="w-full text-left focus:outline-none"
        >
          {/* Header row */}
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <IconBadge
                  iconName={objective.iconName}
                  colour={objective.colour}
                  size={32}
                  fallback={objective.name}
                />
                <h3 className="truncate text-base sm:text-lg font-bold text-label group-hover:text-accent transition-colors">
                  {objective.emojiIconName ? `${objective.emojiIconName} ` : ""}
                  {objective.name}
                </h3>
              </div>
              <p className="mt-1 text-xs text-label-secondary/60 font-medium">
                {[
                  indefinite
                    ? "Ongoing loan"
                    : objective.endDate
                      ? `Due ${new Date(objective.endDate).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}`
                      : isLoan
                        ? "Long-term loan"
                        : objective.income
                          ? "Savings goal"
                          : "Spending goal",
                  objective.paymentDayOfMonth
                    ? `Pay on the ${ordinal(objective.paymentDayOfMonth)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            {reached ? (
              <span className="shrink-0 rounded-full bg-green/15 px-2.5 py-1 text-xs font-bold text-green border border-green/20">
                {isLoan ? "Accomplished" : "Reached"}
              </span>
            ) : overdue ? (
              <span className="shrink-0 rounded-full bg-red/15 px-2.5 py-1 text-xs font-bold text-red border border-red/20 animate-pulse">
                Overdue
              </span>
            ) : null}
          </div>

          {indefinite ? (
            <div className="mt-2 rounded-xl bg-fill/5 p-3">
              <p className="text-title3 font-bold text-label">
                <Amount value={total} colour showSign />
                <span className="ml-1.5 text-xs font-medium text-label-secondary/70">
                  {total >= 0 ? "owed to you" : "you owe"}
                </span>
              </p>
            </div>
          ) : (
            <div className="mt-3 space-y-2.5">
              {/* Stat grid */}
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-label-secondary/50">
                    {isLoan ? "Amount Paid" : "Total Saved"}
                  </p>
                  <p className="text-subhead font-bold text-label mt-0.5">
                    <Amount value={total} className="text-label font-bold" />
                    <span className="text-xs font-normal text-label-secondary/60"> / </span>
                    <Amount value={objective.amount} className="text-xs font-semibold text-label-secondary/80" />
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center rounded-lg bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent">
                    {Math.round(percent * 100)}%
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <ProgressBar percent={percent} colour={objective.colour} height={9} className="my-1.5 bg-fill/10" />

              {/* Bottom remaining detail */}
              {!reached ? (
                <div className="flex items-center justify-between text-xs text-label-secondary/70 pt-0.5">
                  <span>Remaining</span>
                  <span className="font-semibold text-label">
                    <Amount value={objective.amount - total} /> {isLoan ? "left to pay" : "to reach goal"}
                  </span>
                </div>
              ) : null}
            </div>
          )}

          {/* Expand indicator hint */}
          <div className="mt-3 flex items-center justify-center pt-2 border-t border-separator/20 text-[11px] font-semibold text-label-secondary/40 group-hover:text-label-secondary/70 transition-colors">
            <span>{expanded ? "Hide history & actions" : "Tap for history & actions"}</span>
            <CaretDown size={14} className={cn("ml-1 transition-transform duration-200", expanded && "rotate-180")} />
          </div>
        </button>

        {expanded ? (
          <div className="mt-3 border-t border-separator/30 pt-3 space-y-3">
            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent text-accent-fg py-2 px-3 text-xs font-semibold shadow-sm hover:bg-accent/90 transition-all active:scale-[0.98]"
              >
                <Plus size={15} weight="bold" />
                {isLoan ? "Record Payment" : "Add Contribution"}
              </button>
              {onEdit ? (
                <button
                  type="button"
                  onClick={onEdit}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-fill/10 py-2 px-3.5 text-xs font-semibold text-label-secondary hover:bg-fill/15 transition-all active:scale-[0.98]"
                >
                  <PencilSimple size={15} weight="bold" />
                  Edit
                </button>
              ) : null}
            </div>

            {/* Transaction history box */}
            <div className="rounded-xl bg-fill/5 border border-separator/30 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-label-secondary/70 px-1">
                <span>Recent History ({members.length})</span>
              </div>
              {members.length === 0 ? (
                <p className="py-2 text-center text-xs text-label-secondary/50">
                  No payments recorded yet.
                </p>
              ) : (
                <div className="-mx-3 -mb-3">
                  <TransactionGroup>
                    {members.slice(0, 10).map((t) => (
                      <TransactionRow key={t.transactionPk} transaction={t} onEdit={setEditingTx} showAccount showDate />
                    ))}
                  </TransactionGroup>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Card>

      <TransactionModal
        open={addOpen || editingTx !== null}
        onClose={() => {
          setAddOpen(false);
          setEditingTx(null);
        }}
        editing={editingTx}
        defaults={
          isLoan
            ? {
                objectiveLoanFk: objective.objectivePk,
                income: members.length === 0 ? objective.income : !objective.income,
              }
            : { objectiveFk: objective.objectivePk, income: objective.income }
        }
      />
    </>
  );
}

function ObjectiveEditor({
  open,
  onClose,
  type,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  type: ObjectiveType;
  editing?: Objective | null;
}) {
  const { objectives, categories, allWallets, upsertObjective, upsertTransactions, deleteObjective  } = useBudget(useShallow((s) => ({ objectives: s.objectives, categories: s.categories, allWallets: s.allWallets, upsertObjective: s.upsertObjective, upsertTransactions: s.upsertTransactions, deleteObjective: s.deleteObjective })));
  const isLoan = type === ObjectiveType.loan;

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");

  // Back-fill for a loan already part-way through. Either one lump sum, or a
  // regular monthly payment expanded into one transaction per month.
  const [backfill, setBackfill] = useState(false);
  const [backfillMode, setBackfillMode] = useState<"lump" | "monthly">("monthly");
  const [alreadyPaid, setAlreadyPaid] = useState("");
  const [lumpDate, setLumpDate] = useState("");
  const [emiAmount, setEmiAmount] = useState("");
  const [emiStart, setEmiStart] = useState("");
  const [emiCount, setEmiCount] = useState("");
  const [backfillCategory, setBackfillCategory] = useState("");
  const [backfillHitsAccount, setBackfillHitsAccount] = useState(false);
  const [backfillWallet, setBackfillWallet] = useState("");
  const [income, setIncome] = useState(true);
  const [endDate, setEndDate] = useState("");
  const [paymentDay, setPaymentDay] = useState("");
  const [indefinite, setIndefinite] = useState(false);
  const [pinned, setPinned] = useState(true);
  const [iconName, setIconName] = useState<string | null>(null);
  const [colour, setColour] = useState<string | null>(null);
  const [initialWalletFk, setInitialWalletFk] = useState("");
  const [initialWalletDate, setInitialWalletDate] = useState("");

  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const key = editing?.objectivePk ?? "new";
  if (open && loadedFor !== key) {
    setLoadedFor(key);
    // Back-fill is an action, not a stored property: it always starts empty so
    // reopening the editor cannot silently re-add the same payments.
    setBackfill(false);
    setBackfillMode("monthly");
    setAlreadyPaid("");
    setLumpDate(toDateInputValue(new Date()));
    setEmiAmount("");
    setEmiStart("");
    setEmiCount("");
    setBackfillCategory("");
    setBackfillHitsAccount(false);
    setBackfillWallet("");
    if (editing) {
      setName(editing.name);
      setIndefinite(editing.amount === -1);
      setAmount(editing.amount === -1 ? "" : String(editing.amount));
      setIncome(editing.income);
      setEndDate(editing.endDate ? toDateInputValue(new Date(editing.endDate)) : "");
      setPaymentDay(editing.paymentDayOfMonth ? String(editing.paymentDayOfMonth) : "");
      setPinned(editing.pinned);
      setIconName(editing.iconName);
      setColour(editing.colour);
    } else {
      setName("");
      setAmount("");
      setIncome(!isLoan);
      setEndDate("");
      setPaymentDay("");
      setIndefinite(false);
      setPinned(true);
      setIconName(null);
      setColour(null);
      setInitialWalletFk("");
      setInitialWalletDate(toDateInputValue(new Date()));
    }
  }
  if (!open && loadedFor !== null) setLoadedFor(null);

  function handleSave() {
    const base = editing ?? createObjective({ type });
    const finalName = name.trim() || (isLoan ? "Loan" : "Goal");
    upsertObjective({
      ...base,
      type,
      name: finalName,
      // −1 is Cashew's sentinel for a loan with no fixed total.
      amount: isLoan && indefinite ? -1 : Number(amount) || 0,
      income,
      endDate: endDate ? atMidday(fromDateInputValue(endDate)).toISOString() : null,
      // Clamped rather than trusted: a stray 45 would never match a real month.
      paymentDayOfMonth:
        isLoan && paymentDay ? Math.min(31, Math.max(1, Math.floor(Number(paymentDay)))) : null,
      pinned,
      iconName,
      colour,
      order: editing?.order ?? objectives.length,
    });

    // Past payments are written as ordinary transactions in the repayment
    // direction — the same shape "Add transaction" produces — so the progress
    // maths needs no special case and every row stays editable afterwards.
    if (backfill && isLoan && !indefinite) {
      const rows = backfillPayments().map(({ amount: value, date }) =>
        createTransaction({
          name: finalName,
          amount: repaymentIsIncome ? value : -value,
          income: repaymentIsIncome,
          ...(resolvedBackfillCategory ? { categoryFk: resolvedBackfillCategory } : {}),
          note: backfillHitsAccount
            ? "Past payment added when the loan was set up."
            : "Past payment — history only, does not affect account balances.",
          walletFk:
            backfillHitsAccount && resolvedBackfillWallet
              ? resolvedBackfillWallet
              : base.walletFk,
          // Money that left the account before the account balance was ever
          // entered is already baked into that balance. Marking these rows
          // credit/debt keeps them out of `getWalletBalance` and out of income
          // and expense totals, while loan progress — which only asks for
          // `paid` — still counts them.
          type: backfillHitsAccount
            ? null
            : income
              ? TransactionSpecialType.debt
              : TransactionSpecialType.credit,
          objectiveLoanFk: base.objectivePk,
          dateCreated: date.toISOString(),
        }),
      );
      if (rows.length > 0) upsertTransactions(rows);
    } else if (initialWalletFk && isLoan && !indefinite && !editing) {
      const val = Number(amount) || 0;
      if (val > 0) {
        const row = createTransaction({
          name: finalName,
          amount: income ? val : -val,
          income: income,
          ...(resolvedInitialCategory ? { categoryFk: resolvedInitialCategory } : {}),
          note: "Initial loan disbursement",
          walletFk: initialWalletFk,
          // Since it hits the account, it's a normal transaction?
          // No, if we want it to avoid inflating income/expense, it must be credit/debt.
          type: income ? TransactionSpecialType.debt : TransactionSpecialType.credit,
          objectiveLoanFk: base.objectivePk,
          dateCreated: initialWalletDate
            ? atMidday(fromDateInputValue(initialWalletDate)).toISOString()
            : new Date().toISOString(),
        });
        upsertTransactions([row]);
      }
    }

    onClose();
  }

  // A repayment runs opposite to how the loan's money arrived, so it needs a
  // category of that direction. Reserved categories are excluded: transfers and
  // corrections are written by their own flows, never chosen by hand.
  const repaymentIsIncome = !income;
  const backfillCategories = categories.filter(
    (c) =>
      c.income === repaymentIsIncome &&
      c.categoryPk !== BALANCE_CORRECTION_CATEGORY_PK &&
      c.categoryPk !== TRANSFER_CATEGORY_PK,
  );
  // Falling through to createTransaction's default would file loan payments
  // under Dining, so pick the first sensible category of the right direction.
  const resolvedBackfillCategory =
    backfillCategories.find((c) => c.categoryPk === backfillCategory)?.categoryPk ??
    backfillCategories.find((c) => /bill|loan|debt|emi/i.test(c.name))?.categoryPk ??
    backfillCategories[0]?.categoryPk ??
    null;

  // Keep the select's displayed option and the saved value in step: an unset
  // choice must resolve to the same wallet the dropdown is showing.
  const resolvedBackfillWallet =
    allWallets.list.find((w) => w.walletPk === backfillWallet)?.walletPk ??
    allWallets.list[0]?.walletPk ??
    null;

  const initialCategories = categories.filter(
    (c) =>
      c.income === income &&
      c.categoryPk !== BALANCE_CORRECTION_CATEGORY_PK &&
      c.categoryPk !== TRANSFER_CATEGORY_PK,
  );
  const resolvedInitialCategory =
    initialCategories.find((c) => /loan|debt|lent|borrowed/i.test(c.name))?.categoryPk ??
    initialCategories[0]?.categoryPk ??
    null;

  /** The payments the current back-fill settings would create. */
  function backfillPayments(): { amount: number; date: Date }[] {
    if (backfillMode === "lump") {
      const paid = Number(alreadyPaid);
      const date = lumpDate ? fromDateInputValue(lumpDate) : new Date();
      return paid > 0 ? [{ amount: paid, date: atMidday(date) }] : [];
    }
    const per = Number(emiAmount);
    const count = Math.floor(Number(emiCount));
    if (!(per > 0) || !(count > 0) || !emiStart) return [];
    // Guard against a typo'd count turning into thousands of rows.
    return monthlySchedule(fromDateInputValue(emiStart), Math.min(count, 600)).map((date) => ({
      amount: per,
      date,
    }));
  }

  const preview = backfill && isLoan && !indefinite ? backfillPayments() : [];
  const previewTotal = preview.reduce((sum, p) => sum + p.amount, 0);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? (isLoan ? "Edit Loan" : "Edit Goal") : isLoan ? "Create Loan" : "Create Goal"}
      footer={
        <div className="space-y-2">
          <PrimaryButton onClick={handleSave} disabled={!name.trim()}>
            {editing ? "Save Changes" : "Create"}
          </PrimaryButton>
          {editing ? (
            <ConfirmButton
              idleLabel={isLoan ? "Delete Loan" : "Delete Goal"}
              confirmLabel="Tap again — transactions are kept"
              onConfirm={() => {
                deleteObjective(editing.objectivePk);
                onClose();
              }}
            />
          ) : null}
        </div>
      }
    >
      <SegmentedTabs
        className="mb-3"
        value={income ? "in" : "out"}
        onChange={(v) => setIncome(v === "in")}
        options={
          isLoan
            ? [
                { value: "out", label: "Lent" },
                { value: "in", label: "Borrowed" },
              ]
            : [
                { value: "in", label: "Savings goal" },
                { value: "out", label: "Spending goal" },
              ]
        }
      />
      <p className="mb-4 text-caption text-label-secondary/60">
        {isLoan
          ? income
            ? "Money you borrowed and will pay back."
            : "Money you lent out and expect back."
          : income
            ? "Add income transactions to this goal. Example: 'Saving for a trip'."
            : "Add expense transactions to this goal. Example: 'Paying off a car loan'."}
      </p>

      <Field label="Name">
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={isLoan ? "Car Loan Payment" : "Trip Savings Jar"}
        />
      </Field>

      {isLoan ? (
        <Toggle
          checked={indefinite}
          onChange={setIndefinite}
          label="Ongoing loan"
          description="No fixed total — just track the running balance with someone."
        />
      ) : null}

      {!(isLoan && indefinite) ? (
        <>
          <Field label={isLoan ? "Total loan amount" : "Target amount"}>
            <TextInput
              type="number"
              inputMode="decimal"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </Field>
          {isLoan && !editing ? (
            <Field label={income ? "Deposited to account" : "Funded from account"} hint="Optional. Creates an initial transaction for the total loan amount." className={initialWalletFk ? "mb-3" : "mb-0"}>
              <SelectInput value={initialWalletFk} onChange={(e) => setInitialWalletFk(e.target.value)}>
                <option value="">Do not record transaction</option>
                {allWallets.list.map((w) => (
                  <option key={w.walletPk} value={w.walletPk}>
                    {w.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
          ) : null}
          {isLoan && !editing && initialWalletFk ? (
            <Field label="Transaction date" className="mb-0">
              <TextInput
                type="date"
                value={initialWalletDate}
                onChange={(e) => setInitialWalletDate(e.target.value)}
              />
            </Field>
          ) : null}
        </>
      ) : null}

      {isLoan && !indefinite ? (
        <>
          <Toggle
            checked={backfill}
            onChange={setBackfill}
            label="Add past payments"
            description="For a loan already part-way through. Creates normal transactions you can edit or delete later."
          />
          {backfill ? (
            <div className="mb-4 rounded-ios bg-fill/5 p-3">
              <SegmentedTabs
                className="mb-3"
                value={backfillMode}
                onChange={(v) => setBackfillMode(v as "lump" | "monthly")}
                options={[
                  { value: "monthly", label: "Monthly" },
                  { value: "lump", label: "One lump" },
                ]}
              />

              {backfillMode === "lump" ? (
                <>
                  <Field label="Total already paid">
                    <TextInput
                      type="number"
                      inputMode="decimal"
                      min="0"
                      value={alreadyPaid}
                      onChange={(e) => setAlreadyPaid(e.target.value)}
                      placeholder="0.00"
                    />
                  </Field>
                  <Field label="Date" hint="Pick a past date so it doesn't show in your recent transactions.">
                    <TextInput
                      type="date"
                      value={lumpDate}
                      onChange={(e) => setLumpDate(e.target.value)}
                    />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Amount per payment">
                    <TextInput
                      type="number"
                      inputMode="decimal"
                      min="0"
                      value={emiAmount}
                      onChange={(e) => setEmiAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </Field>
                  <Field label="First payment date">
                    <TextInput
                      type="date"
                      value={emiStart}
                      onChange={(e) => setEmiStart(e.target.value)}
                    />
                  </Field>
                  <Field label="Number of payments made">
                    <TextInput
                      type="number"
                      inputMode="numeric"
                      min="1"
                      value={emiCount}
                      onChange={(e) => setEmiCount(e.target.value)}
                      placeholder="8"
                    />
                  </Field>
                </>
              )}

              {backfillCategories.length > 0 ? (
                <Field label="Category" hint="Applied to every payment created here.">
                  <CategorySelect
                    value={resolvedBackfillCategory ?? ""}
                    onChange={setBackfillCategory}
                    filter={(c) => c.income === repaymentIsIncome}
                    defaultIncome={repaymentIsIncome}
                  />
                </Field>
              ) : null}

              <Toggle
                checked={backfillHitsAccount}
                onChange={setBackfillHitsAccount}
                label="Deduct from an account"
                description="Leave off if this money already left your account — your balance is up to date and these are history only."
              />
              {backfillHitsAccount ? (
                <Field label="Account">
                  <SelectInput
                    value={resolvedBackfillWallet ?? ""}
                    onChange={(e) => setBackfillWallet(e.target.value)}
                  >
                    {allWallets.list.map((w) => (
                      <option key={w.walletPk} value={w.walletPk}>
                        {w.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
              ) : null}

              {preview.length > 0 ? (
                <p className="text-caption text-label-secondary/70">
                  Adds {preview.length} payment{preview.length === 1 ? "" : "s"} totalling{" "}
                  <Amount value={previewTotal} className="font-semibold text-label" />
                  {preview.length > 1 ? (
                    <>
                      , from{" "}
                      {preview[0].date.toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      to{" "}
                      {preview[preview.length - 1].date.toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </>
                  ) : null}
                  .
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      <IconPicker value={iconName} colour={colour} onChange={setIconName} />
      <ColourPicker value={colour} onChange={setColour} />

      {isLoan ? (
        <Field
          label="Payment day of month"
          hint="Optional. The day your repayment is due each month, 1–31."
        >
          <TextInput
            type="number"
            inputMode="numeric"
            min="1"
            max="31"
            value={paymentDay}
            onChange={(e) => setPaymentDay(e.target.value)}
            placeholder="5"
          />
        </Field>
      ) : null}

      <Field
        label={isLoan ? "Payoff date" : "Target date"}
        hint={
          isLoan
            ? "Optional. When the whole loan should be cleared — not a monthly due date."
            : "Optional."
        }
      >
        <TextInput type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </Field>

      <Toggle checked={pinned} onChange={setPinned} label="Show on home page" />
    </Sheet>
  );
}

/** Pinned goals and loans, for the home screen. */
export function PinnedObjectives() {
  const { objectives  } = useBudget(useShallow((s) => ({ objectives: s.objectives })));
  const pinned = objectives
    .filter((o) => o.pinned && !o.archived && o.type === ObjectiveType.goal)
    .sort((a, b) => a.order - b.order);
  if (pinned.length === 0) {
    return (
      <Link
        href="/budget/goals"
        className="flex items-center gap-3 rounded-[18px] bg-bg-secondary p-4 shadow-sm ring-1 ring-black/5 transition-transform active:scale-[0.98] dark:ring-white/10"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fill/5 text-label-secondary">
          <Flag size={20} />
        </div>
        <div className="flex-1">
          <span className="block text-subhead font-medium text-label">Set a goal</span>
          <span className="block text-caption text-label-secondary/60">Save up for something special</span>
        </div>
        <CaretRight size={18} className="text-label-secondary/30" />
      </Link>
    );
  }

  return (
    <div className="space-y-3">
      {pinned.map((o) => (
        <ObjectiveCard key={o.objectivePk} objective={o} compact />
      ))}
    </div>
  );
}
