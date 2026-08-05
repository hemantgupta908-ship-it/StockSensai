import {
  BookOpen,
  Home,
  Layers,
  Settings,
  Star,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  /** Longer label used where there is room; the sidebar keeps labels terse. */
  description: string;
  icon: LucideIcon;
}

/**
 * Destinations that get a bottom tab on mobile.
 *
 * Budget is deliberately absent: it is a separate environment reached through
 * the switcher in the header, not a peer of these screens.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/home", label: "Home", description: "Today's screened ideas", icon: Home },
  { href: "/watchlist", label: "Watchlist", description: "Stocks you're following", icon: Star },
  { href: "/strategies", label: "Strategies", description: "How each screen works", icon: Layers },
  { href: "/portfolio", label: "Journal", description: "Plan versus what you did", icon: Wallet },
  { href: "/settings", label: "Settings", description: "Risk, appearance, account", icon: Settings },
];

/**
 * The sidebar menu, grouped to mirror the budget environment's structure so the
 * two sides of the app read as one product.
 */
export const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    items: [
      { href: "/home", label: "Home", description: "Today's screened ideas", icon: Home },
      { href: "/watchlist", label: "Watchlist", description: "Stocks you're following", icon: Star },
    ],
  },
  {
    title: "Research",
    items: [
      { href: "/strategies", label: "Strategies", description: "How each screen works", icon: Layers },
    ],
  },
  {
    title: "Portfolio",
    items: [
      { href: "/portfolio", label: "Journal", description: "Plan versus what you did", icon: Wallet },
    ],
  },
  {
    title: "Organise",
    items: [
      { href: "/settings", label: "Settings", description: "Risk, appearance, account", icon: Settings },
      {
        href: "/disclaimer",
        label: "Disclaimer",
        description: "What this app is and isn't",
        icon: BookOpen,
      },
    ],
  },
];

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
