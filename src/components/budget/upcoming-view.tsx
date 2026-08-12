"use client";
import { useShallow } from "zustand/react/shallow";

import { useMemo, useState } from "react";
import { CalendarCheck, CaretRight, CreditCard, Repeat } from "@phosphor-icons/react";
import Link from "next/link";

import { ObjectiveType, TransactionSpecialType, type Transaction, type Objective } from "@/lib/budget/types";
import {
  getIndefiniteLoanBalance,
  getTotalTowardsObjective,
  getTotalSubscriptions,
  isOverdue,
  isUpcoming,
  type SelectedSubscriptionsType,
} from "@/lib/budget/calculations";
import { getCreditCardStatus, isCreditCard } from "@/lib/budget/credit";
import { amountRatioToPrimaryCurrency } from "@/lib/budget/currency";
import { formatDate, formatINR } from "@/lib/utils";
import { useBudget } from "./budget-provider";
import { ObjectiveCard } from "./objectives-view";
import {
  AddFab,
  Amount,
  Card,
  EmptyState,
  SegmentedTabs,
  formatDayHeading,
  useGroupedByDay,
} from "./budget-ui";
import { TransactionGroup, TransactionRow } from "./transaction-row";
import { TransactionModal } from "./transaction-modal";

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export function SubscriptionsView() {
  const { transactions, allWallets  } = useBudget(useShallow((s) => ({ transactions: s.transactions, allWallets: s.allWallets })));
  const [period, setPeriod] = useState<SelectedSubscriptionsType>("monthly");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const subscriptions = useMemo(
    () =>
      transactions
        .filter(
          (t) =>
            t.type === TransactionSpecialType.subscription ||
            t.type === TransactionSpecialType.repetitive,
        )
        // One row per chain: an already-settled instance has a successor that
        // represents the live subscription, so showing both would double-count.
        .filter((t) => !t.paid && !t.skipPaid)
        .sort((a, b) => new Date(a.dateCreated).getTime() - new Date(b.dateCreated).getTime()),
    [transactions],
  );

  const total = useMemo(
    () => getTotalSubscriptions(allWallets, period, subscriptions),
    [allWallets, period, subscriptions],
  );

  return (
    <>
      <Card className="mb-5 relative overflow-hidden rounded-2xl border border-separator/40 bg-bg-secondary p-5 text-center shadow-card hover:shadow-md transition-all duration-200">
        <p className="text-[11px] font-bold uppercase tracking-wider text-label-secondary/50">
          {period === "yearly"
            ? "Yearly Total"
            : period === "monthly"
              ? "Monthly Total"
              : "Combined Total"}
        </p>
        <div className="my-1.5">
          <Amount value={Math.abs(total)} className="text-3xl font-extrabold text-label" />
        </div>
        <p className="mb-4 text-xs font-medium text-label-secondary/60">
          {subscriptions.length} active recurring payment{subscriptions.length === 1 ? "" : "s"}
        </p>
        <SegmentedTabs
          value={period}
          onChange={setPeriod}
          options={[
            { value: "monthly", label: "Monthly" },
            { value: "yearly", label: "Yearly" },
            { value: "total", label: "Total" },
          ]}
        />
      </Card>

      {subscriptions.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No subscription transactions"
          description="Recurring payments you add will show up here, normalised to a common period."
        />
      ) : (
        <TransactionGroup>
          {subscriptions.map((t) => (
            <TransactionRow
              key={t.transactionPk}
              transaction={t}
              onEdit={(tx) => {
                setEditing(tx);
                setModalOpen(true);
              }}
              showAccount
            />
          ))}
        </TransactionGroup>
      )}

      <AddFab
        onClick={() => {
          setEditing(null);
          setModalOpen(true);
        }}
        label="Add subscription"
      />
      <TransactionModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        editing={editing}
        defaults={{ type: TransactionSpecialType.subscription }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Upcoming & overdue
// ---------------------------------------------------------------------------

export function UpcomingView() {
  const { transactions, allWallets  } = useBudget(useShallow((s) => ({ transactions: s.transactions, allWallets: s.allWallets })));
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  // Calculate credit card bills & current cycle spend
  const creditCardBills = useMemo(() => {
    const now = new Date();
    const list: Array<{
      wallet: (typeof allWallets.list)[0];
      status: ReturnType<typeof getCreditCardStatus>;
      isOverdue: boolean;
    }> = [];

    for (const wallet of allWallets.list) {
      if (isCreditCard(wallet)) {
        const status = getCreditCardStatus(wallet, transactions, now);
        if (status.outstanding > 0 || status.currentCycleSpend > 0) {
          const isOverdue = Boolean(status.daysUntilDue !== null && status.daysUntilDue < 0);
          list.push({ wallet, status, isOverdue });
        }
      }
    }
    return list;
  }, [allWallets, transactions]);

  const { overdue, upcoming } = useMemo(() => {
    const now = new Date();
    return {
      overdue: transactions
        .filter((t) => isOverdue(t, now))
        .sort((a, b) => new Date(a.dateCreated).getTime() - new Date(b.dateCreated).getTime()),
      upcoming: transactions
        .filter((t) => isUpcoming(t, now))
        .sort((a, b) => new Date(a.dateCreated).getTime() - new Date(b.dateCreated).getTime()),
    };
  }, [transactions]);

  // Aggregate credit card amounts into summary totals
  const ccOverdueSum = creditCardBills.filter((c) => c.isOverdue).reduce((s, c) => s + c.status.outstanding, 0);
  const ccUpcomingSum = creditCardBills.filter((c) => !c.isOverdue).reduce((s, c) => s + (c.status.outstanding || c.status.currentCycleSpend), 0);

  const overdueTotal = overdue.reduce((sum, t) => sum + t.amount, 0) + ccOverdueSum;
  const upcomingTotal = getTotalSubscriptions(allWallets, "total", upcoming) + ccUpcomingSum;

  const totalOverdueItems = overdue.length + creditCardBills.filter((c) => c.isOverdue).length;
  const totalUpcomingItems = upcoming.length + creditCardBills.filter((c) => !c.isOverdue).length;

  function openEdit(t: Transaction) {
    setEditing(t);
    setModalOpen(true);
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Card className="!p-3 text-center">
          <p className="text-caption uppercase tracking-wide text-label-secondary/50">Overdue</p>
          <Amount value={Math.abs(overdueTotal)} className="text-title3 font-semibold text-red" />
          <p className="text-caption2 text-label-secondary/50">
            {totalOverdueItems} transaction{totalOverdueItems === 1 ? "" : "s"}
          </p>
        </Card>
        <Card className="!p-3 text-center">
          <p className="text-caption uppercase tracking-wide text-label-secondary/50">Upcoming</p>
          <Amount value={Math.abs(upcomingTotal)} className="text-title3 font-semibold" />
          <p className="text-caption2 text-label-secondary/50">
            {totalUpcomingItems} transaction{totalUpcomingItems === 1 ? "" : "s"}
          </p>
        </Card>
      </div>

      {creditCardBills.length === 0 && overdue.length === 0 && upcoming.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="Nothing scheduled"
          description="Upcoming subscriptions and credit card statement payments appear here."
        />
      ) : null}

      {/* Credit Card Bills & Payments Section */}
      {creditCardBills.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2.5 px-1 text-footnote font-semibold uppercase tracking-wide text-label-secondary/70 flex items-center gap-1.5">
            <CreditCard size={15} className="text-accent" />
            Credit Card Bills & Payments
          </h2>
          <div className="space-y-2.5">
            {creditCardBills.map(({ wallet, status, isOverdue }) => (
              <div
                key={wallet.walletPk}
                className="flex items-center justify-between gap-3 rounded-2xl border border-separator/40 bg-bg-secondary p-4 shadow-card dark:border-white/[0.06]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue/15 text-blue">
                    <CreditCard size={20} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-subhead font-bold text-label">
                      {wallet.name}
                    </h3>
                    <p className="mt-0.5 text-caption text-label-secondary/60">
                      {status.nextDueDate
                        ? `${isOverdue ? "Overdue" : "Due"} ${formatDate(status.nextDueDate.toISOString())}`
                        : "Current statement balance"}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="numeric text-subhead font-bold text-label">
                    {formatINR(status.outstanding || status.currentCycleSpend)}
                  </div>
                  {status.available !== null && (
                    <p className="mt-0.5 text-caption2 text-label-secondary/50">
                      Limit {formatINR(wallet.creditLimit || 0, { decimals: 0 })}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {overdue.length > 0 ? (
        <section className="mb-5">
          <h2 className="mb-2 px-1 text-footnote font-semibold uppercase tracking-wide text-red">
            Overdue
          </h2>
          <TransactionGroup>
            {overdue.map((t) => (
              <TransactionRow key={t.transactionPk} transaction={t} onEdit={openEdit} showAccount />
            ))}
          </TransactionGroup>
        </section>
      ) : null}

      {upcoming.length > 0 ? (
        <UpcomingByDay items={upcoming} onEdit={openEdit} />
      ) : null}

      <AddFab
        onClick={() => {
          setEditing(null);
          setModalOpen(true);
        }}
        label="Add upcoming"
      />
      <TransactionModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        editing={editing}
        defaults={{ type: TransactionSpecialType.upcoming }}
      />
    </>
  );
}

function UpcomingByDay({
  items,
  onEdit,
}: {
  items: Transaction[];
  onEdit: (t: Transaction) => void;
}) {
  const grouped = useGroupedByDay(items);
  return (
    <section>
      <h2 className="mb-2 px-1 text-footnote font-semibold uppercase tracking-wide text-label-secondary/60">
        Upcoming
      </h2>
      <div className="space-y-4">
        {[...grouped].reverse().map(([day, dayItems]) => (
          <div key={day}>
            <h3 className="mb-1.5 px-1 text-footnote font-semibold text-label-secondary">
              {formatDayHeading(day)}
            </h3>
            <TransactionGroup>
              {dayItems.map((t) => (
                <TransactionRow key={t.transactionPk} transaction={t} onEdit={onEdit} showAccount />
              ))}
            </TransactionGroup>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Compact overdue/upcoming block for the home screen. */
export function UpcomingWidget() {
  const { transactions, allWallets  } = useBudget(useShallow((s) => ({ transactions: s.transactions, allWallets: s.allWallets })));

  const { upcomingTotal, overdueTotal } = useMemo(() => {
    const now = new Date();
    let upcomingTotal = 0;
    let overdueTotal = 0;

    for (const t of transactions) {
      if (isOverdue(t, now)) {
        const wallet = allWallets.indexedByPk[t.walletFk];
        const ratio = amountRatioToPrimaryCurrency(allWallets, wallet?.currency);
        overdueTotal += Math.abs(t.amount) * ratio;
      } else if (isUpcoming(t, now)) {
        const wallet = allWallets.indexedByPk[t.walletFk];
        const ratio = amountRatioToPrimaryCurrency(allWallets, wallet?.currency);
        upcomingTotal += Math.abs(t.amount) * ratio;
      }
    }

    // Include unbilled credit card spend as upcoming
    for (const wallet of allWallets.list) {
      if (wallet.accountType === 2) { // AccountType.creditCard
        const { getCreditCardStatus } = require("@/lib/budget/credit");
        const cardStatus = getCreditCardStatus(wallet, transactions);
        if (cardStatus.currentCycleSpend > 0) {
          const ratio = amountRatioToPrimaryCurrency(allWallets, wallet.currency);
          upcomingTotal += cardStatus.currentCycleSpend * ratio;
        }
      }
    }

    return { upcomingTotal, overdueTotal };
  }, [transactions, allWallets]);

  return (
    <Link href="/budget/upcoming" className="block transition-transform active:scale-[0.98] outline-none rounded-[24px] focus-visible:ring-2 focus-visible:ring-accent">
      <Card className="hover:bg-fill/5 transition-colors">
        <div className="grid grid-cols-2 gap-3 text-center">
          <div>
            <p className="text-caption uppercase tracking-wide text-label-secondary/50">Upcoming</p>
            <Amount value={upcomingTotal} className="text-subhead font-semibold text-label" />
          </div>
          <div>
            <p className="text-caption uppercase tracking-wide text-label-secondary/50">Overdue</p>
            <Amount value={overdueTotal} className="text-subhead font-semibold text-red" />
          </div>
        </div>
      </Card>
    </Link>
  );
}

/** Lent / borrowed summary for the home screen. */
export function CreditDebtWidget() {
  const { transactions, allWallets, objectives  } = useBudget(useShallow((s) => ({ transactions: s.transactions, allWallets: s.allWallets, objectives: s.objectives })));

  const { lent, borrowed, activeLoans } = useMemo(() => {
    let lentSum = 0;
    let borrowedSum = 0;

    const loans = objectives.filter((o) => o.type === ObjectiveType.loan && !o.archived);

    for (const o of loans) {
      if (o.amount === -1) {
        const bal = getIndefiniteLoanBalance(allWallets, transactions, o);
        if (bal < 0) lentSum += Math.abs(bal);
        if (bal > 0) borrowedSum += bal;
      } else {
        const paid = getTotalTowardsObjective(allWallets, transactions, o);
        const remaining = Math.max(0, o.amount - paid);
        if (o.income) borrowedSum += remaining;
        else lentSum += remaining;
      }
    }

    return {
      lent: lentSum,
      borrowed: borrowedSum,
      activeLoans: loans.sort((a, b) => a.order - b.order),
    };
  }, [objectives, transactions, allWallets]);

  if (activeLoans.length === 0 && lent === 0 && borrowed === 0) {
    return (
      <div className="flex items-center gap-3 rounded-[18px] bg-bg-secondary p-4 shadow-sm ring-1 ring-black/5 dark:ring-white/10">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fill/5 text-label-secondary">
          <Repeat size={20} />
        </div>
        <div className="flex-1">
          <span className="block text-subhead font-medium text-label">No active loans</span>
          <span className="block text-caption text-label-secondary/60">You haven't lent or borrowed any money</span>
        </div>
      </div>
    );
  }

  return (
    <Link href="/budget/loans" className="block transition-transform active:scale-[0.98] outline-none rounded-[24px] focus-visible:ring-2 focus-visible:ring-accent">
      <Card className="hover:bg-fill/5 transition-colors">
        <div className="grid grid-cols-2 gap-3 text-center">
          <div>
            <p className="text-caption uppercase tracking-wide text-label-secondary/50">Lent</p>
            <Amount value={lent} className="text-subhead font-semibold text-green" />
          </div>
          <div>
            <p className="text-caption uppercase tracking-wide text-label-secondary/50">Borrowed</p>
            <Amount value={borrowed} className="text-subhead font-semibold text-red" />
          </div>
        </div>
      </Card>
    </Link>
  );
}
