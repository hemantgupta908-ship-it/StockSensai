import type { Metadata } from "next";

import { PoliciesView } from "@/components/budget/policies-view";
import { BudgetHeader, BudgetPage } from "@/components/budget/budget-ui";

export const metadata: Metadata = {
  title: "Policies",
  description: "LIC and other insurance, SIPs, PPF and deposits.",
};

export default function PoliciesPage() {
  return (
    <>
      <BudgetHeader
        title="Policies"
        subtitle="Insurance, SIP, PPF and deposits"
        backHref="/budget/more"
      />
      <BudgetPage>
        <PoliciesView />
      </BudgetPage>
    </>
  );
}
