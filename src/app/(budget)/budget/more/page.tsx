import type { Metadata } from "next";

import { MoreView } from "@/components/budget/more-view";
import { BudgetHeader, BudgetPage } from "@/components/budget/budget-ui";

export const metadata: Metadata = {
  title: "More",
  description: "Goals, loans, accounts, categories, tools and settings.",
};

export default function MorePage() {
  return (
    <>
      <BudgetHeader title="More" large />
      <BudgetPage>
        <MoreView />
      </BudgetPage>
    </>
  );
}
