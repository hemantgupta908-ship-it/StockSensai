import type { User } from "@supabase/supabase-js";

import { SessionProvider } from "@/components/auth/session-provider";
import { WatchlistProvider } from "@/components/watchlist/watchlist-provider";
import { PortfolioProvider } from "@/components/portfolio/portfolio-provider";
import { BudgetProvider } from "@/components/budget/budget-provider";
import { DisclaimerFooter } from "@/components/disclaimer";
import { SidebarNav } from "@/components/ui/sidebar-nav";
import { TabBar, TabBarSpacer } from "@/components/ui/tab-bar";
import { PriceAlertsMonitor } from "@/hooks/use-price-alerts";

/**
 * The application shell — one for the whole product.
 *
 * Stocks and budget used to be two environments with their own layouts,
 * providers, navigation and an explicit switcher between them. They are now one
 * app: a single sidebar listing every destination, a single tab bar, and every
 * store mounted together.
 *
 * Mounting all four providers here is what makes cross-domain features possible
 * at all — net worth cannot count your holdings while the portfolio and budget
 * stores live in separate trees. The cost is that budget data hydrates on every
 * screen, which is why its context is memoised and the spreadsheet importer is
 * loaded on demand.
 *
 * The disclaimer footer stays on every screen. That matters more now, not less:
 * screened ideas sitting next to real balances read more like advice than they
 * did when the two were separate apps, and they are not advice.
 */
export function AppShell({
  user,
  children,
}: {
  user: User | null;
  children: React.ReactNode;
}) {
  return (
    <SessionProvider initialUser={user}>
      <WatchlistProvider>
        <PortfolioProvider>
          <BudgetProvider>
            <PriceAlertsMonitor />
            {/* Sidebar from `lg` up, bottom tab bar below it. */}
            <SidebarNav />
            <div className="min-h-dvh lg:pl-[248px]">
              {children}
              <DisclaimerFooter />
              <TabBarSpacer />
            </div>
            <TabBar />
          </BudgetProvider>
        </PortfolioProvider>
      </WatchlistProvider>
    </SessionProvider>
  );
}
