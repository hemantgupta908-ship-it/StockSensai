"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { MagnifyingGlass, SignOut } from "@phosphor-icons/react";

import { useSession } from "@/components/auth/session-provider";
import { useBudget } from "@/components/budget/budget-provider";
import { UserAvatar } from "@/components/budget/user-avatar";
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
  const { settings } = useBudget(useShallow((s) => ({ settings: s.settings })));
  const [searchOpen, setSearchOpen] = useState(false);

  const email = user?.email || "hemantgupta908@gmail.com";
  const username = email.split("@")[0] || "Profile";

  const header = (
    <div className="flex items-center gap-2.5 px-4 pb-3 pt-5">
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent text-accent-fg">
        <BrandMark className="h-5 w-5" />
      </span>
      <span className="text-headline font-bold tracking-tight text-label">WealthSensei</span>
    </div>
  );

  const footer = (
    <div className="flex items-center justify-between gap-2 rounded-2xl p-2 transition-colors hover:bg-fill/10">
      <Link
        href="/settings"
        className="flex flex-1 items-center gap-3 min-w-0"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-separator/50 bg-bg-secondary shadow-xs dark:border-white/10 overflow-hidden">
          <UserAvatar
            avatarVal={settings?.userAvatar || "initial"}
            email={email}
            className="h-full w-full text-base"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-footnote font-bold text-label">
            {username}
          </p>
          <p className="truncate text-caption2 text-label-secondary/60">
            {email}
          </p>
        </div>
      </Link>

      <button
        type="button"
        onClick={async (e) => {
          e.stopPropagation();
          await signOut();
          router.refresh();
        }}
        title="Sign out"
        aria-label="Sign out"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red text-white shadow-xs hover:bg-red/90 transition-colors focus:outline-none"
      >
        <SignOut size={18} weight="regular" />
      </button>
    </div>
  );

  return (
    <>
      <NavSidebar sections={NAV_SECTIONS} label="Primary" header={header} footer={footer} />
      <StockSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
