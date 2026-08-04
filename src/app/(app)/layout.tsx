import { SessionProvider } from "@/components/auth/session-provider";
import { WatchlistProvider } from "@/components/watchlist/watchlist-provider";
import { PortfolioProvider } from "@/components/portfolio/portfolio-provider";
import { DisclaimerFooter } from "@/components/disclaimer";
import { TabBar, TabBarSpacer } from "@/components/ui/tab-bar";
import { SidebarNav } from "@/components/ui/sidebar-nav";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * App shell: everything behind the tab bar.
 *
 * The user is resolved on the server so signed-in screens render correctly on
 * first paint instead of flashing a signed-out state.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <SessionProvider initialUser={user}>
      <WatchlistProvider>
        <PortfolioProvider>
          {/* Sidebar from `lg` up, bottom tab bar below it. */}
          <SidebarNav />
          <div className="min-h-dvh lg:pl-[248px]">
            {children}
            <DisclaimerFooter />
            <TabBarSpacer />
          </div>
          <TabBar />
        </PortfolioProvider>
      </WatchlistProvider>
    </SessionProvider>
  );
}
