"use client";
import { useShallow } from "zustand/react/shallow";

/**
 * Add / edit transaction — the flow everything else feeds.
 *
 * Reproduces Cashew's entry model: an amount and direction, one of five special
 * types (or none for a settled transaction), plus a separate Transfer tab that
 * writes the two Transfer-category rows a transfer is made of.
 *
 * Transfers are not balance corrections: a correction reconciles an account to
 * reality, a transfer moves money you already had between your own accounts.
 * They share only `isExcludedFromTotals`, so neither inflates income or expense.
 */

import { useEffect, useMemo, useState } from "react";
import { Plus } from "@phosphor-icons/react";

import {
  BALANCE_CORRECTION_CATEGORY_PK,
  TRANSFER_CATEGORY_PK,
  BudgetReoccurence,
  ObjectiveType,
  TransactionSpecialType,
  type Transaction,
} from "@/lib/budget/types";
import { createTransaction, matchAssociatedTitle, newId } from "@/lib/budget/factory";
import { createTransferPair } from "@/lib/budget/recurring";
import { getWalletBalance } from "@/lib/budget/calculations";
import { atMidday, fromDateInputValue, toDateInputValue } from "@/lib/budget/period";
import { formatCurrencyAmount, getCurrencyInfo } from "@/lib/budget/currency";
import { amountValue, evaluateExpression, isExpression } from "@/lib/budget/expression";
import { useBudget, useCategoryLookup } from "./budget-provider";
import {
  Field,
  PrimaryButton,
  ConfirmButton,
  SegmentedTabs,
  SelectInput,
  Sheet,
  TextInput,
  Toggle,
  CategoryDot,
} from "./budget-ui";
import { CategoryEditor } from "./categories-view";
import { cn } from "@/lib/utils";

type Tab = "expense" | "income" | "transfer";

const SPECIAL_TYPE_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: "none", label: "Default", hint: "A transaction that has already happened" },
  { value: String(TransactionSpecialType.upcoming), label: "Upcoming", hint: "A transaction that is unpaid" },
  {
    value: String(TransactionSpecialType.subscription),
    label: "Subscription",
    hint: "Recurring, shown on the subscriptions page",
  },
  {
    value: String(TransactionSpecialType.repetitive),
    label: "Repetitive",
    hint: "Recurring, not a subscription",
  },
  { value: String(TransactionSpecialType.credit), label: "Lent", hint: "Money you lent out" },
  { value: String(TransactionSpecialType.debt), label: "Borrowed", hint: "Money you borrowed" },
];

