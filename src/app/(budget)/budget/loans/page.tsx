import type { Metadata } from "next";

import { ObjectivesView } from "@/components/budget/objectives-view";
import { ObjectiveType } from "@/lib/budget/types";
import { BudgetHeader, BudgetPage } from "@/components/budget/budget-ui";

export const metadata: Metadata = {
  title: "Loans",
  description: "Track money you've lent or borrowed.",
};

export default function LoansPage() {
  return (
    <>
      <BudgetHeader title="Loans" backHref="/budget/more" />
      <BudgetPage>
        <ObjectivesView type={ObjectiveType.loan} />
      </BudgetPage>
    </>
  );
}
