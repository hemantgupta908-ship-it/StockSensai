import type { Metadata } from "next";

import { ObjectivesView } from "@/components/budget/objectives-view";
import { ObjectiveType } from "@/lib/budget/types";
import { BudgetHeader, BudgetPage } from "@/components/budget/budget-ui";

export const metadata: Metadata = {
  title: "Goals",
  description: "Save or spend towards a target amount.",
};

export default function GoalsPage() {
  return (
    <>
      <BudgetHeader title="Goals" backHref="/budget" />
      <BudgetPage>
        <ObjectivesView type={ObjectiveType.goal} />
      </BudgetPage>
    </>
  );
}
