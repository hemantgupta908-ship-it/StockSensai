"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import type { Icon } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";

/**
 * One navigation chrome, driven by a per-environment manifest.
 *
 * The stock app and the budget environment shipped near-identical tab bars and
 * sidebars — same markup, same spacing, same breakpoints — differing only in
 * their destinations, their accent, and two custom tab glyphs. That is a
 * manifest, not a second component.
 */

export interface NavItem {
  href: string;
  label: string;
  /** Longer label used where there is room; the sidebar keeps labels terse. */
  description: string;
  icon: Icon;
  /**
   * Match this href exactly rather than as a prefix. An environment root like
   * `/budget` is a prefix of every one of its own children, so without this it
   * would report itself active on every screen.
   */
  exact?: boolean;
  /** Replaces the icon entirely — used for the avatar and transfer glyphs. */
  renderIcon?: (state: { active: boolean }) => React.ReactNode;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Kept for the handful of callers that check a bare href. */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * iOS bottom tab bar. Translucent so content shows through as it scrolls
 * underneath, with the safe-area inset respected on notched devices.
 *
 * Hidden from `lg` up, where the sidebar takes over.
 */
export function NavTabBar({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 lg:hidden",
        "border-t border-separator/40 bg-bg-secondary/90 shadow-lg backdrop-blur-xl",
        "dark:border-white/10 dark:bg-black/90",
        "safe-bottom",
      )}
      aria-label={label}
    >
      <ul className="mx-auto flex max-w-2xl items-stretch justify-around px-1 pb-1 pt-1.5">
        {items.map((item) => {
          const active = isNavItemActive(pathname, item);
          const ItemIcon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="group relative flex flex-col items-center gap-[3px] py-1 transition-colors duration-150"
              >
                {/* iOS 18 pill indicator */}
                <span
                  className={cn(
                    "absolute top-0 h-[3px] w-5 rounded-full transition-all duration-300",
                    active
                      ? "bg-accent opacity-100 scale-x-100"
                      : "bg-transparent opacity-0 scale-x-0",
                  )}
                />

                <motion.span
                  whileTap={{ scale: 0.86 }}
                  transition={{ type: "spring", stiffness: 500, damping: 25 }}
                  className="relative mt-0.5 flex h-6 w-6 items-center justify-center"
                >
                  {item.renderIcon ? (
                    item.renderIcon({ active })
                  ) : (
                    <ItemIcon
                      size={22}
                      weight={active ? "fill" : "regular"}
                      className={cn(
                        "transition-colors duration-200",
                        active
                          ? "text-accent"
                          : "text-label-secondary/65 group-hover:text-label dark:text-white/55",
                      )}
                    />
                  )}
                </motion.span>
                <span
                  className={cn(
                    "text-[10px] leading-none tracking-tight transition-colors duration-200",
                    active
                      ? "font-bold text-accent"
                      : "font-medium text-label-secondary/65 group-hover:text-label dark:text-white/55",
                  )}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Spacer so page content is never hidden behind the fixed tab bar. */
export function NavTabBarSpacer() {
  return <div className="h-[64px] safe-bottom lg:hidden" aria-hidden />;
}

/** Width of the fixed sidebar. Layouts offset by this at `lg` and above. */
export const SIDEBAR_WIDTH = 248;

/**
 * Desktop sidebar: switcher, optional lead-in, grouped sections, footer.
 *
 * `header` and `footer` are slots because that is where the two environments
 * genuinely differ — one puts a search box under the switcher, the other an
 * avatar in the footer — while everything between is identical.
 */
export function NavSidebar({
  sections,
  label,
  header,
  footer,
}: {
  sections: NavSection[];
  label: string;
  header?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-separator/40 bg-bg-secondary/60 backdrop-blur-ios dark:border-white/[0.06] lg:flex"
      aria-label={label}
    >
      {header}

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {sections.map((section) => (
          <div key={section.title} className="mb-4">
            <p className="px-3 pb-1 text-caption2 font-semibold uppercase tracking-wide text-label-secondary/50">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isNavItemActive(pathname, item);
                const ItemIcon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex select-none items-center gap-3 rounded-ios px-3 py-2 transition-colors",
                        active
                          ? "bg-accent/15 text-accent dark:bg-accent/20"
                          : "text-label hover:bg-fill/10",
                      )}
                    >
                      <ItemIcon size={19} weight="regular" className="shrink-0" />
                      <span className={cn("text-subhead", active && "font-semibold")}>
                        {item.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {footer ? (
        <div className="mt-auto border-t border-separator/40 p-3 dark:border-white/[0.06]">
          {footer}
        </div>
      ) : null}
    </aside>
  );
}
