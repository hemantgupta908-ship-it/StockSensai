import { AppShell } from "@/components/shell/app-shell";
import { requireUser } from "@/lib/supabase/server";

/**
 * Investing screens.
 *
 * The shell is shared with every other screen in the product — see `AppShell`.
 * This layout exists only to resolve the user on the server, so signed-in
 * screens render correctly on first paint rather than flashing a signed-out
 * state.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}