export function TransactionModal({
  open,
  onClose,
  editing,
  defaults,
  defaultTab,
}: {
  open: boolean;
  onClose: () => void;
  /** Existing transaction to edit; omit to create. */
  editing?: Transaction | null;
  defaults?: Partial<Transaction>;
  defaultTab?: Tab;
}) {
  const { wallets,
    categories,
    budgets,
    objectives,
    associatedTitles,
    settings,
    transactions,
    upsertTransaction,
    upsertTransactions,
    deleteTransaction,
    upsertAssociatedTitle,
   } = useBudget(useShallow((s) => ({ wallets: s.wallets, categories: s.categories, budgets: s.budgets, objectives: s.objectives, associatedTitles: s.associatedTitles, settings: s.settings, transactions: s.transactions, upsertTransaction: s.upsertTransaction, upsertTransactions: s.upsertTransactions, deleteTransaction: s.deleteTransaction, upsertAssociatedTitle: s.upsertAssociatedTitle })));
  const { main: mainCategories, subsByParent } = useCategoryLookup();

  const [tab, setTab] = useState<Tab>("expense");
  const [amount, setAmount] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [categoryFk, setCategoryFk] = useState("");
  const [categoryEditorOpen, setCategoryEditorOpen] = useState(false);
  const [subCategoryFk, setSubCategoryFk] = useState("");
  const [walletFk, setWalletFk] = useState(settings.primaryWalletPk);
  const [date, setDate] = useState(() => toDateInputValue(new Date()));
  const [specialType, setSpecialType] = useState("none");
  const [reoccurrence, setReoccurrence] = useState(String(BudgetReoccurence.monthly));
  const [periodLength, setPeriodLength] = useState("1");
  const [endDate, setEndDate] = useState("");
  const [paid, setPaid] = useState(true);
  const [objectiveFk, setObjectiveFk] = useState("");
  const [objectiveLoanFk, setObjectiveLoanFk] = useState("");
  const [budgetFk, setBudgetFk] = useState("");

  // Transfer tab
  const [toWalletFk, setToWalletFk] = useState("");
  const [transferFee, setTransferFee] = useState("");

  const [syncPrompt, setSyncPrompt] = useState<{ next: Transaction; paired: Transaction } | null>(null);

  // Reset the form each time the sheet opens so a previous edit never leaks in.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      if (editing.categoryFk === TRANSFER_CATEGORY_PK && editing.pairedTransactionFk) {
        setTab("transfer");
        const paired = transactions.find((t) => t.transactionPk === editing.pairedTransactionFk);
        if (paired) {
          if (editing.income) {
            setWalletFk(paired.walletFk);
            setToWalletFk(editing.walletFk);
            setAmount(String(Math.abs(paired.amount)));
            const fee = Math.abs(paired.amount) - Math.abs(editing.amount);
            setTransferFee(fee > 0 ? String(Math.round(fee * 100) / 100) : "");
          } else {
            setWalletFk(editing.walletFk);
            setToWalletFk(paired.walletFk);
            setAmount(String(Math.abs(editing.amount)));
            const fee = Math.abs(editing.amount) - Math.abs(paired.amount);
            setTransferFee(fee > 0 ? String(Math.round(fee * 100) / 100) : "");
          }
        } else {
          setTab(editing.income ? "income" : "expense");
          setWalletFk(editing.walletFk);
          setToWalletFk("");
          setAmount(String(Math.abs(editing.amount)));
        }
      } else {
        setTab(editing.income ? "income" : "expense");
        setWalletFk(editing.walletFk);
        setToWalletFk("");
        setAmount(String(Math.abs(editing.amount)));
      }

      setName(editing.name);
      setNote(editing.note);
      setCategoryFk(editing.categoryFk);
      setSubCategoryFk(editing.subCategoryFk ?? "");
      setDate(toDateInputValue(new Date(editing.dateCreated)));
      setSpecialType(editing.type === null ? "none" : String(editing.type));
      setReoccurrence(String(editing.reoccurrence ?? BudgetReoccurence.monthly));
      setPeriodLength(String(editing.periodLength ?? 1));
      setEndDate(editing.endDate ? toDateInputValue(new Date(editing.endDate)) : "");
      setPaid(editing.paid);
      setObjectiveFk(editing.objectiveFk ?? "");
      setObjectiveLoanFk(editing.objectiveLoanFk ?? "");
      setBudgetFk(editing.sharedReferenceBudgetPk ?? "");
    } else {
      setTab(defaultTab ?? (defaults?.income ? "income" : "expense"));
      setAmount(defaults?.amount !== undefined ? String(Math.abs(defaults.amount)) : "");
      setName(defaults?.name ?? "");
      setNote(defaults?.note ?? "");
      setCategoryFk(defaults?.categoryFk ?? "");
      setSubCategoryFk("");
      setWalletFk(defaults?.walletFk ?? settings.primaryWalletPk);
      setDate(toDateInputValue(defaults?.dateCreated ? new Date(defaults.dateCreated) : new Date()));
      setSpecialType(defaults?.type !== undefined && defaults.type !== null ? String(defaults.type) : "none");
      setReoccurrence(String(BudgetReoccurence.monthly));
      setPeriodLength("1");
      setEndDate("");
      setPaid(defaults?.type === undefined || defaults.type === null);
      setObjectiveFk(defaults?.objectiveFk ?? "");
      setObjectiveLoanFk(defaults?.objectiveLoanFk ?? "");
      setBudgetFk("");
      // When defaultTab is "transfer", defaults.walletFk is mapped to 'fromWallet' above.
      // We can use an extended default payload to also pass `toWalletFk`.
      setToWalletFk((defaults as any)?.toWalletFk ?? "");
      setTransferFee("");
      setSyncPrompt(null);
    }
  }, [open, editing, defaults, defaultTab, settings.primaryWalletPk]);

  const isIncome = tab === "income";
  const typeValue = specialType === "none" ? null : (Number(specialType) as TransactionSpecialType);
  const isRecurring =
    typeValue === TransactionSpecialType.subscription ||
    typeValue === TransactionSpecialType.repetitive;
  const isScheduled = typeValue !== null && typeValue !== TransactionSpecialType.credit && typeValue !== TransactionSpecialType.debt;

  const categoryUsage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of transactions) {
      counts.set(t.categoryFk, (counts.get(t.categoryFk) ?? 0) + 1);
    }
    return counts;
  }, [transactions]);

  // Categories matching the current direction, plus the reserved correction one.
  const visibleCategories = useMemo(
    () =>
      mainCategories
        .filter(
          (c) =>
            // Transfers are written by the Transfer tab, never chosen by hand.
            c.categoryPk !== TRANSFER_CATEGORY_PK &&
            (!!objectiveLoanFk || c.income === isIncome || c.categoryPk === BALANCE_CORRECTION_CATEGORY_PK),
        )
        .sort((a, b) => (categoryUsage.get(b.categoryPk) ?? 0) - (categoryUsage.get(a.categoryPk) ?? 0)),
    [mainCategories, isIncome, categoryUsage],
  );

  // Default the category once the direction is known.
  //
  // Never default to the reserved balance-correction category: it sorts first
  // (order −1) but transactions in it are excluded from income and expense
  // totals, so defaulting there would silently drop spending from every report.
  useEffect(() => {
    if (tab === "transfer") return;
    if (categoryFk && visibleCategories.some((c) => c.categoryPk === categoryFk)) return;
    const firstReal = visibleCategories.find(
      (c) => c.categoryPk !== BALANCE_CORRECTION_CATEGORY_PK,
    );
    setCategoryFk(firstReal?.categoryPk ?? visibleCategories[0]?.categoryPk ?? "");
    setSubCategoryFk("");
  }, [tab, visibleCategories, categoryFk]);

  /** Autocomplete the category from a remembered title, as Cashew does. */
  function handleNameBlur() {
    if (!settings.autoAddTitles || !name.trim() || editing) return;
    const match = matchAssociatedTitle(name, associatedTitles);
    if (match && categories.some((c) => c.categoryPk === match.categoryFk)) {
      setCategoryFk(match.categoryFk);
    }
  }

  const subCategories = subsByParent.get(categoryFk) ?? [];
  const goals = objectives.filter((o) => o.type === ObjectiveType.goal && !o.archived);
  const loans = objectives.filter((o) => o.type === ObjectiveType.loan && !o.archived);
  const addableBudgets = budgets.filter((b) => b.addedTransactionsOnly && !b.archived);

  const numericAmount = amountValue(amount);
  const canSave =
    tab === "transfer"
      ? Number.isFinite(numericAmount) && numericAmount > 0 && !!walletFk && !!toWalletFk && walletFk !== toWalletFk
      : Number.isFinite(numericAmount) && numericAmount !== 0 && !!categoryFk;

  function handleSave() {
    if (!canSave) return;

    if (tab === "transfer") {
      const pair = createTransferPair({
        fromWalletPk: walletFk,
        toWalletPk: toWalletFk,
        amount: numericAmount,
        fee: amountValue(transferFee) || 0,
        date: atMidday(fromDateInputValue(date)),
        note,
        title: name.trim() || undefined,
        newPk: newId,
      });

      if (editing) {
        if (editing.categoryFk === TRANSFER_CATEGORY_PK && editing.pairedTransactionFk) {
          const outId = editing.income ? editing.pairedTransactionFk : editing.transactionPk;
          const inId = editing.income ? editing.transactionPk : editing.pairedTransactionFk;
          pair[0].transactionPk = outId;
          pair[0].pairedTransactionFk = inId;
          pair[1].transactionPk = inId;
          pair[1].pairedTransactionFk = outId;
        } else {
          pair[0].transactionPk = editing.transactionPk;
        }
      }

      upsertTransactions(pair);
      onClose();
      return;
    }

    // Cashew stores expenses negative and income positive.
    // By respecting the sign of numericAmount, users can enter negative expenses (refunds)
    const signed = isIncome ? numericAmount : -numericAmount;
    const dueDate = atMidday(fromDateInputValue(date));

    const base = editing ?? createTransaction();
    const next: Transaction = {
      ...base,
      pairedTransactionFk: null,
      name: name.trim(),
      amount: signed,
      note,
      categoryFk,
      subCategoryFk: subCategoryFk || null,
      walletFk,
      dateCreated: dueDate.toISOString(),
      income: isIncome,
      type: typeValue,
      periodLength: isRecurring ? Number(periodLength) || 1 : null,
      reoccurrence: isRecurring ? (Number(reoccurrence) as BudgetReoccurence) : null,
      endDate: isRecurring && endDate ? atMidday(fromDateInputValue(endDate)).toISOString() : null,
      originalDateDue: isScheduled ? dueDate.toISOString() : base.originalDateDue,
      // Only a settled transaction is paid; scheduled ones start unpaid unless
      // the user says otherwise. Lent/borrowed track their own settlement.
      paid: typeValue === null ? true : paid,
      objectiveFk: objectiveFk || null,
      objectiveLoanFk: objectiveLoanFk || null,
      sharedReferenceBudgetPk: budgetFk || null,
    };

    if (base.pairedTransactionFk) {
      const paired = transactions.find((t) => t.transactionPk === base.pairedTransactionFk);
      if (paired) {
        setSyncPrompt({ next, paired });
        return; // Wait for user choice
      } else {
        upsertTransaction(next);
      }
    } else {
      upsertTransaction(next);
    }

    // Remember name -> category so the next entry autocompletes.
    if (settings.autoAddTitles && next.name && !editing) {
      const already = associatedTitles.some(
        (t) => t.title.trim().toLowerCase() === next.name.trim().toLowerCase(),
      );
      if (!already) {
        upsertAssociatedTitle({
          associatedTitlePk: newId(),
          categoryFk,
          title: next.name.trim(),
          dateCreated: new Date().toISOString(),
          dateTimeModified: new Date().toISOString(),
          order: associatedTitles.length,
          isExactMatch: false,
        });
      }
    }

    onClose();
  }

  function handleConfirmSync(sync: boolean) {
    if (!syncPrompt) return;
    const { next, paired } = syncPrompt;
    if (sync) {
      upsertTransactions([
        next,
        {
          ...paired,
          name: next.name,
          note: next.note,
          dateCreated: next.dateCreated,
          originalDateDue: next.originalDateDue,
          paid: next.paid,
        },
      ]);
    } else {
      upsertTransaction(next);
    }
    
    // Remember name -> category so the next entry autocompletes.
    if (settings.autoAddTitles && next.name && !editing) {
      const already = associatedTitles.some(
        (t) => t.title.trim().toLowerCase() === next.name.trim().toLowerCase(),
      );
      if (!already) {
        upsertAssociatedTitle({
          associatedTitlePk: newId(),
          categoryFk: next.categoryFk,
          title: next.name.trim(),
          dateCreated: new Date().toISOString(),
          dateTimeModified: new Date().toISOString(),
          order: associatedTitles.length,
          isExactMatch: false,
        });
      }
    }

    setSyncPrompt(null);
    onClose();
  }

  const fromWallet = wallets.find((w) => w.walletPk === walletFk);
  const toWallet = wallets.find((w) => w.walletPk === toWalletFk);
  const currenciesDiffer =
    !!fromWallet && !!toWallet && fromWallet.currency !== toWallet.currency;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Edit Transaction" : "Add Transaction"}
      maxWidth="sm:max-w-xl"
      footer={
        <div className="space-y-2">
          <PrimaryButton onClick={handleSave} disabled={!canSave}>
            {editing ? "Save Changes" : "Add Transaction"}
          </PrimaryButton>
          {editing ? (
            <ConfirmButton
              idleLabel="Delete Transaction"
              confirmLabel="Tap again to delete"
              onConfirm={() => {
                deleteTransaction(editing.transactionPk, { includePaired: true });
                onClose();
              }}
            />
          ) : null}
        </div>
      }
    >
      {!editing ? (
        <SegmentedTabs
          className="mb-4"
          value={tab}
          onChange={setTab}
          options={[
            { value: "expense", label: objectiveLoanFk ? "Given / Paid" : "Expense" },
            { value: "income", label: objectiveLoanFk ? "Received / Collected" : "Income" },
            ...(settings.showBalanceTransferTab && !objectiveLoanFk
              ? [{ value: "transfer" as const, label: "Transfer" }]
              : []),
          ]}
        />
      ) : null}

      <Field label="Amount">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-body text-label-secondary/60">
            {getCurrencyInfo(fromWallet?.currency)?.symbol ?? ""}
          </span>
          {/*
            Deliberately `text`, not `number`: a number input reports an empty
            value for anything it cannot parse, so "886.38-878" would never
            reach React and the arithmetic below could not run.
          */}
          <TextInput
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={() => {
              // Settle the field to its result once you leave it, so what is
              // saved is what you last saw.
              const value = evaluateExpression(amount);
              if (value !== null && isExpression(amount)) setAmount(String(value));
            }}
            placeholder="0.00"
            className="pl-8 text-title3 font-semibold"
            autoFocus
          />
        </div>
        {isExpression(amount) ? (
          <p
            className={cn(
              "mt-1 text-caption",
              Number.isFinite(numericAmount) ? "text-label-secondary/70" : "text-red",
            )}
          >
            {Number.isFinite(numericAmount)
              ? `= ${formatCurrencyAmount(numericAmount, fromWallet?.currency)}`
              : "Not a valid calculation"}
          </p>
        ) : (
          tab === "expense" ? (
             <p className="mt-1 text-caption text-label-secondary/70">Tip: Enter a negative amount (e.g. -50) for refunds.</p>
          ) : null
        )}
      </Field>

      {tab === "transfer" ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From account" className="mb-0">
              <SelectInput value={walletFk} onChange={(e) => setWalletFk(e.target.value)}>
                {wallets.map((w) => (
                  <option key={w.walletPk} value={w.walletPk}>
                    {w.name} ({getCurrencyInfo(w.currency)?.code.toUpperCase()})
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="To account" className="mb-0">
              <SelectInput value={toWalletFk} onChange={(e) => setToWalletFk(e.target.value)}>
                <option value="">Select account</option>
                {wallets
                  .filter((w) => w.walletPk !== walletFk)
                  .map((w) => (
                    <option key={w.walletPk} value={w.walletPk}>
                      {w.name} ({getCurrencyInfo(w.currency)?.code.toUpperCase()})
                    </option>
                  ))}
              </SelectInput>
            </Field>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" className="mb-0">
              <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Transfer fee" hint="Charged to source." className="mb-0">
              <TextInput
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={transferFee}
                onChange={(e) => setTransferFee(e.target.value)}
                placeholder="0.00"
              />
            </Field>
          </div>
          {currenciesDiffer ? (
            <p className="mb-3 rounded-ios bg-amber/10 px-3 py-2 text-caption text-amber">
              These accounts use different currencies. Both halves are recorded at the amount you
              entered — edit either one afterwards to match the real converted figure.
            </p>
          ) : null}
          <p className="mb-3 text-caption text-label-secondary/60">
            A transfer creates two linked transactions: a transfer out and a transfer in. It moves
            money between your own accounts without counting as income or spending. Each can be
            edited individually later.
          </p>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" className="mb-0">
              <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Title" className="mb-0">
              <TextInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleNameBlur}
                placeholder="e.g. Groceries"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" className="mb-0">
              <div className="flex gap-2">
                <SelectInput
                  className="flex-1 min-w-0"
                  value={categoryFk}
                  onChange={(e) => {
                    setCategoryFk(e.target.value);
                    setSubCategoryFk("");
                  }}
                >
                  {visibleCategories.map((c) => (
                    <option key={c.categoryPk} value={c.categoryPk}>
                      {c.emojiIconName ? `${c.emojiIconName} ` : ""} {c.name}
                    </option>
                  ))}
                </SelectInput>
                <button
                  type="button"
                  onClick={() => setCategoryEditorOpen(true)}
                  className="flex h-11 items-center gap-1 rounded-[14px] bg-fill/5 px-2 text-sm font-semibold text-label transition-colors hover:bg-fill/10 shrink-0 ring-1 ring-black/5 dark:ring-white/10"
                >
                  <Plus size={16} /> <span className="hidden sm:inline">New</span>
                </button>
              </div>
            </Field>

            {subCategories.length > 0 ? (
              <Field label="Subcategory" className="mb-0">
                <SelectInput value={subCategoryFk} onChange={(e) => setSubCategoryFk(e.target.value)}>
                  <option value="">None</option>
                  {subCategories.map((c) => (
                    <option key={c.categoryPk} value={c.categoryPk}>
                      {c.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Account" className="mb-0">
              <SelectInput value={walletFk} onChange={(e) => setWalletFk(e.target.value)}>
                {wallets.map((w) => (
                  <option key={w.walletPk} value={w.walletPk}>
                    {w.name}
                  </option>
                ))}
              </SelectInput>
            </Field>

            <Field label="Type" hint={SPECIAL_TYPE_OPTIONS.find((o) => o.value === specialType)?.hint} className="mb-0">
              <SelectInput
                value={specialType}
                disabled={!!objectiveLoanFk}
                onChange={(e) => {
                  setSpecialType(e.target.value);
                  setPaid(e.target.value === "none");
                }}
              >
                {SPECIAL_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>

          {isRecurring ? (
            <>
              <div className="mb-3 grid grid-cols-2 gap-2">
                <Field label="Repeats every" className="mb-0">
                  <TextInput
                    type="number"
                    min="1"
                    value={periodLength}
                    onChange={(e) => setPeriodLength(e.target.value)}
                  />
                </Field>
                <Field label="Period" className="mb-0">
                  <SelectInput value={reoccurrence} onChange={(e) => setReoccurrence(e.target.value)}>
                    <option value={BudgetReoccurence.daily}>Days</option>
                    <option value={BudgetReoccurence.weekly}>Weeks</option>
                    <option value={BudgetReoccurence.monthly}>Months</option>
                    <option value={BudgetReoccurence.yearly}>Years</option>
                  </SelectInput>
                </Field>
              </div>
              <Field label="End date" hint="Optional — the chain stops after this date.">
                <TextInput type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </Field>
            </>
          ) : null}

          {typeValue !== null ? (
            <Toggle
              checked={paid}
              onChange={setPaid}
              label="Already paid"
              description="Unpaid transactions do not count towards your totals."
            />
          ) : null}

          {goals.length > 0 ? (
            <Field label="Add to goal">
              <SelectInput value={objectiveFk} onChange={(e) => setObjectiveFk(e.target.value)}>
                <option value="">No goal</option>
                {goals.map((o) => (
                  <option key={o.objectivePk} value={o.objectivePk}>
                    {o.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
          ) : null}

          {loans.length > 0 ? (
            <Field label="Add to loan">
              <SelectInput
                value={objectiveLoanFk}
                onChange={(e) => {
                  const newFk = e.target.value;
                  setObjectiveLoanFk(newFk);
                  if (newFk) {
                    const loan = loans.find(l => l.objectivePk === newFk);
                    if (loan) {
                      setSpecialType(String(loan.income ? TransactionSpecialType.debt : TransactionSpecialType.credit));
                    }
                  }
                }}
              >
                <option value="">No loan</option>
                {loans.map((o) => (
                  <option key={o.objectivePk} value={o.objectivePk}>
                    {o.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
          ) : null}

          {addableBudgets.length > 0 ? (
            <Field label="Add to budget">
              <SelectInput value={budgetFk} onChange={(e) => setBudgetFk(e.target.value)}>
                <option value="">No budget</option>
                {addableBudgets.map((b) => (
                  <option key={b.budgetPk} value={b.budgetPk}>
                    {b.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
          ) : null}

          <Field label="Notes">
            <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </Field>
        </>
      )}

      {tab === "transfer" && fromWallet ? (
        <p className="text-caption text-label-secondary/60">
          {fromWallet.name} balance after transfer:{" "}
          {(getWalletBalance(transactions, fromWallet.walletPk) - numericAmount).toFixed(2)}
        </p>
      ) : null}

      <CategoryEditor
        open={categoryEditorOpen}
        onClose={() => setCategoryEditorOpen(false)}
        defaultIncome={isIncome}
        onCreated={(category) => {
          setCategoryFk(category.categoryPk);
          setSubCategoryFk("");
        }}
      />

      {syncPrompt ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px] animate-in fade-in">
          <div className="w-full max-w-sm rounded-[16px] bg-bg-elevated p-6 shadow-sheet">
            <h3 className="mb-2 text-[17px] font-semibold text-label">Sync changes?</h3>
            <p className="mb-6 text-[15px] text-label-secondary/80">
              Apply these changes to the paired transaction in the other account as well?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                className="flex-1 rounded-[10px] bg-fill/10 py-2.5 text-[15px] font-semibold text-label transition-colors hover:bg-fill/20"
                onClick={() => handleConfirmSync(false)}
              >
                No, just this one
              </button>
              <button
                type="button"
                className="flex-1 rounded-[10px] bg-accent py-2.5 text-[15px] font-semibold text-accent-fg transition-colors hover:bg-accent/90"
                onClick={() => handleConfirmSync(true)}
              >
                Yes, update both
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
