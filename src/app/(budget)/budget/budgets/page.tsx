import type { Metadata } from "next";

import { BudgetsListView } from "@/components/budget/budgets-view";
import { BudgetHeader, BudgetPage } from "@/components/budget/budget-ui";

export const metadata: Metadata = {
  title: "Budgets",
  description: "Planned spending and saving limits by period.",
};

export default function BudgetsPage() {
  return (
    <>
      <BudgetHeader title="Budgets" large width="fluid" />
      <BudgetPage width="fluid">
        <BudgetsListView />
      </BudgetPage>
    </>
  );
}
