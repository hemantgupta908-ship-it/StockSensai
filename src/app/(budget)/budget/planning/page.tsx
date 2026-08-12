import type { Metadata } from "next";

import { PlanningView } from "@/components/budget/planning-view";
import { BudgetHeader, BudgetPage } from "@/components/budget/budget-ui";

export const metadata: Metadata = {
  title: "Planning",
  description: "Goals, loans, policies, and subscriptions.",
};

export default function PlanningPage() {
  return (
    <>
      <BudgetHeader title="Planning" />
      <BudgetPage>
        <PlanningView />
      </BudgetPage>
    </>
  );
}
