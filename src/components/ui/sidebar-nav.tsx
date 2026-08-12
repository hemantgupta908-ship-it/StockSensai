"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlass, SignOut } from "@phosphor-icons/react";

import { useSession } from "@/components/auth/session-provider";
import { StockSearchModal } from "@/components/stock/stock-search-modal";
import { BrandMark } from "@/components/auth/auth-artwork";
import { NavSidebar, SIDEBAR_WIDTH } from "./nav";
import { NAV_SECTIONS } from "./nav-items";

export { SIDEBAR_WIDTH };

/**
 * WealthSensei's sidebar.
 *
 * The shell, sections and active states come from the shared `NavSidebar`; what
 * is left here is the two pieces genuinely specific to this environment — the
 * quick-search box under the switcher, and the profile footer.
 */
export function SidebarNav() {
  const router = useRouter();
  const { user, signOut } = useSession();
  const [searchOpen, setSearchOpen] = useState(false);

  const header = (
    <>
      {/* Wordmark, where the environment switcher used to be. There is only one
          environment now, so there is nothing to switch between. */}
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent text-accent-fg">
          <BrandMark className="h-5 w-5" />
        </span>
        <span className="text-headline font-bold tracking-tight text-label">WealthSensei</span>
      </div>

      {/* Quick search — the most-used action, so it stays near the top. */}
      <div className="px-3 pb-3">
        <button
          onClick={() => setSearchOpen(true)}
          className="flex w-full items-center justify-between gap-2 rounded-[11px] border border-separator/40 bg-bg-elevated/80 px-3 py-2 text-footnote text-label-secondary shadow-subtle transition-all hover:border-accent/40 hover:text-label dark:border-white/[0.08]"
        >
          <span className="flex items-center gap-2">
            <MagnifyingGlass size={15} className="text-accent" />
            <span>Evaluate Stock...</span>
          </span>
          <kbd className="rounded bg-fill/[0.12] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-label-secondary opacity-70">
            ⌘K
          </kbd>
        </button>
      </div>
    </>
  );

  const footer = (
    <button
      onClick={async () => {
        await signOut();
        router.refresh();
      }}
      className="group flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-fill/10"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent shadow-sm ring-1 ring-accent/20 transition-colors group-hover:bg-accent group-hover:text-accent-fg">
        <span className="text-footnote font-bold">
          {user?.email?.charAt(0).toUpperCase() || "U"}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-footnote font-semibold text-label">
          {user?.email?.split("@")[0] || "User"}
        </p>
        <p className="truncate text-caption2 text-label-secondary/70">
          {user?.email || "Signed in"}
        </p>
      </div>
      <SignOut
        size={16}
        className="shrink-0 text-label-secondary/50 transition-colors group-hover:text-label"
      />
    </button>
  );

  return (
    <>
      <NavSidebar sections={NAV_SECTIONS} label="Primary" header={header} footer={footer} />
      <StockSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
