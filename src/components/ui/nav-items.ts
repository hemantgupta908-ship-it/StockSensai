import { BookOpen, Home, Settings, Star, Wallet, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  /** Longer label used in the desktop sidebar, where there is room. */
  description: string;
  icon: LucideIcon;
}

/** Shared by the mobile tab bar and the desktop sidebar. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/home", label: "Home", description: "Today's screened ideas", icon: Home },
  { href: "/strategies", label: "Strategies", description: "How all 15 screens work", icon: BookOpen },
  { href: "/watchlist", label: "Watchlist", description: "Stocks you're following", icon: Star },
  { href: "/portfolio", label: "Journal", description: "Plan versus what you did", icon: Wallet },
  { href: "/settings", label: "Settings", description: "Risk, appearance, account", icon: Settings },
];

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
