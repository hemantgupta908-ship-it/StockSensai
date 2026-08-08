import { SessionProvider } from "@/components/auth/session-provider";
import { BudgetProvider } from "@/components/budget/budget-provider";
import { BudgetTabBar, BudgetTabBarSpacer, BudgetSidebar } from "@/components/budget/budget-nav";
import { BudgetThemeScope } from "@/components/budget/budget-theme-scope";
import { requireUser } from "@/lib/supabase/server";

/**
 * The budget environment's shell.
 *
 * This is a sibling of the stock app's shell rather than a page inside it: the
 * two share an auth session and nothing more, so the budget side brings its own
 * providers, navigation and theming and never renders the stock chrome.
 */
export default async function BudgetLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <SessionProvider initialUser={user}>
      <BudgetProvider>
        <BudgetThemeScope>
          <BudgetSidebar />
          <div className="min-h-dvh lg:pl-[248px]">
            {children}
            <BudgetTabBarSpacer />
          </div>
          <BudgetTabBar />
        </BudgetThemeScope>
      </BudgetProvider>
    </SessionProvider>
  );
}
