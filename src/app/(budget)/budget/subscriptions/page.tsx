import type { Metadata } from "next";

import { PlanningView } from "@/components/budget/planning-view";
import { BudgetHeader, BudgetPage } from "@/components/budget/budget-ui";

export const metadata: Metadata = {
  title: "Subscriptions",
  description: "Recurring payments, normalised to a common period.",
};

export default function SubscriptionsPage() {
  return (
    <>
      <BudgetHeader title="Planning" />
      <BudgetPage>
        <PlanningView defaultTab="subscriptions" />
      </BudgetPage>
    </>
  );
}
