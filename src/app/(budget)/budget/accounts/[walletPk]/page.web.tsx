"use client";

import { use } from "react";

import { AccountTransactionsView } from "@/components/budget/account-transactions-view";

export default function AccountTransactionsPage({
  params,
}: {
  params: Promise<{ walletPk: string }>;
}) {
  const { walletPk } = use(params);
  return <AccountTransactionsView walletPk={walletPk} />;
}
