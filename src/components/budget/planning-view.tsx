"use client";
import { useShallow } from "zustand/react/shallow";

import { useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Flag, CreditCard, ShieldCheck, Repeat } from "@phosphor-icons/react";

import { ObjectivesView } from "@/components/budget/objectives-view";
import { PoliciesView } from "@/components/budget/policies-view";
import { SubscriptionsView } from "@/components/budget/upcoming-view";
import { ObjectiveType, TransactionSpecialType } from "@/lib/budget/types";
import { useBudget } from "./budget-provider";
import { Amount, Card } from "./budget-ui";
import {
  getTotalTowardsObjective,
  getTotalSubscriptions,
  isIndefiniteLoan,
} from "@/lib/budget/calculations";
import { getTotalAnnualPremiums } from "@/lib/budget/credit";

export type PlanningTab = "loans" | "policies" | "subscriptions" | "goals";

/** Derived from the type so a new tab cannot be added and left unrecognised. */
const PLANNING_TABS: PlanningTab[] = ["loans", "policies", "subscriptions", "goals"];

export function PlanningView({ defaultTab }: { defaultTab?: PlanningTab }) {
  return (
    <Suspense fallback={<PlanningViewContent defaultTab={defaultTab} />}>
      <PlanningViewContent defaultTab={defaultTab} />
    </Suspense>
  );
}

