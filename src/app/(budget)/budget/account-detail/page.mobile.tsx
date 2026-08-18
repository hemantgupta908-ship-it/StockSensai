"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { AccountTransactionsView } from "@/components/budget/account-transactions-view";

/**
 * `/budget/accounts/[walletPk]`, addressed by query string.
 *
 * A wallet's primary key lives in the user's own store, so there is no set of
 * segments for the export to pre-render. The screen itself is unchanged — same
 * view component, same props — only the way it is addressed differs. See
 * `@/lib/mobile/routes`, which is where every link into it is built.
 */
export default function AccountDetailPage() {
  return (
    <Suspense fallback={null}>
      <AccountDetail />
    </Suspense>
  );
}

function AccountDetail() {
  const walletPk = useSearchParams().get("wallet") ?? "";
  return <AccountTransactionsView walletPk={walletPk} />;
}
