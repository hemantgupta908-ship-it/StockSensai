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
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    var pref = stored || 'system';
    var dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
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
  // Start at "system" on both server and client so hydration matches; the
  // inline script has already applied the real class to <html>.
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference | null;
    const initial = stored ?? "system";
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
