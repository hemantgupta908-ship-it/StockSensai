"use client";
import { useShallow } from "zustand/react/shallow";

/**
 * Policies: LIC and other insurance, SIPs, PPF, deposits.
 *
 * These sit between a subscription and a goal — a recurring obligation that is
 * also an accumulating asset — which is why they get their own screen rather
 * than being squeezed into either. Recording a premium writes a real
 * transaction, so policy payments show up in spending like anything else.
 */

import { useMemo, useState } from "react";
import { ArrowsMerge, CaretDown, CaretRight, Check, ShieldCheck } from "@phosphor-icons/react";
import Link from "next/link";

import { cn, formatDate } from "@/lib/utils";
import {
  POLICY_TYPE_META,
  PREMIUM_FREQUENCY_META,
  PolicyType,
  PremiumFrequency,
  type Policy,
  type Transaction,
} from "@/lib/budget/types";
import {
  getPolicyStatus,
  getPolicyTransactions,
  getTotalAnnualPremiums,
  getTotalSumAssured,
  nextPremiumDate,
  resolvePremiumCategoryFk,
} from "@/lib/budget/credit";
import { amountRatioToPrimaryCurrency } from "@/lib/budget/currency";
import { createPolicy, createPremiumTransaction } from "@/lib/budget/factory";
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
  SelectInput,
  Sheet,
  TextInput,
  Toggle,
} from "./budget-ui";
import { CategorySelect } from "./category-select";
import { TransactionGroup, TransactionRow } from "./transaction-row";
import { TransactionModal } from "./transaction-modal";

type Filter = "all" | "insurance" | "investment";

