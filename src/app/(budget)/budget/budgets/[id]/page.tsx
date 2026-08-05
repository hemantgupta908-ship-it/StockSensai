import { BudgetDetailView } from "@/components/budget/budgets-view";
import { BudgetHeader, BudgetPage } from "@/components/budget/budget-ui";

export default async function BudgetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <BudgetHeader title="Budget" backHref="/budget/budgets" />
      <BudgetPage>
        <BudgetDetailView budgetPk={id} />
      </BudgetPage>
    </>
  );
}
