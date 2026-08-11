import type { Metadata } from "next";

import { BudgetDashboard } from "@/components/budget/budget-dashboard";
import { BudgetHeader, BudgetPage } from "@/components/budget/budget-ui";

export const metadata: Metadata = {
  title: "Budget",
  description: "Track your spending, budgets, goals and accounts.",
};

export default function BudgetHomePage() {
  return (
    <>
      <BudgetHeader 
        title="Overview"
        width="fluid"
      />
      <BudgetPage width="fluid">
        <BudgetDashboard />
      </BudgetPage>
    </>
  );
}
