"use client";

/**
 * The budget home screen.
 *
 * Cashew lets each widget be reordered and hidden; the same widgets are here,
 * driven by the environment's own settings so the stock app's home screen is
 * unaffected.
 *
 * Layout: a full-width hero (net worth, accounts, this month), then the
 * remaining widgets in a two-column masonry from `xl` up. A single stacked
 * column is right on a phone but leaves a desktop looking like a narrow strip
 * in a field of whitespace, which is what the widths here are correcting.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { getNetWorth } from "@/lib/budget/calculations";
import { useBudget } from "./budget-provider";
import { AddFab, Amount, Card, Section } from "./budget-ui";
import { AccountsSummary } from "./accounts-view";
import { PinnedBudgets } from "./budgets-view";
import { PinnedObjectives } from "./objectives-view";
import { RecentTransactions } from "./transaction-list-view";
import { CreditDebtWidget, UpcomingWidget } from "./upcoming-view";
import { PoliciesWidget } from "./policies-view";
import { SpendingSummaryWidget, LineGraph, Heatmap } from "./analytics-view";
import { TransactionModal } from "./transaction-modal";

export function BudgetDashboard() {
  const { transactions, allWallets, settings, loading } = useBudget();
  const [addOpen, setAddOpen] = useState(false);

  const netWorth = useMemo(
    () => getNetWorth(allWallets, transactions),
    [allWallets, transactions],
  );

  const monthStart = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 xl:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-card bg-bg-secondary" />
        ))}
      </div>
    );
  }

  return (
    <>
      {/* Hero: the three things worth seeing before scrolling. */}
      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(260px,340px)_1fr]">
        {settings.showNetWorth ? (
          <Card className="flex flex-col justify-center !py-6 text-center">
            <p className="text-caption uppercase tracking-wide text-label-secondary/50">
              Net worth
            </p>
            <Amount value={netWorth} className="text-largetitle font-semibold" colour />
          </Card>
        ) : null}

        <div className="min-w-0 space-y-4">
          {settings.showWalletSwitcher ? (
            <Section title="Accounts" action={<SeeAll href="/budget/accounts" />} className="!mb-0">
              <AccountsSummary />
            </Section>
          ) : null}
          {settings.showAllSpendingSummary ? (
            <Section title="This month" className="!mb-0">
              <SpendingSummaryWidget />
            </Section>
          ) : null}
        </div>
      </div>

      {/* Everything else, balanced across two columns on wide screens. */}
      <div className="gap-x-6 xl:columns-2 [&>section]:break-inside-avoid">
        {settings.showPinnedBudgets ? (
          <Section title="Budgets" action={<SeeAll href="/budget/budgets" />}>
            <PinnedBudgets />
          </Section>
        ) : null}

        {settings.showObjectives ? (
          <Section title="Goals" action={<SeeAll href="/budget/goals" />}>
            <PinnedObjectives />
          </Section>
        ) : null}

        {settings.showUpcomingTransactions ? (
          <Section title="Overdue & upcoming" action={<SeeAll href="/budget/upcoming" />}>
            <UpcomingWidget />
          </Section>
        ) : null}

        {settings.showCreditDebt ? (
          <Section title="Lent & borrowed">
            <CreditDebtWidget />
          </Section>
        ) : null}

        {settings.showPolicies ? (
          <Section title="Policies" action={<SeeAll href="/budget/policies" />}>
            <PoliciesWidget />
          </Section>
        ) : null}

        {settings.showLineGraph ? (
          <Section title="This month's trend">
            <Card>
              <LineGraph start={monthStart} end={new Date()} />
            </Card>
          </Section>
        ) : null}

        {settings.showHeatmap ? (
          <Section title="Daily spending">
            <Card>
              <Heatmap start={monthStart} end={new Date()} />
            </Card>
          </Section>
        ) : null}

        <Section title="Recent transactions" action={<SeeAll href="/budget/transactions" />}>
          <RecentTransactions />
        </Section>
      </div>

      <AddFab onClick={() => setAddOpen(true)} label="Add transaction" />
      <TransactionModal open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}

function SeeAll({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-0.5 text-footnote font-medium text-green transition-opacity hover:opacity-70"
    >
      See all
      <ChevronRight size={14} />
    </Link>
  );
}
