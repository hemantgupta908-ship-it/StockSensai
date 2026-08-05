"use client";

/**
 * Goals and loans. Both are Cashew `Objective` rows differing only by `type`,
 * so one component serves both with the copy switched.
 *
 * The distinction that matters for the maths: goals accumulate through
 * `objectiveFk`, loans through `objectiveLoanFk`, and a loan with amount −1 is
 * "indefinite" — it has no target, it just tracks a running balance.
 */

import { useMemo, useState } from "react";
import { CreditCard, Flag, ChevronRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { ObjectiveType, type Objective } from "@/lib/budget/types";
import {
  getIndefiniteLoanBalance,
  getObjectivePercentageComplete,
  getTotalTowardsObjective,
  isIndefiniteLoan,
} from "@/lib/budget/calculations";
import { createObjective } from "@/lib/budget/factory";
import { ColourPicker, IconBadge, IconPicker } from "./icon-picker";
import { atMidday, fromDateInputValue, toDateInputValue } from "@/lib/budget/period";
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
  Sheet,
  TextInput,
  Toggle,
} from "./budget-ui";
import { TransactionGroup, TransactionRow } from "./transaction-row";
import { TransactionModal } from "./transaction-modal";

export function ObjectivesView({ type }: { type: ObjectiveType }) {
  const { objectives } = useBudget();
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Objective | null>(null);

  const isLoan = type === ObjectiveType.loan;

  const visible = useMemo(
    () =>
      objectives
        .filter((o) => o.type === type && !o.archived)
        .filter((o) => o.name.toLowerCase().includes(query.trim().toLowerCase()))
        .sort((a, b) => a.order - b.order),
    [objectives, type, query],
  );

  return (
    <>
      {objectives.filter((o) => o.type === type).length > 3 ? (
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={isLoan ? "Search loans..." : "Search goals..."}
        />
      ) : null}

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

export function ObjectiveCard({
  objective,
  onEdit,
  compact = false,
}: {
  objective: Objective;
  onEdit?: () => void;
  compact?: boolean;
}) {
  const { transactions, allWallets } = useBudget();
  const [expanded, setExpanded] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

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
      <Card className="!p-4">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="w-full text-left"
        >
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-headline text-label">
                <IconBadge
                  iconName={objective.iconName}
                  colour={objective.colour}
                  size={26}
                  fallback={objective.name}
                />
                <span className="truncate">
                  {objective.emojiIconName ? `${objective.emojiIconName} ` : ""}
                  {objective.name}
                </span>
              </p>
              <p className="text-caption text-label-secondary/60">
                {indefinite
                  ? "Ongoing loan"
                  : objective.endDate
                    ? `Due ${new Date(objective.endDate).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}`
                    : isLoan
                      ? "Long term loan"
                      : objective.income
                        ? "Savings goal"
                        : "Spending goal"}
              </p>
            </div>
            {reached ? (
              <span className="shrink-0 rounded-full bg-green/12 px-2 py-0.5 text-caption2 font-semibold text-green">
                {isLoan ? "Accomplished" : "Reached"}
              </span>
            ) : overdue ? (
              <span className="shrink-0 rounded-full bg-red/12 px-2 py-0.5 text-caption2 font-semibold text-red">
                Overdue
              </span>
            ) : null}
          </div>

          {indefinite ? (
            <p className="text-title3 font-semibold">
              <Amount value={total} colour showSign />
              <span className="ml-1 text-caption font-normal text-label-secondary/60">
                {total >= 0 ? "owed to you" : "you owe"}
              </span>
            </p>
          ) : (
            <>
              <ProgressBar percent={percent} colour={objective.colour} className="mb-2" />
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-footnote text-label-secondary">
                  <Amount value={total} className="font-semibold text-label" /> of{" "}
                  <Amount value={objective.amount} />
                </p>
                <p className="text-footnote font-semibold text-label-secondary">
                  {Math.round(percent * 100)}%
                </p>
              </div>
              {!reached ? (
                <p className="mt-1 text-caption text-label-secondary/50">
                  <Amount value={objective.amount - total} /> until{" "}
                  {isLoan ? "loan reached" : "goal reached"}
                </p>
              ) : null}
            </>
          )}
        </button>

        {expanded ? (
          <div className="mt-3 border-t border-separator/40 pt-3">
            <div className="mb-2 flex gap-2">
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="flex-1 rounded-ios bg-green/12 py-2 text-footnote font-semibold text-green"
              >
                Add transaction
              </button>
              {onEdit ? (
                <button
                  type="button"
                  onClick={onEdit}
                  className="flex-1 rounded-ios bg-fill/10 py-2 text-footnote font-semibold text-label-secondary"
                >
                  Edit
                </button>
              ) : null}
            </div>

            {members.length === 0 ? (
              <p className="py-3 text-center text-caption text-label-secondary/50">
                No transactions added yet.
              </p>
            ) : (
              <div className="-mx-4">
                <TransactionGroup>
                  {members.slice(0, 10).map((t) => (
                    <TransactionRow key={t.transactionPk} transaction={t} showActions={false} />
                  ))}
                </TransactionGroup>
              </div>
            )}
          </div>
        ) : null}
      </Card>

      <TransactionModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaults={
          isLoan
            ? { objectiveLoanFk: objective.objectivePk, income: !objective.income }
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
  const { objectives, upsertObjective, deleteObjective } = useBudget();
  const isLoan = type === ObjectiveType.loan;

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [income, setIncome] = useState(true);
  const [endDate, setEndDate] = useState("");
  const [indefinite, setIndefinite] = useState(false);
  const [pinned, setPinned] = useState(true);
  const [iconName, setIconName] = useState<string | null>(null);
  const [colour, setColour] = useState<string | null>(null);

  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const key = editing?.objectivePk ?? "new";
  if (open && loadedFor !== key) {
    setLoadedFor(key);
    if (editing) {
      setName(editing.name);
      setIndefinite(editing.amount === -1);
      setAmount(editing.amount === -1 ? "" : String(editing.amount));
      setIncome(editing.income);
      setEndDate(editing.endDate ? toDateInputValue(new Date(editing.endDate)) : "");
      setPinned(editing.pinned);
      setIconName(editing.iconName);
      setColour(editing.colour);
    } else {
      setName("");
      setAmount("");
      setIncome(!isLoan);
      setEndDate("");
      setIndefinite(false);
      setPinned(true);
      setIconName(null);
      setColour(null);
    }
  }
  if (!open && loadedFor !== null) setLoadedFor(null);

  function handleSave() {
    const base = editing ?? createObjective({ type });
    upsertObjective({
      ...base,
      type,
      name: name.trim() || (isLoan ? "Loan" : "Goal"),
      // −1 is Cashew's sentinel for a loan with no fixed total.
      amount: isLoan && indefinite ? -1 : Number(amount) || 0,
      income,
      endDate: endDate ? atMidday(fromDateInputValue(endDate)).toISOString() : null,
      pinned,
      iconName,
      colour,
      order: editing?.order ?? objectives.length,
    });
    onClose();
  }

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
        <Field label="Target amount">
          <TextInput
            type="number"
            inputMode="decimal"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </Field>
      ) : null}

      <IconPicker value={iconName} colour={colour} onChange={setIconName} />
      <ColourPicker value={colour} onChange={setColour} />

      <Field label="Target date" hint="Optional.">
        <TextInput type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </Field>

      <Toggle checked={pinned} onChange={setPinned} label="Show on home page" />
    </Sheet>
  );
}

/** Pinned goals and loans, for the home screen. */
export function PinnedObjectives() {
  const { objectives } = useBudget();
  const pinned = objectives.filter((o) => o.pinned && !o.archived).sort((a, b) => a.order - b.order);
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
        <ChevronRight size={18} className="text-label-secondary/30" />
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
