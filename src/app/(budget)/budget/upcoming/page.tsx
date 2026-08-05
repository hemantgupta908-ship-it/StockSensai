import type { Metadata } from "next";

import { UpcomingView } from "@/components/budget/upcoming-view";
import { BudgetHeader, BudgetPage } from "@/components/budget/budget-ui";

export const metadata: Metadata = {
  title: "Upcoming & Overdue",
  description: "Scheduled transactions that haven't been paid yet.",
};

export default function UpcomingPage() {
  return (
    <>
      <BudgetHeader title="Overdue & Upcoming" backHref="/budget/more" />
      <BudgetPage>
        <UpcomingView />
      </BudgetPage>
    </>
  );
}
