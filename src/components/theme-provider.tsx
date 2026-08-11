"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";

interface ThemeContextValue {
  /** What the user chose. */
  preference: ThemePreference;
  /** What is actually rendered right now. */
  resolved: "light" | "dark";
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const THEME_STORAGE_KEY = "stockpilot.theme";

/**
 * Inlined into <head> so the correct theme class is on <html> before first
 * paint. Without this the app flashes light before hydration swaps it to dark,
 * which is the single most obvious way a web app gives away that it isn't native.
 */
export const themeInitScript = `
(function() {
  try {
    var cashewRaw = localStorage.getItem('cashew.settings');
    var stockTheme = localStorage.getItem('${THEME_STORAGE_KEY}');
    var pref = 'system';
    if (cashewRaw) {
      try {
        var parsed = JSON.parse(cashewRaw);
        if (parsed.theme) pref = parsed.theme;
      } catch (e) {}
    }
    if (pref === 'system' && stockTheme) {
      pref = stockTheme;
    }
    var dark = pref === 'dark' || pref === 'oled' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    if (pref === 'oled') document.documentElement.classList.add('theme-oled');
    if (pref === 'sepia') document.documentElement.classList.add('theme-sepia');
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {}
})();
`;

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(preference: ThemePreference): "light" | "dark" {
  if (preference === "system") return systemPrefersDark() ? "dark" : "light";
  return preference;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    let initial: ThemePreference = "system";
    try {
      const cashewRaw = localStorage.getItem("cashew.settings");
      if (cashewRaw) {
        const parsed = JSON.parse(cashewRaw);
        if (parsed.theme) initial = parsed.theme;
      }
    } catch {}
    if (initial === "system") {
      const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference | null;
      if (stored) initial = stored;
    }
    setPreferenceState(initial);
    setResolved(resolve(initial));
  }, []);

  const apply = useCallback((next: ThemePreference) => {
    const isDark = resolve(next) === "dark";
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    setResolved(isDark ? "dark" : "light");
  }, []);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next);
      localStorage.setItem(THEME_STORAGE_KEY, next);
      apply(next);
    },
    [apply],
  );

  // Follow the OS while the user is on "system".
  useEffect(() => {
    if (preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference, apply]);

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
