"use client";

import { usePathname } from "next/navigation";

/**
 * The current path, without a trailing slash.
 *
 * The Android build sets `trailingSlash: true` — a static export has to, since
 * its routes are `budget/index.html` files on disk rather than server routes —
 * and that changes what `usePathname()` returns. On the web it is `/budget`; in
 * the APK it is `/budget/`.
 *
 * Every path comparison in the app was written against the web's answer, so in
 * the APK all of them quietly failed: `pathname === "/budget"` was false on the
 * budget screen, which made `BudgetHeader` decide it was on a sub-page and
 * render a back arrow where the hamburger belongs. The tab bar and sidebar
 * highlighted nothing for the same reason.
 *
 * Normalising here rather than at each comparison means a new call site cannot
 * reintroduce the bug by forgetting. Use this instead of `usePathname` wherever
 * the value is compared to a route.
 */
export function useAppPathname(): string {
  const pathname = usePathname();
  if (!pathname) return "/";
  // Only strip from real paths — "/" must stay "/".
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}