function PlanningViewContent({ defaultTab }: { defaultTab?: PlanningTab }) {
  const { objectives, policies, transactions, allWallets  } = useBudget(useShallow((s) => ({ objectives: s.objectives, policies: s.policies, transactions: s.transactions, allWallets: s.allWallets })));
  const searchParams = useSearchParams();
  const paramTab = searchParams ? (searchParams.get("tab") as PlanningTab | null) : null;

  const urlTab = paramTab && PLANNING_TABS.includes(paramTab) ? paramTab : null;
  const fallbackTab = defaultTab ?? "loans";

  /** The tab the user picked by hand, if any, outranking the URL. */
  const [picked, setPicked] = useState<PlanningTab | null>(null);
  const [seenUrlTab, setSeenUrlTab] = useState<PlanningTab | null>(urlTab);

  // Adjusting state during render, which React documents as the right way to
  // reset state when a prop changes — and which the previous `useEffect` did a
  // render too late, showing the old tab for one frame before correcting.
  //
  // A new `?tab=` means the URL is making a fresh request, so any earlier
  // hand-pick is stale and must not keep winning.
  if (urlTab !== seenUrlTab) {
    setSeenUrlTab(urlTab);
    setPicked(null);
  }

  const activeTab = picked ?? urlTab ?? fallbackTab;

  const handleTabChange = (nextTab: PlanningTab) => {
    // Held locally rather than read back out of the URL: the write below uses
    // `history.replaceState`, which `useSearchParams` does not observe, so the
    // URL alone would not re-render this component.
    setPicked(nextTab);
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      params.set("tab", nextTab);
      window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    }
  };

  // Metrics calculations for summary banner
  const metrics = useMemo(() => {
    // 1. Loans
    const activeLoans = objectives.filter((o) => o.type === ObjectiveType.loan && !o.archived);
    let totalLoanRemaining = 0;
    activeLoans.forEach((l) => {
      if (!isIndefiniteLoan(l)) {
        const paid = getTotalTowardsObjective(allWallets, transactions, l);
        const remaining = Math.max(0, l.amount - paid);
        totalLoanRemaining += remaining;
      }
    });

    // 2. Policies
    const activePolicies = policies.filter((p) => !p.archived);
    const annualPremiums = getTotalAnnualPremiums(allWallets, activePolicies);

    // 3. Subscriptions
    const subTransactions = transactions.filter(
      (t) =>
        (t.type === TransactionSpecialType.subscription || t.type === TransactionSpecialType.repetitive) &&
        !t.paid &&
        !t.skipPaid,
    );
    const monthlySubTotal = getTotalSubscriptions(allWallets, "monthly", subTransactions);

    // 4. Goals
    const activeGoals = objectives.filter((o) => o.type === ObjectiveType.goal && !o.archived);
    let totalGoalSaved = 0;
    let totalGoalTarget = 0;
    activeGoals.forEach((g) => {
      const saved = getTotalTowardsObjective(allWallets, transactions, g);
      totalGoalSaved += saved;
      totalGoalTarget += g.amount;
    });

    return {
      loans: { count: activeLoans.length, remaining: totalLoanRemaining },
      policies: { count: activePolicies.length, annualPremiums },
      subscriptions: { count: subTransactions.length, monthlyTotal: Math.abs(monthlySubTotal) },
      goals: { count: activeGoals.length, saved: totalGoalSaved, target: totalGoalTarget },
    };
  }, [objectives, policies, transactions, allWallets]);

  return (
    <div className="space-y-6">
      {/* Top Planning Summary Stat Cards - Act as tab selectors in single horizontal scroll */}
      <div className="flex gap-3 overflow-x-auto pb-2 pt-1 no-scrollbar snap-x snap-mandatory -mx-1 px-1 sm:grid sm:grid-cols-4 sm:overflow-visible">
        {/* 1. Loans Metric Card */}
        <Card
          onClick={() => handleTabChange("loans")}
          className={`shrink-0 min-w-[155px] sm:min-w-0 flex-1 cursor-pointer border p-3.5 snap-start transition-all duration-200 ${
            activeTab === "loans"
              ? "border-accent bg-accent/10 ring-2 ring-accent/30 shadow-md scale-[1.02]"
              : "border-separator/30 hover:border-separator/60 hover:bg-fill/5 opacity-80 hover:opacity-100"
          }`}
        >
          <div className="flex items-center justify-between text-label-secondary mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider opacity-80">Loans</span>
            <CreditCard size={17} className={activeTab === "loans" ? "text-accent" : "opacity-50"} />
          </div>
          <p className="text-subhead font-extrabold text-label truncate">
            <Amount value={metrics.loans.remaining} />
          </p>
          <p className="mt-0.5 text-[10px] text-label-secondary/70 truncate font-medium">
            Left to pay across {metrics.loans.count} loan{metrics.loans.count === 1 ? "" : "s"}
          </p>
        </Card>

        {/* 2. Policies Metric Card */}
        <Card
          onClick={() => handleTabChange("policies")}
          className={`shrink-0 min-w-[155px] sm:min-w-0 flex-1 cursor-pointer border p-3.5 snap-start transition-all duration-200 ${
            activeTab === "policies"
              ? "border-accent bg-accent/10 ring-2 ring-accent/30 shadow-md scale-[1.02]"
              : "border-separator/30 hover:border-separator/60 hover:bg-fill/5 opacity-80 hover:opacity-100"
          }`}
        >
          <div className="flex items-center justify-between text-label-secondary mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider opacity-80">Policies</span>
            <ShieldCheck size={17} className={activeTab === "policies" ? "text-accent" : "opacity-50"} />
          </div>
          <p className="text-subhead font-extrabold text-label truncate">
            <Amount value={metrics.policies.annualPremiums} />
          </p>
          <p className="mt-0.5 text-[10px] text-label-secondary/70 truncate font-medium">
            Annual premium ({metrics.policies.count} policies)
          </p>
        </Card>

        {/* 3. Subscriptions Metric Card */}
        <Card
          onClick={() => handleTabChange("subscriptions")}
          className={`shrink-0 min-w-[155px] sm:min-w-0 flex-1 cursor-pointer border p-3.5 snap-start transition-all duration-200 ${
            activeTab === "subscriptions"
              ? "border-accent bg-accent/10 ring-2 ring-accent/30 shadow-md scale-[1.02]"
              : "border-separator/30 hover:border-separator/60 hover:bg-fill/5 opacity-80 hover:opacity-100"
          }`}
        >
          <div className="flex items-center justify-between text-label-secondary mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider opacity-80">Subscriptions</span>
            <Repeat size={17} className={activeTab === "subscriptions" ? "text-accent" : "opacity-50"} />
          </div>
          <p className="text-subhead font-extrabold text-label truncate">
            <Amount value={metrics.subscriptions.monthlyTotal} />
          </p>
          <p className="mt-0.5 text-[10px] text-label-secondary/70 truncate font-medium">
            Monthly ({metrics.subscriptions.count} recurring)
          </p>
        </Card>

        {/* 4. Goals Metric Card */}
        <Card
          onClick={() => handleTabChange("goals")}
          className={`shrink-0 min-w-[155px] sm:min-w-0 flex-1 cursor-pointer border p-3.5 snap-start transition-all duration-200 ${
            activeTab === "goals"
              ? "border-accent bg-accent/10 ring-2 ring-accent/30 shadow-md scale-[1.02]"
              : "border-separator/30 hover:border-separator/60 hover:bg-fill/5 opacity-80 hover:opacity-100"
          }`}
        >
          <div className="flex items-center justify-between text-label-secondary mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider opacity-80">Goals</span>
            <Flag size={17} className={activeTab === "goals" ? "text-accent" : "opacity-50"} />
          </div>
          <p className="text-subhead font-extrabold text-label truncate">
            <Amount value={metrics.goals.saved} />
          </p>
          <p className="mt-0.5 text-[10px] text-label-secondary/70 truncate font-medium">
            {metrics.goals.count} active goal{metrics.goals.count === 1 ? "" : "s"}
          </p>
        </Card>
      </div>

      {activeTab === "loans" && <ObjectivesView type={ObjectiveType.loan} />}
      {activeTab === "policies" && <PoliciesView />}
      {activeTab === "subscriptions" && <SubscriptionsView />}
      {activeTab === "goals" && <ObjectivesView type={ObjectiveType.goal} />}
    </div>
  );
}
