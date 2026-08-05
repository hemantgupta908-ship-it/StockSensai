import type { Metadata } from "next";

import { AccountsView } from "@/components/budget/accounts-view";
import { BudgetHeader, BudgetPage } from "@/components/budget/budget-ui";

export const metadata: Metadata = {
  title: "Accounts",
  description: "Where your money is stored, and its balance.",
};

export default function AccountsPage() {
  return (
    <>
      <BudgetHeader title="Accounts" backHref="/budget/more" />
      <BudgetPage>
        <AccountsView />
      </BudgetPage>
    </>
  );
}
