import type { Metadata } from "next";

import { TransactionListView } from "@/components/budget/transaction-list-view";
import { BudgetHeader, BudgetPage } from "@/components/budget/budget-ui";

export const metadata: Metadata = {
  title: "Transactions",
  description: "Search and filter every transaction you've recorded.",
};

export default function TransactionsPage() {
  return (
    <>
      <BudgetHeader title="Transactions" large />
      <BudgetPage>
        <TransactionListView />
      </BudgetPage>
    </>
  );
}
