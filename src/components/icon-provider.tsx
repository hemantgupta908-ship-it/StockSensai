"use client";

/**
 * Makes Phosphor's duotone weight the app-wide default.
 *
 * Set here rather than as a `weight` prop on every icon: there are hundreds of
 * call sites, and a default that lives in one place cannot drift. Individual
 * icons can still override it — a bold caret in a pressed state, say — by
 * passing `weight` themselves.
 *
 * `size` and `color` stay unset so the existing `size={N}` props and
 * `currentColor` inheritance keep working exactly as they did under lucide.
 */

import { IconContext } from "@phosphor-icons/react";

export function IconProvider({ children }: { children: React.ReactNode }) {
  return <IconContext.Provider value={{ weight: "duotone" }}>{children}</IconContext.Provider>;
}
