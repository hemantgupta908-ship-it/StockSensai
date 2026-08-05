import type { Metadata } from "next";

import { CategoriesView } from "@/components/budget/categories-view";
import { BudgetHeader, BudgetPage } from "@/components/budget/budget-ui";

export const metadata: Metadata = {
  title: "Categories",
  description: "How your spending is grouped.",
};

export default function CategoriesPage() {
  return (
    <>
      <BudgetHeader title="Categories" backHref="/budget/more" />
      <BudgetPage>
        <CategoriesView />
      </BudgetPage>
    </>
  );
}
