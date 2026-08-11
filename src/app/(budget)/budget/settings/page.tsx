import type { Metadata } from "next";

import { BudgetSettingsView } from "@/components/budget/budget-settings-view";
import { BudgetHeader, BudgetPage } from "@/components/budget/budget-ui";

export const metadata: Metadata = {
  title: "Budget Settings",
  description: "Preferences for the budget environment only.",
};

export default function BudgetSettingsPage() {
  return (
    <>
      <BudgetHeader
        title="Settings"
      />
      <BudgetPage>
        <BudgetSettingsView />
      </BudgetPage>
    </>
  );
}
