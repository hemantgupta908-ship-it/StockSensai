import { SessionProvider } from "@/components/auth/session-provider";
import { WatchlistProvider } from "@/components/watchlist/watchlist-provider";
import { PortfolioProvider } from "@/components/portfolio/portfolio-provider";
import { DisclaimerFooter } from "@/components/disclaimer";
import { TabBar, TabBarSpacer } from "@/components/ui/tab-bar";
import { SidebarNav } from "@/components/ui/sidebar-nav";
import { requireUser } from "@/lib/supabase/server";

/**
 * App shell: everything behind the tab bar.
 *
 * The user is resolved on the server so signed-in screens render correctly on
 * first paint instead of flashing a signed-out state — and, since every screen
 * in here needs an account, so that there is no signed-out state to flash.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

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
