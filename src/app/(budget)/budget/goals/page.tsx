import type { Metadata } from "next";

import { PlanningView } from "@/components/budget/planning-view";
import { BudgetHeader, BudgetPage } from "@/components/budget/budget-ui";

export const metadata: Metadata = {
  title: "Goals",
  description: "Save or spend towards a target amount.",
};

export default function GoalsPage() {
  return (
    <>
      <BudgetHeader title="Planning" />
      <BudgetPage>
        <PlanningView defaultTab="goals" />
      </BudgetPage>
    </>
  );
}
