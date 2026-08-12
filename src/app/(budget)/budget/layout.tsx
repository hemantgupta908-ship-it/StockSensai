import { AppShell } from "@/components/shell/app-shell";
import { requireUser } from "@/lib/supabase/server";

/**
 * Money screens.
 *
 * Renders the same `AppShell` as the investing side — same sidebar, same tab
 * bar, same providers. This used to be a sibling shell with its own navigation
 * and an environment switcher to cross between the two.
 */
export default async function BudgetLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}