export function PoliciesView() {
  const { policies, transactions, allWallets  } = useBudget(useShallow((s) => ({ policies: s.policies, transactions: s.transactions, allWallets: s.allWallets })));
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);

  const visible = useMemo(
    () =>
      policies
        .filter((p) => !p.archived)
        .filter((p) => filter === "all" || POLICY_TYPE_META[p.type].group === filter)
        .filter((p) => {
          const needle = query.trim().toLowerCase();
          if (!needle) return true;
          return (
            p.name.toLowerCase().includes(needle) ||
            p.provider.toLowerCase().includes(needle) ||
            p.policyNumber.toLowerCase().includes(needle)
          );
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [policies, filter, query],
  );

  const annual = useMemo(
    () => getTotalAnnualPremiums(allWallets, policies),
    [allWallets, policies],
  );
  const cover = useMemo(() => getTotalSumAssured(policies), [policies]);
  const totalInvested = useMemo(
    () =>
      policies
        .filter((p) => !p.archived)
        .reduce((sum, p) => sum + getPolicyStatus(p, transactions).totalPaid, 0),
    [policies, transactions],
  );

  return (
    <>
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Card className="!p-3 text-center">
          <p className="text-caption uppercase tracking-wide text-label-secondary/50">
            Yearly premiums
          </p>
          <Amount value={annual} className="text-title3 font-semibold" />
        </Card>
        <Card className="!p-3 text-center">
          <p className="text-caption uppercase tracking-wide text-label-secondary/50">
            Total paid in
          </p>
          <Amount value={totalInvested} className="text-title3 font-semibold text-green" />
        </Card>
        <Card className="!p-3 text-center">
          <p className="text-caption uppercase tracking-wide text-label-secondary/50">
            Life cover
          </p>
          <Amount value={cover} className="text-title3 font-semibold" compact />
        </Card>
      </div>

      <SegmentedTabs
        className="mb-3"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All" },
          { value: "insurance", label: "Insurance" },
          { value: "investment", label: "Investments" },
        ]}
      />

      {policies.length > 4 ? (
        <SearchField value={query} onChange={setQuery} placeholder="Search policies..." />
      ) : null}

      {/* Only worth offering once there is something to combine. */}
      {policies.filter((p) => !p.archived).length > 1 ? (
        <button
          type="button"
          onClick={() => setMergeOpen(true)}
          className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-ios bg-fill/10 py-2 text-footnote font-medium text-label-secondary transition-colors hover:bg-fill/15"
        >
          <ArrowsMerge size={15} /> Combine policies into one
        </button>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No policies yet"
          description="Track LIC and other insurance, SIPs, PPF, recurring and fixed deposits — their premiums, due dates and maturity."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visible.map((policy) => (
            <PolicyCard
              key={policy.policyPk}
              policy={policy}
              onEdit={() => {
                setEditing(policy);
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
        label="Add policy"
      />
      <PolicyEditor
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
        }}
        editing={editing}
      />
      <MergePoliciesSheet open={mergeOpen} onClose={() => setMergeOpen(false)} />
    </>
  );
}

/**
 * Folds several policies into one.
 *
 * Deliberately explicit rather than automatic: it rewrites which policy each
 * recorded premium belongs to and deletes the absorbed ones, so the totals that
 * will move are stated before anything happens.
 */
function MergePoliciesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { policies, transactions, mergePoliciesInto  } = useBudget(useShallow((s) => ({ policies: s.policies, transactions: s.transactions, mergePoliciesInto: s.mergePoliciesInto })));
  const active = useMemo(() => policies.filter((p) => !p.archived), [policies]);

  const [targetPk, setTargetPk] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);

  const [loadedFor, setLoadedFor] = useState(false);
  if (open && !loadedFor) {
    setLoadedFor(true);
    setTargetPk(active[0]?.policyPk ?? "");
    setSources([]);
    setConfirming(false);
  }
  if (!open && loadedFor) setLoadedFor(false);

  const target = active.find((p) => p.policyPk === targetPk);
  const absorbing = active.filter((p) => p.policyPk !== targetPk && sources.includes(p.policyPk));

  // What the user is about to move, stated in the same terms as the cards.
  const moving = useMemo(
    () =>
      absorbing.reduce(
        (acc, p) => {
          const s = getPolicyStatus(p, transactions);
          return { amount: acc.amount + s.totalPaid, count: acc.count + s.premiumsPaid };
        },
        { amount: 0, count: 0 },
      ),
    [absorbing, transactions],
  );

  const targetPaid = target ? getPolicyStatus(target, transactions).totalPaid : 0;

  function toggle(pk: string) {
    setSources((prev) => (prev.includes(pk) ? prev.filter((x) => x !== pk) : [...prev, pk]));
  }

  function apply() {
    if (!target || absorbing.length === 0) return;
    mergePoliciesInto(
      target.policyPk,
      absorbing.map((p) => p.policyPk),
    );
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Combine policies"
      footer={
        <div className="space-y-2">
          {confirming ? (
            <p className="px-1 text-caption text-label-secondary/70">
              {moving.count} recorded {moving.count === 1 ? "payment" : "payments"} will move onto{" "}
              <span className="font-medium text-label">{target?.name || "this policy"}</span> and be
              renamed{" "}
              <span className="font-medium text-label">
                &ldquo;{`${target?.name ?? ""} premium`.trim()}&rdquo;
              </span>
              , and {absorbing.length} {absorbing.length === 1 ? "policy" : "policies"} will be
              removed. No payment or amount is deleted.
            </p>
          ) : null}
          <PrimaryButton
            onClick={confirming ? apply : () => setConfirming(true)}
            disabled={!target || absorbing.length === 0}
          >
            {confirming
              ? "Yes, combine them"
              : `Combine ${absorbing.length || ""} into one`.replace("  ", " ")}
          </PrimaryButton>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Keep this policy">
          <SelectInput
            value={targetPk}
            onChange={(e) => {
              setTargetPk(e.target.value);
              setSources((prev) => prev.filter((pk) => pk !== e.target.value));
              setConfirming(false);
            }}
          >
            {active.map((p) => (
              <option key={p.policyPk} value={p.policyPk}>
                {p.name || "Untitled policy"}
              </option>
            ))}
          </SelectInput>
        </Field>

        <div>
          <p className="mb-1.5 text-footnote font-medium text-label-secondary">
            Merge these into it
          </p>
          <div className="space-y-1.5">
            {active
              .filter((p) => p.policyPk !== targetPk)
              .map((p) => {
                const s = getPolicyStatus(p, transactions);
                const checked = sources.includes(p.policyPk);
                return (
                  <button
                    key={p.policyPk}
                    type="button"
                    onClick={() => {
                      toggle(p.policyPk);
                      setConfirming(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-ios border px-3 py-2 text-left transition-colors",
                      checked
                        ? "border-accent/40 bg-accent/10"
                        : "border-separator/40 hover:bg-fill/10",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-subhead text-label">
                        {p.name || "Untitled policy"}
                      </span>
                      <span className="block text-caption text-label-secondary/60">
                        {s.premiumsPaid} paid ·{" "}
                        <Amount value={s.totalPaid} className="text-label-secondary/60" />
                      </span>
                    </span>
                    {checked ? <Check size={16} className="shrink-0 text-accent" /> : null}
                  </button>
                );
              })}
          </div>
        </div>

        {absorbing.length > 0 && target ? (
          <div className="rounded-card border border-separator/40 p-3 text-caption">
            <div className="flex justify-between">
              <span className="text-label-secondary/60">Moving across</span>
              <Amount value={moving.amount} className="font-medium text-label" />
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-label-secondary/60">
                {target.name || "Target"} after merge
              </span>
              <Amount value={targetPaid + moving.amount} className="font-semibold text-green" />
            </div>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}

export function PolicyCard({
  policy,
  onEdit,
  compact = false,
}: {
  policy: Policy;
  onEdit?: () => void;
  compact?: boolean;
}) {
  const { transactions, upsertTransaction, upsertPolicy, wallets, settings, categories  } = useBudget(useShallow((s) => ({ transactions: s.transactions, upsertTransaction: s.upsertTransaction, upsertPolicy: s.upsertPolicy, wallets: s.wallets, settings: s.settings, categories: s.categories })));
  const [expanded, setExpanded] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState(policy.walletFk ?? settings.primaryWalletPk ?? wallets[0]?.walletPk ?? "");
  const [selectedDate, setSelectedDate] = useState(() => toDateInputValue(new Date()));
  // Record-only policies have no agreed premium to prefill, so the field starts
  // empty and the amount is typed per payment rather than defaulting to zero.
  const [selectedAmount, setSelectedAmount] = useState(() =>
    policy.recordOnly ? "" : String(Math.abs(policy.premiumAmount)),
  );
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  const status = useMemo(() => getPolicyStatus(policy, transactions), [policy, transactions]);
  const linked = useMemo(
    () =>
      getPolicyTransactions(policy, transactions).sort(
        (a, b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime(),
      ),
    [policy, transactions],
  );

  const meta = POLICY_TYPE_META[policy.type];
  const freq = PREMIUM_FREQUENCY_META[policy.premiumFrequency];

  /** Record a premium and roll the due date forward one period. */
  function payPremium() {
    const due = status.nextDueDate ?? new Date();
    const t = createPremiumTransaction(policy, { date: atMidday(fromDateInputValue(selectedDate)) });

    // Resolve against the categories that actually exist — the factory's `"6"`
    // fallback assumes the default set, which a custom ledger does not have.
    const resolved = resolvePremiumCategoryFk(policy, categories);
    if (resolved && resolved !== t.categoryFk) t.categoryFk = resolved;

    const parsedAmount = parseFloat(selectedAmount);
    if (!isNaN(parsedAmount) && parsedAmount > 0) {
      t.amount = -parsedAmount;
    }
    
    if (selectedWallet) t.walletFk = selectedWallet;
    upsertTransaction(t);

    // A record-only policy has no schedule to advance — logging a payment is
    // the whole of the interaction.
    if (policy.recordOnly) return;

    upsertPolicy({
      ...policy,
      nextDueDate:
        policy.premiumFrequency === PremiumFrequency.oneTime
          ? null
          : nextPremiumDate(due, policy.premiumFrequency).toISOString(),
    });
  }

  return (
    <Card className="group relative overflow-hidden rounded-2xl border border-separator/40 bg-bg-secondary p-5 shadow-card hover:shadow-md hover:border-accent/30 transition-all duration-200">
      <button type="button" onClick={() => setExpanded((e) => !e)} className="w-full text-left focus:outline-none">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base sm:text-lg font-bold text-label group-hover:text-accent transition-colors">{policy.name}</h3>
            <p className="mt-0.5 truncate text-xs font-medium text-label-secondary/60">
              {meta.label}
              {policy.provider ? ` · ${policy.provider}` : ""}
              {policy.policyNumber ? ` · ${policy.policyNumber}` : ""}
            </p>
          </div>
          {status.matured ? (
            <span className="shrink-0 rounded-full bg-green/15 px-2.5 py-1 text-xs font-bold text-green border border-green/20">
              Matured
            </span>
          ) : status.isOverdue ? (
            <span className="shrink-0 rounded-full bg-red/15 px-2.5 py-1 text-xs font-bold text-red border border-red/20 animate-pulse">
              Overdue
            </span>
          ) : null}
        </div>

        <div className="mt-3 space-y-2 rounded-xl bg-fill/5 p-3.5 border border-separator/20">
          <div className="flex items-baseline justify-between gap-2">
            {policy.recordOnly ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-label-secondary/50">Total Paid</p>
                <p className="text-subhead font-bold text-label mt-0.5">
                  <Amount value={status.totalPaid} className="text-label font-bold" />
                  <span className="ml-1.5 text-xs font-normal text-label-secondary/60">
                    {status.premiumsPaid > 0 ? `(${status.premiumsPaid} payments)` : ""}
                  </span>
                </p>
              </div>
            ) : (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-label-secondary/50">Premium Amount</p>
                <p className="text-subhead font-bold text-label mt-0.5">
                  <Amount value={policy.premiumAmount} className="text-label font-bold" />
                  <span className="ml-1 text-xs font-normal text-label-secondary/60">
                    / {freq.label.toLowerCase()}
                  </span>
                </p>
              </div>
            )}
            {status.nextDueDate && !status.matured ? (
              <div className="text-right">
                <span className={cn(
                  "inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-bold",
                  status.isOverdue ? "bg-red/10 text-red" : "bg-accent/10 text-accent"
                )}>
                  Due {formatDate(status.nextDueDate)}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {status.termProgress !== null ? (
          <div className="mt-3 space-y-1">
            <ProgressBar percent={status.termProgress} colour={policy.colour} height={6} />
            <p className="text-xs text-label-secondary/50 font-medium">
              {status.matured
                ? "Term complete"
                : `${status.monthsToMaturity} months to maturity`}
            </p>
          </div>
        ) : null}

        {/* Expand indicator hint */}
        <div className="mt-3 flex items-center justify-center pt-2 border-t border-separator/20 text-[11px] font-semibold text-label-secondary/40 group-hover:text-label-secondary/70 transition-colors">
          <span>{expanded ? "Hide details & payments" : "Tap for details & payments"}</span>
          <CaretDown size={14} className={cn("ml-1 transition-transform duration-200", expanded && "rotate-180")} />
        </div>
      </button>

      {expanded && !compact ? (
        <div className="mt-4 border-t border-separator/40 pt-4">
          <div className="mb-4 grid grid-cols-2 gap-3">
            <Field label="Amount" className="mb-0">
              <TextInput
                type="number"
                step="0.01"
                min="0"
                value={selectedAmount}
                onChange={(e: any) => setSelectedAmount(e.target.value)}
              />
            </Field>
            <Field label="Date" className="mb-0">
              <TextInput
                type="date"
                value={selectedDate}
                onChange={(e: any) => setSelectedDate(e.target.value)}
              />
            </Field>
            <Field label="Pay from" className="col-span-2 mb-0">
              <SelectInput
                value={selectedWallet}
                onChange={(e: any) => setSelectedWallet(e.target.value)}
              >
                {wallets.map((w) => (
                  <option key={w.walletPk} value={w.walletPk}>
                    {w.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
          <div className="flex gap-3">
              <button
                type="button"
                onClick={payPremium}
                // Without an agreed premium to fall back on, a record-only
                // policy would otherwise log a ₹0 row.
                disabled={policy.recordOnly === true && !(parseFloat(selectedAmount) > 0)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-ios bg-accent/15 py-2 text-footnote font-semibold text-accent transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
              >
                <Check size={14} /> Record premium
              </button>
              {onEdit ? (
                <button
                  type="button"
                  onClick={onEdit}
                  className="flex-1 rounded-ios bg-fill/10 py-2 text-footnote font-semibold text-label-secondary transition-transform active:scale-95"
                >
                  Edit
                </button>
              ) : null}
            </div>

          {linked.length === 0 ? (
            <p className="py-3 text-center text-caption text-label-secondary/50">
              No premiums recorded yet.
            </p>
          ) : (
            <div className="-mx-4">
              <TransactionGroup>
                {linked.slice(0, 8).map((t) => (
                  <TransactionRow key={t.transactionPk} transaction={t} onEdit={setEditingTx} showAccount showDate />
                ))}
              </TransactionGroup>
            </div>
          )}
        </div>
      ) : null}
      
      {/* Edit existing transaction */}
      <TransactionModal
        open={editingTx !== null}
        onClose={() => setEditingTx(null)}
        editing={editingTx}
      />
    </Card>
  );
}

function PolicyEditor({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing?: Policy | null;
}) {
  const { wallets, upsertPolicy, deletePolicy  } = useBudget(useShallow((s) => ({ wallets: s.wallets, upsertPolicy: s.upsertPolicy, deletePolicy: s.deletePolicy })));

  const [name, setName] = useState("");
  const [type, setType] = useState(String(PolicyType.lifeInsurance));
  const [provider, setProvider] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [premiumAmount, setPremiumAmount] = useState("");
  const [frequency, setFrequency] = useState(String(PremiumFrequency.monthly));
  const [startDate, setStartDate] = useState(() => toDateInputValue(new Date()));
  const [nextDueDate, setNextDueDate] = useState("");
  const [maturityDate, setMaturityDate] = useState("");
  const [sumAssured, setSumAssured] = useState("");
  const [maturityValue, setMaturityValue] = useState("");
  const [walletFk, setWalletFk] = useState("");
  const [categoryFk, setCategoryFk] = useState("");
  const [note, setNote] = useState("");
  const [pinned, setPinned] = useState(true);
  const [recordOnly, setRecordOnly] = useState(false);
  /** Optional paperwork stays collapsed until asked for. */
  const [showMore, setShowMore] = useState(false);

  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const key = editing?.policyPk ?? "new";
  if (open && loadedFor !== key) {
    setLoadedFor(key);
    setShowMore(false);
    if (editing) {
      setName(editing.name);
      setType(String(editing.type));
      setProvider(editing.provider);
      setPolicyNumber(editing.policyNumber);
      setPremiumAmount(String(editing.premiumAmount));
      setFrequency(String(editing.premiumFrequency));
      setStartDate(toDateInputValue(new Date(editing.startDate)));
      setNextDueDate(editing.nextDueDate ? toDateInputValue(new Date(editing.nextDueDate)) : "");
      setMaturityDate(editing.maturityDate ? toDateInputValue(new Date(editing.maturityDate)) : "");
      setSumAssured(editing.sumAssured === null ? "" : String(editing.sumAssured));
      setMaturityValue(editing.maturityValue === null ? "" : String(editing.maturityValue));
      setWalletFk(editing.walletFk);
      setCategoryFk(editing.categoryFk ?? "");
      setNote(editing.note.replace(`policy:${editing.policyPk}`, "").trim());
      setPinned(editing.pinned);
      setRecordOnly(editing.recordOnly === true);
    } else {
      const today = new Date();
      setName("");
      setType(String(PolicyType.lifeInsurance));
      setProvider("");
      setPolicyNumber("");
      setPremiumAmount("");
      setFrequency(String(PremiumFrequency.monthly));
      setStartDate(toDateInputValue(today));
      setNextDueDate(
        toDateInputValue(new Date(today.getFullYear(), today.getMonth() + 1, today.getDate())),
      );
      setMaturityDate("");
      setSumAssured("");
      setMaturityValue("");
      setWalletFk(wallets[0]?.walletPk ?? "");
      setCategoryFk("");
      setNote("");
      setPinned(true);
      setRecordOnly(false);
    }
  }
  if (!open && loadedFor !== null) setLoadedFor(null);

  const typeValue = Number(type) as PolicyType;
  const isInsurance = POLICY_TYPE_META[typeValue].group === "insurance";
  const isOneTime = Number(frequency) === PremiumFrequency.oneTime;

  function handleSave() {
    const base = editing ?? createPolicy();
    upsertPolicy({
      ...base,
      name: name.trim() || "Policy",
      type: typeValue,
      provider: provider.trim(),
      policyNumber: policyNumber.trim(),
      premiumAmount: recordOnly ? 0 : Number(premiumAmount) || 0,
      premiumFrequency: Number(frequency) as PremiumFrequency,
      recordOnly,
      startDate: atMidday(fromDateInputValue(startDate)).toISOString(),
      // A record-only policy is never "due" — leaving a date here would revive
      // the overdue badge the moment it passed.
      nextDueDate:
        recordOnly || isOneTime || !nextDueDate
          ? null
          : atMidday(fromDateInputValue(nextDueDate)).toISOString(),
      maturityDate: maturityDate ? atMidday(fromDateInputValue(maturityDate)).toISOString() : null,
      sumAssured: sumAssured === "" ? null : Number(sumAssured),
      maturityValue: maturityValue === "" ? null : Number(maturityValue),
      walletFk: walletFk || wallets[0]?.walletPk || "0",
      categoryFk: categoryFk || null,
      note: note.trim(),
      pinned,
    });
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Edit Policy" : "Add Policy"}
      footer={
        <div className="space-y-2">
          <PrimaryButton onClick={handleSave} disabled={!name.trim()}>
            {editing ? "Save Changes" : "Add Policy"}
          </PrimaryButton>
          {editing ? (
            <ConfirmButton
              idleLabel="Delete Policy"
              confirmLabel="Tap again — premiums are kept"
              onConfirm={() => {
                deletePolicy(editing.policyPk);
                onClose();
              }}
            />
          ) : null}
        </div>
      }
    >
      <Field label="Type">
        <SelectInput value={type} onChange={(e) => setType(e.target.value)}>
          <optgroup label="Insurance">
            {Object.entries(POLICY_TYPE_META)
              .filter(([, m]) => m.group === "insurance")
              .map(([value, m]) => (
                <option key={value} value={value}>
                  {m.label}
                </option>
              ))}
          </optgroup>
          <optgroup label="Investments">
            {Object.entries(POLICY_TYPE_META)
              .filter(([, m]) => m.group === "investment")
              .map(([value, m]) => (
                <option key={value} value={value}>
                  {m.label}
                </option>
              ))}
          </optgroup>
        </SelectInput>
      </Field>

      <Field label="Name">
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={isInsurance ? "LIC Jeevan Anand" : "Nifty 50 Index SIP"}
        />
      </Field>

      <div className="mb-3">
        <Toggle
          checked={recordOnly}
          onChange={setRecordOnly}
          label="Record only — log payments, no due dates"
        />
      </div>

      {/*
        A record-only policy has no agreed premium or schedule, so the fields
        that describe one are hidden rather than left to be filled in with
        figures nothing will use.
      */}
      {!recordOnly ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Premium amount">
              <TextInput
                type="number"
                inputMode="decimal"
                min="0"
                value={premiumAmount}
                onChange={(e) => setPremiumAmount(e.target.value)}
                placeholder="0.00"
              />
            </Field>
            <Field label="Frequency">
              <SelectInput value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                {Object.entries(PREMIUM_FREQUENCY_META).map(([value, m]) => (
                  <option key={value} value={value}>
                    {m.label}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>

          {!isOneTime ? (
            <Field label="Next premium due">
              <TextInput
                type="date"
                value={nextDueDate}
                onChange={(e) => setNextDueDate(e.target.value)}
              />
            </Field>
          ) : null}
        </>
      ) : null}

      {/*
        Everything below is optional. Insurance and investment products carry a
        lot of paperwork, but none of it is needed to start tracking a premium —
        so it is collapsed rather than dropped, and can be filled in later.
      */}
      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className="mb-3 flex w-full items-center justify-between rounded-ios bg-fill/10 px-3 py-2.5 text-footnote font-medium text-label-secondary transition-colors hover:bg-fill/15"
      >
        <span>{showMore ? "Hide extra details" : "Add more details (optional)"}</span>
        <CaretDown
          size={16}
          className={cn("transition-transform", showMore && "rotate-180")}
        />
      </button>

      {showMore ? (
        <div className="mb-2 rounded-card border border-separator/40 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Provider">
              <TextInput
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="LIC"
              />
            </Field>
            <Field label="Policy / folio no.">
              <TextInput
                value={policyNumber}
                onChange={(e) => setPolicyNumber(e.target.value)}
                placeholder="Optional"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Start date">
              <TextInput
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field label="Maturity date" hint="Drives the term progress bar.">
              <TextInput
                type="date"
                value={maturityDate}
                onChange={(e) => setMaturityDate(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {isInsurance ? (
              <Field label="Sum assured">
                <TextInput
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={sumAssured}
                  onChange={(e) => setSumAssured(e.target.value)}
                  placeholder="Optional"
                />
              </Field>
            ) : null}
            <Field label="Value at maturity">
              <TextInput
                type="number"
                inputMode="decimal"
                min="0"
                value={maturityValue}
                onChange={(e) => setMaturityValue(e.target.value)}
                placeholder="Optional"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Paid from">
              <SelectInput value={walletFk} onChange={(e) => setWalletFk(e.target.value)}>
                {wallets.map((w) => (
                  <option key={w.walletPk} value={w.walletPk}>
                    {w.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Category">
              <CategorySelect
                value={categoryFk}
                onChange={setCategoryFk}
                filter={(c) => !c.income}
                placeholder="Bills & Fees"
              />
            </Field>
          </div>

          <Field label="Notes">
            <TextInput
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Nominee, agent, anything worth remembering"
            />
          </Field>

          <Toggle checked={pinned} onChange={setPinned} label="Show on home page" />
        </div>
      ) : null}
    </Sheet>
  );
}

/** Policies with a premium due soon, for the home screen. */
export function PoliciesWidget({ limit = 3 }: { limit?: number }) {
  const { policies, transactions, allWallets  } = useBudget(useShallow((s) => ({ policies: s.policies, transactions: s.transactions, allWallets: s.allWallets })));

  const totalCollections = useMemo(() => {
    let total = 0;
    for (const p of policies) {
      if (p.archived) continue;
      const status = getPolicyStatus(p, transactions);
      const wallet = allWallets.indexedByPk[p.walletFk];
      const ratio = amountRatioToPrimaryCurrency(allWallets, wallet?.currency);
      total += status.totalPaid * ratio;
    }
    return total;
  }, [policies, transactions, allWallets]);

  const annualPremium = useMemo(() => getTotalAnnualPremiums(allWallets, policies), [allWallets, policies]);

  return (
    <Link href="/budget/policies" className="block transition-transform active:scale-[0.98] outline-none rounded-[24px] focus-visible:ring-2 focus-visible:ring-accent">
      <Card className="hover:bg-fill/5 transition-colors">
        <div className="grid grid-cols-2 gap-3 text-center">
          <div>
            <p className="text-caption uppercase tracking-wide text-label-secondary/50">Collected</p>
            <Amount value={totalCollections} className="text-subhead font-semibold text-label" animated />
          </div>
          <div>
            <p className="text-caption uppercase tracking-wide text-label-secondary/50">Annual Premium</p>
            <Amount value={annualPremium} className="text-subhead font-semibold text-label" animated />
          </div>
        </div>
      </Card>
    </Link>
  );
}
