"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { BudgetDetailView } from "@/components/budget/budgets-view";
import { BudgetHeader, BudgetPage } from "@/components/budget/budget-ui";

/**
 * `/budget/budgets/[id]`, addressed by query string.
 *
 * Same reasoning as `account-detail`: the id is user data, so the segment
 * cannot be enumerated for a static export. The screen is otherwise identical.
 */
export default function BudgetDetailPage() {
  return (
    <>
      <BudgetHeader title="Budget" backHref="/budget/budgets" />
      <BudgetPage>
        <Suspense fallback={null}>
          <Detail />
        </Suspense>
      </BudgetPage>
    </>
  );
}

function Detail() {
  const budgetPk = useSearchParams().get("id") ?? "";
  return <BudgetDetailView budgetPk={budgetPk} />;
}
