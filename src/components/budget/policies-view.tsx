"use client";

/**
 * Policies: LIC and other insurance, SIPs, PPF, deposits.
 *
 * These sit between a subscription and a goal — a recurring obligation that is
 * also an accumulating asset — which is why they get their own screen rather
 * than being squeezed into either. Recording a premium writes a real
 * transaction, so policy payments show up in spending like anything else.
 */

import { useMemo, useState } from "react";
import { CaretDown, CaretRight, Check, ShieldCheck } from "@phosphor-icons/react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import {
  POLICY_TYPE_META,
  PREMIUM_FREQUENCY_META,
  PolicyType,
  PremiumFrequency,
  type Policy,
} from "@/lib/budget/types";
import {
  getPolicyStatus,
  getPolicyTransactions,
  getTotalAnnualPremiums,
  getTotalSumAssured,
  nextPremiumDate,
} from "@/lib/budget/credit";
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
  const { policies, transactions, allWallets } = useBudget();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Policy | null>(null);

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
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
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
    </>
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
  const { transactions, upsertTransaction, upsertPolicy, wallets, settings } = useBudget();
  const [expanded, setExpanded] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState(policy.walletFk ?? settings.primaryWalletPk ?? wallets[0]?.walletPk ?? "");
  const [selectedDate, setSelectedDate] = useState(() => toDateInputValue(new Date()));
  const [selectedAmount, setSelectedAmount] = useState(() => String(Math.abs(policy.premiumAmount)));
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
    
    const parsedAmount = parseFloat(selectedAmount);
    if (!isNaN(parsedAmount) && parsedAmount > 0) {
      t.amount = -parsedAmount;
    }
    
    if (selectedWallet) t.walletFk = selectedWallet;
    upsertTransaction(t);
    upsertPolicy({
      ...policy,
      nextDueDate:
        policy.premiumFrequency === PremiumFrequency.oneTime
          ? null
          : nextPremiumDate(due, policy.premiumFrequency).toISOString(),
    });
  }

  return (
    <Card className="!p-4">
      <button type="button" onClick={() => setExpanded((e) => !e)} className="w-full text-left">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-headline text-label">{policy.name}</p>
            <p className="truncate text-caption text-label-secondary/60">
              {meta.label}
              {policy.provider ? ` · ${policy.provider}` : ""}
              {policy.policyNumber ? ` · ${policy.policyNumber}` : ""}
            </p>
          </div>
          {status.matured ? (
            <span className="shrink-0 rounded-full bg-green/12 px-2 py-0.5 text-caption2 font-semibold text-green">
              Matured
            </span>
          ) : status.isOverdue ? (
            <span className="shrink-0 rounded-full bg-red/12 px-2 py-0.5 text-caption2 font-semibold text-red">
              Overdue
            </span>
          ) : null}
        </div>

        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="text-title3 font-semibold">
            <Amount value={policy.premiumAmount} />
            <span className="ml-1 text-caption font-normal text-label-secondary/60">
              {freq.label.toLowerCase()}
            </span>
          </p>
          {status.nextDueDate && !status.matured ? (
            <p
              className={cn(
                "text-caption font-medium",
                status.isOverdue ? "text-red" : "text-label-secondary/60",
              )}
            >
              {status.isOverdue
                ? `${Math.abs(status.daysUntilDue ?? 0)} days overdue`
                : `Due in ${status.daysUntilDue} days`}
            </p>
          ) : null}
        </div>

        {status.termProgress !== null ? (
          <>
            <ProgressBar percent={status.termProgress} colour={policy.colour} height={6} />
            <p className="mt-1 text-caption text-label-secondary/50">
              {status.matured
                ? "Term complete"
                : `${status.monthsToMaturity} months to maturity`}
            </p>
          </>
        ) : null}

        <div className="mt-2 grid grid-cols-2 gap-2 text-caption">
          <span className="text-label-secondary/60">
            Paid in <Amount value={status.totalPaid} className="font-medium text-label" />
            {status.premiumsPaid > 0 ? ` (${status.premiumsPaid})` : ""}
          </span>
          {policy.sumAssured !== null ? (
            <span className="text-right text-label-secondary/60">
              Cover <Amount value={policy.sumAssured} className="font-medium text-label" compact />
            </span>
          ) : policy.maturityValue !== null ? (
            <span className="text-right text-label-secondary/60">
              At maturity{" "}
              <Amount value={policy.maturityValue} className="font-medium text-label" compact />
            </span>
          ) : null}
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
                className="flex flex-1 items-center justify-center gap-1.5 rounded-ios bg-green/12 py-2 text-footnote font-semibold text-green transition-transform active:scale-95"
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
  const { wallets, upsertPolicy, deletePolicy } = useBudget();

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
      premiumAmount: Number(premiumAmount) || 0,
      premiumFrequency: Number(frequency) as PremiumFrequency,
      startDate: atMidday(fromDateInputValue(startDate)).toISOString(),
      nextDueDate:
        isOneTime || !nextDueDate ? null : atMidday(fromDateInputValue(nextDueDate)).toISOString(),
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
  const { policies, transactions } = useBudget();

  const due = useMemo(
    () =>
      policies
        .filter((p) => !p.archived && p.pinned && p.nextDueDate)
        .map((p) => ({ policy: p, status: getPolicyStatus(p, transactions) }))
        .filter((x) => !x.status.matured)
        .sort(
          (a, b) =>
            (a.status.nextDueDate?.getTime() ?? 0) - (b.status.nextDueDate?.getTime() ?? 0),
        )
        .slice(0, limit),
    [policies, transactions, limit],
  );

  if (due.length === 0) {
    return (
      <Link
        href="/budget/policies"
        className="flex items-center gap-3 rounded-[18px] bg-bg-secondary p-4 shadow-sm ring-1 ring-black/5 transition-transform active:scale-[0.98] dark:ring-white/10"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fill/5 text-label-secondary">
          <ShieldCheck size={20} />
        </div>
        <div className="flex-1">
          <span className="block text-subhead font-medium text-label">Add a policy</span>
          <span className="block text-caption text-label-secondary/60">Track insurance and renewals</span>
        </div>
        <CaretRight size={18} className="text-label-secondary/30" />
      </Link>
    );
  }

  return (
    <div className="space-y-3">
      {due.map(({ policy }) => (
        <PolicyCard key={policy.policyPk} policy={policy} compact />
      ))}
    </div>
  );
}
