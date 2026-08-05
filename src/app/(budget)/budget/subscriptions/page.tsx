import type { Metadata } from "next";

import { SubscriptionsView } from "@/components/budget/upcoming-view";
import { BudgetHeader, BudgetPage } from "@/components/budget/budget-ui";

export const metadata: Metadata = {
  title: "Subscriptions",
  description: "Recurring payments, normalised to a common period.",
};

export default function SubscriptionsPage() {
  return (
    <>
      <BudgetHeader title="Subscriptions" large />
      <BudgetPage>
        <SubscriptionsView />
      </BudgetPage>
    </>
  );
}
