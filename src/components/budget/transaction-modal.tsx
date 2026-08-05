"use client";

/**
 * Add / edit transaction — the flow everything else feeds.
 *
 * Reproduces Cashew's entry model: an amount and direction, one of five special
 * types (or none for a settled transaction), plus a separate Transfer tab that
 * writes the two balance-correction rows a transfer is made of.
 */

import { useEffect, useMemo, useState } from "react";

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
import { getCurrencyInfo } from "@/lib/budget/currency";
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
}: {
  open: boolean;
  onClose: () => void;
  /** Existing transaction to edit; omit to create. */
  editing?: Transaction | null;
  defaults?: Partial<Transaction>;
}) {
  const {
    wallets,
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
  } = useBudget();
  const { main: mainCategories, subsByParent } = useCategoryLookup();

  const [tab, setTab] = useState<Tab>("expense");
  const [amount, setAmount] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [categoryFk, setCategoryFk] = useState("");
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

  // Reset the form each time the sheet opens so a previous edit never leaks in.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTab(editing.income ? "income" : "expense");
      setAmount(String(Math.abs(editing.amount)));
      setName(editing.name);
      setNote(editing.note);
      setCategoryFk(editing.categoryFk);
      setSubCategoryFk(editing.subCategoryFk ?? "");
      setWalletFk(editing.walletFk);
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
      setTab(defaults?.income ? "income" : "expense");
      setAmount("");
      setName("");
      setNote("");
      setCategoryFk(defaults?.categoryFk ?? "");
      setSubCategoryFk("");
      setWalletFk(defaults?.walletFk ?? settings.primaryWalletPk);
      setDate(toDateInputValue(new Date()));
      setSpecialType(defaults?.type !== undefined && defaults.type !== null ? String(defaults.type) : "none");
      setReoccurrence(String(BudgetReoccurence.monthly));
      setPeriodLength("1");
      setEndDate("");
      setPaid(defaults?.type === undefined || defaults.type === null);
      setObjectiveFk(defaults?.objectiveFk ?? "");
      setObjectiveLoanFk(defaults?.objectiveLoanFk ?? "");
      setBudgetFk("");
      setToWalletFk("");
      setTransferFee("");
    }
  }, [open, editing, defaults, settings.primaryWalletPk]);

  const isIncome = tab === "income";
  const typeValue = specialType === "none" ? null : (Number(specialType) as TransactionSpecialType);
  const isRecurring =
    typeValue === TransactionSpecialType.subscription ||
    typeValue === TransactionSpecialType.repetitive;
  const isScheduled = typeValue !== null && typeValue !== TransactionSpecialType.credit && typeValue !== TransactionSpecialType.debt;

  // Categories matching the current direction, plus the reserved correction one.
  const visibleCategories = useMemo(
    () =>
      mainCategories.filter(
        (c) =>
          // Transfers are written by the Transfer tab, never chosen by hand.
          c.categoryPk !== TRANSFER_CATEGORY_PK &&
          (c.income === isIncome || c.categoryPk === BALANCE_CORRECTION_CATEGORY_PK),
      ),
    [mainCategories, isIncome],
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

  const numericAmount = Number(amount);
  const canSave =
    tab === "transfer"
      ? Number.isFinite(numericAmount) && numericAmount > 0 && !!walletFk && !!toWalletFk && walletFk !== toWalletFk
      : Number.isFinite(numericAmount) && numericAmount > 0 && !!categoryFk;

  function handleSave() {
    if (!canSave) return;

    if (tab === "transfer") {
      const pair = createTransferPair({
        fromWalletPk: walletFk,
        toWalletPk: toWalletFk,
        amount: numericAmount,
        fee: Number(transferFee) || 0,
        date: atMidday(fromDateInputValue(date)),
        note,
        title: name.trim() || undefined,
        newPk: newId,
      });
      upsertTransactions(pair);
      onClose();
      return;
    }

    // Cashew stores expenses negative and income positive.
    const signed = isIncome ? Math.abs(numericAmount) : -Math.abs(numericAmount);
    const dueDate = atMidday(fromDateInputValue(date));

    const base = editing ?? createTransaction();
    const next: Transaction = {
      ...base,
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

    upsertTransaction(next);

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

  const fromWallet = wallets.find((w) => w.walletPk === walletFk);
  const toWallet = wallets.find((w) => w.walletPk === toWalletFk);
  const currenciesDiffer =
    !!fromWallet && !!toWallet && fromWallet.currency !== toWallet.currency;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Edit Transaction" : "Add Transaction"}
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
            { value: "expense", label: "Expense" },
            { value: "income", label: "Income" },
            ...(settings.showBalanceTransferTab
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
          <TextInput
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="pl-8 text-title3 font-semibold"
            autoFocus
          />
        </div>
      </Field>

      {tab === "transfer" ? (
        <>
          <Field label="From account">
            <SelectInput value={walletFk} onChange={(e) => setWalletFk(e.target.value)}>
              {wallets.map((w) => (
                <option key={w.walletPk} value={w.walletPk}>
                  {w.name} ({getCurrencyInfo(w.currency)?.code.toUpperCase()})
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="To account">
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
          <Field label="Transfer fee" hint="Charged to the source account only.">
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
          {currenciesDiffer ? (
            <p className="mb-3 rounded-ios bg-amber/10 px-3 py-2 text-caption text-amber">
              These accounts use different currencies. Both halves are recorded at the amount you
              entered — edit either one afterwards to match the real converted figure.
            </p>
          ) : null}
          <p className="mb-3 text-caption text-label-secondary/60">
            A transfer creates two balance-correction transactions: a transfer out and a transfer
            in. Each can be edited individually later.
          </p>
        </>
      ) : (
        <>
          <Field label="Title">
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameBlur}
              placeholder="e.g. Groceries"
            />
          </Field>

          <Field label="Category">
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {visibleCategories.map((c) => {
                const active = c.categoryPk === categoryFk;
                return (
                  <button
                    key={c.categoryPk}
                    type="button"
                    onClick={() => {
                      setCategoryFk(c.categoryPk);
                      setSubCategoryFk("");
                    }}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-ios px-1 py-2 transition-colors",
                      active ? "bg-green/10 ring-1 ring-green/40" : "hover:bg-fill/10",
                    )}
                  >
                    <CategoryDot colour={c.colour} label={c.name} emoji={c.emojiIconName} size={30} />
                    <span className="line-clamp-1 text-caption2 text-label-secondary">{c.name}</span>
                  </button>
                );
              })}
            </div>
          </Field>

          {subCategories.length > 0 ? (
            <Field label="Subcategory">
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

          <Field label="Account">
            <SelectInput value={walletFk} onChange={(e) => setWalletFk(e.target.value)}>
              {wallets.map((w) => (
                <option key={w.walletPk} value={w.walletPk}>
                  {w.name}
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Date">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>

          <Field label="Type" hint={SPECIAL_TYPE_OPTIONS.find((o) => o.value === specialType)?.hint}>
            <SelectInput
              value={specialType}
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

          {isRecurring ? (
            <>
              <div className="mb-3 grid grid-cols-2 gap-2">
                <Field label="Repeats every">
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
                onChange={(e) => setObjectiveLoanFk(e.target.value)}
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
    </Sheet>
  );
}
