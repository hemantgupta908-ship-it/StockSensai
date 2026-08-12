import type { Metadata } from "next";

import { PlanningView } from "@/components/budget/planning-view";
import { BudgetHeader, BudgetPage } from "@/components/budget/budget-ui";

export const metadata: Metadata = {
  title: "Policies",
  description: "LIC and other insurance, SIPs, PPF, deposits.",
};

export default function PoliciesPage() {
  return (
    <>
      <BudgetHeader title="Planning" />
      <BudgetPage>
        <PlanningView defaultTab="policies" />
      </BudgetPage>
    </>
  );
}
