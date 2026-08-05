"use client";

/**
 * Applies the budget environment's own theme and accent colour.
 *
 * The user asked for the two environments to keep separate settings, so the
 * budget side owns its light/dark preference independently of the stock app's.
 * The accent is published as a CSS variable rather than a Tailwind class so
 * charts and progress bars can read it without prop drilling.
 */

import { useEffect } from "react";

import { useBudget } from "./budget-provider";

export function BudgetThemeScope({ children }: { children: React.ReactNode }) {
  const { settings } = useBudget();

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      const dark = settings.theme === "dark" || (settings.theme === "system" && media.matches);
      root.classList.toggle("dark", dark);
    };

    apply();
    // Only track the OS when the user has actually chosen "system".
    if (settings.theme === "system") {
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }
  }, [settings.theme]);

  useEffect(() => {
    document.documentElement.style.setProperty("--budget-accent", settings.accentColour);
  }, [settings.accentColour]);

  return (
    <div
      className="budget-env"
      data-hide-amounts={settings.hideAmounts ? "true" : undefined}
      style={{ ["--budget-accent" as string]: settings.accentColour }}
    >
      {children}
    </div>
  );
}
