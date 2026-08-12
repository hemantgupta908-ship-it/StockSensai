import type { Metadata } from "next";

import { PlanningView } from "@/components/budget/planning-view";
import { BudgetHeader, BudgetPage } from "@/components/budget/budget-ui";

export const metadata: Metadata = {
  title: "Loans",
  description: "Track money you've lent or borrowed.",
};

export default function LoansPage() {
  return (
    <>
      <BudgetHeader title="Planning" />
      <BudgetPage>
        <PlanningView defaultTab="loans" />
      </BudgetPage>
    </>
  );
}
