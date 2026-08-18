import { IS_MOBILE } from "./config";

/**
 * Hrefs for the detail screens whose id is user data.
 *
 * A static export has to enumerate every dynamic segment at build time, and an
 * account's primary key or a budget's id exist only in the user's own store —
 * there is nothing to enumerate. So the APK reaches those two screens through a
 * query string instead of a path segment, which needs no build-time knowledge
 * of the value.
 *
 * Everything else about the screens is identical: same route group, same
 * layout, same view component, same data. The difference is confined to this
 * file so no call site has to know which build it is in.
 *
 * `/stock/[ticker]` is deliberately not here. Its segment comes from a fixed
 * NSE/BSE universe, which *can* be enumerated, so it keeps real paths in both
 * builds and stays shareable as a link.
 */

export function accountDetailHref(walletPk: string): string {
  return IS_MOBILE
    ? `/budget/account-detail?wallet=${encodeURIComponent(walletPk)}`
    : `/budget/accounts/${encodeURIComponent(walletPk)}`;
}

export function budgetDetailHref(budgetPk: string): string {
  return IS_MOBILE
    ? `/budget/budget-detail?id=${encodeURIComponent(budgetPk)}`
    : `/budget/budgets/${encodeURIComponent(budgetPk)}`;
}
