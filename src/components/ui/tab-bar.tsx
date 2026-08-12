"use client";

import { NavTabBar, NavTabBarSpacer } from "./nav";
import { NAV_ITEMS } from "./nav-items";

/** The stock environment's bottom tab bar. */
export function TabBar() {
  return <NavTabBar items={NAV_ITEMS} label="Primary" />;
}

export { NavTabBarSpacer as TabBarSpacer };
