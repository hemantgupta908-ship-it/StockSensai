"use client";

/**
 * Subscriptions, and the Upcoming & Overdue list.
 *
 * The period switcher at the top uses `getTotalSubscriptions`, Cashew's
 * normalisation of recurring costs onto a monthly/yearly basis — a ₹1,200/year
 * subscription reads as ₹100 monthly.
 */

import { useMemo, useState } from "react";
import { CalendarClock, Repeat, ChevronRight } from "lucide-react";
import Link from "next/link";

import { TransactionSpecialType, type Transaction } from "@/lib/budget/types";
import {
  getTotalSubscriptions,
  isOverdue,
  isUpcoming,
  type SelectedSubscriptionsType,
} from "@/lib/budget/calculations";
import { useBudget } from "./budget-provider";
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
  const { transactions, allWallets } = useBudget();
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
      <Card className="mb-4 text-center">
        <Amount value={Math.abs(total)} className="text-largetitle font-semibold" />
        <p className="mb-3 mt-0.5 text-caption text-label-secondary/60">
          {period === "yearly"
            ? "Yearly subscriptions"
            : period === "monthly"
              ? "Monthly subscriptions"
              : "Total subscriptions"}
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
  const { transactions, allWallets } = useBudget();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

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

  const overdueTotal = overdue.reduce((sum, t) => sum + t.amount, 0);
  const upcomingTotal = getTotalSubscriptions(allWallets, "total", upcoming);

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
            {overdue.length} transaction{overdue.length === 1 ? "" : "s"}
          </p>
        </Card>
        <Card className="!p-3 text-center">
          <p className="text-caption uppercase tracking-wide text-label-secondary/50">Upcoming</p>
          <Amount value={Math.abs(upcomingTotal)} className="text-title3 font-semibold" />
          <p className="text-caption2 text-label-secondary/50">
            {upcoming.length} transaction{upcoming.length === 1 ? "" : "s"}
          </p>
        </Card>
      </div>

      {overdue.length === 0 && upcoming.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Nothing scheduled"
          description="Upcoming and subscription transactions that are not yet paid appear here."
        />
      ) : null}

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
export function UpcomingWidget({ limit = 4 }: { limit?: number }) {
  const { transactions } = useBudget();
  const [editing, setEditing] = useState<Transaction | null>(null);

  const items = useMemo(() => {
    const now = new Date();
    return transactions
      .filter((t) => isOverdue(t, now) || isUpcoming(t, now))
      .sort((a, b) => new Date(a.dateCreated).getTime() - new Date(b.dateCreated).getTime())
      .slice(0, limit);
  }, [transactions, limit]);

  if (items.length === 0) {
    return (
      <Link
        href="/budget/upcoming"
        className="flex items-center gap-3 rounded-[18px] bg-bg-secondary p-4 shadow-sm ring-1 ring-black/5 transition-transform active:scale-[0.98] dark:ring-white/10"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fill/5 text-label-secondary">
          <CalendarClock size={20} />
        </div>
        <div className="flex-1">
          <span className="block text-subhead font-medium text-label">No upcoming bills</span>
          <span className="block text-caption text-label-secondary/60">You're all caught up for now</span>
        </div>
        <ChevronRight size={18} className="text-label-secondary/30" />
      </Link>
    );
  }

  return (
    <>
      <TransactionGroup>
        {items.map((t) => (
          <TransactionRow key={t.transactionPk} transaction={t} onEdit={setEditing} />
        ))}
      </TransactionGroup>
      <TransactionModal open={editing !== null} onClose={() => setEditing(null)} editing={editing} />
    </>
  );
}

/** Lent / borrowed summary for the home screen. */
export function CreditDebtWidget() {
  const { transactions, allWallets } = useBudget();
  const [editing, setEditing] = useState<Transaction | null>(null);

  const { lent, borrowed, items } = useMemo(() => {
    const credit = transactions.filter((t) => t.type === TransactionSpecialType.credit);
    const debt = transactions.filter((t) => t.type === TransactionSpecialType.debt);
    return {
      lent: credit.reduce((sum, t) => sum + Math.abs(t.amount), 0),
      borrowed: debt.reduce((sum, t) => sum + Math.abs(t.amount), 0),
      items: [...credit, ...debt].sort(
        (a, b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime(),
      ),
    };
  }, [transactions]);

  if (items.length === 0) {
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
    <>
      <Card className="mb-3 !p-3">
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
      <TransactionGroup>
        {items.slice(0, 4).map((t) => (
          <TransactionRow key={t.transactionPk} transaction={t} onEdit={setEditing} />
        ))}
      </TransactionGroup>
      <TransactionModal open={editing !== null} onClose={() => setEditing(null)} editing={editing} />
    </>
  );
}
