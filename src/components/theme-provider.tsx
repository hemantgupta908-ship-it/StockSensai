"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/**
 * Appearance for the whole app — both environments.
 *
 * There used to be two writers of these classes: this provider and the budget
 * environment's own `BudgetThemeScope`, both targeting `<html>`. They clobbered
 * each other, so crossing between environments left whichever ran last in
 * charge. This is now the single owner of theme *and* accent; the budget
 * settings screen drives it through `useTheme()` like any other caller.
 *
 * The accent lives here rather than in the budget store because it is app-wide,
 * and the budget store is not mounted in the stock environment.
 */

export type ThemePreference = "light" | "dark" | "system" | "oled" | "sepia";

/** Themes that render dark chrome. `system` resolves at runtime. */
const DARK_THEMES: ThemePreference[] = ["dark", "oled"];

export const THEME_STORAGE_KEY = "stockpilot.theme";
export const ACCENT_STORAGE_KEY = "stockpilot.accent";

/**
 * Default accent.
 *
 * Deliberately `#0071E3` rather than the iOS `#007AFF` this started as: white
 * on #007AFF is 4.02:1, and button text here is 17px semibold, which is not
 * "large" under WCAG — so 4.5:1 is the bar and it misses. The alternative was
 * letting `readableForeground` flip the default primary button to a black
 * label, which looks wrong on a blue button.
 *
 * A shade darker clears AA with white (4.70:1) and still reads as the same
 * blue. Every other swatch keeps its automatic foreground.
 */
export const DEFAULT_ACCENT = "#0071E3";

/** `DEFAULT_ACCENT` as a space-separated RGB triplet. */
const DEFAULT_ACCENT_RGB = "0 113 227";

/**
 * The accent is published twice, and both are load-bearing.
 *
 * `--accent` holds the hex, for inline SVG `stroke`/`fill` and anywhere CSS
 * consumes the colour directly. `--accent-rgb` holds a space-separated triplet,
 * which is what Tailwind needs to satisfy `rgb(... / <alpha-value>)`.
 *
 * Without the triplet, every opacity modifier on the accent silently produces
 * *no rule at all* — `bg-accent/40`, `ring-accent/20` and friends simply do not
 * exist in the output. That was the state of 27 utilities across the budget UI,
 * including the FAB's glow and every input focus ring.
 */
function hexToRgbTriplet(hex: string): string {
  const value = hex.trim().replace(/^#/, "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return DEFAULT_ACCENT_RGB;
  const int = parseInt(full, 16);
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`;
}

/**
 * A foreground that stays readable on top of the accent.
 *
 * Hardcoding `text-white` stopped being safe the moment the accent became
 * user-configurable: of the eighteen swatches offered, fourteen fail WCAG AA
 * against white, and Golden Yellow (#FFCC00) lands at 1.51:1 — a button whose
 * label you cannot read. Picking whichever of white/black scores higher clears
 * 4.5:1 for every swatch in the palette.
 *
 * Pale swatches therefore get a black label — Golden Yellow reads 13.89:1 that
 * way. `DEFAULT_ACCENT` is chosen so the out-of-the-box case still gets white.
 */
function readableForeground(accentRgb: string): string {
  const [r, g, b] = accentRgb.split(" ").map(Number);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const againstWhite = 1.05 / (luminance + 0.05);
  const againstBlack = (luminance + 0.05) / 0.05;
  return againstWhite >= againstBlack ? "255 255 255" : "0 0 0";
}

function applyAccent(accent: string) {
  const root = document.documentElement;
  const rgb = hexToRgbTriplet(accent);
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-rgb", rgb);
  root.style.setProperty("--accent-fg", readableForeground(rgb));
}

/** Where theme and accent used to live, read once so nobody loses their setting. */
const LEGACY_SETTINGS_KEY = "cashew.settings";

interface ThemeContextValue {
  /** What the user chose. */
  preference: ThemePreference;
  /** What is actually rendered right now. */
  resolved: "light" | "dark";
  setPreference: (preference: ThemePreference) => void;
  /** App-wide accent colour, as a CSS colour string. */
  accent: string;
  setAccent: (accent: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Inlined into <head> so the correct theme is on <html> before first paint.
 * Without this the app flashes light before hydration swaps it to dark, which is
 * the single most obvious way a web app gives away that it isn't native.
 *
 * This must stay in lockstep with `readStoredTheme` / `applyTheme` below — if
 * the two disagree the page will paint one theme and then visibly correct
 * itself, which is worse than no script at all.
 */
export const themeInitScript = `
(function() {
  try {
    var THEME_KEY = '${THEME_STORAGE_KEY}';
    var ACCENT_KEY = '${ACCENT_STORAGE_KEY}';
    var legacy = null;
    try { legacy = JSON.parse(localStorage.getItem('${LEGACY_SETTINGS_KEY}') || 'null'); } catch (e) {}

    var pref = localStorage.getItem(THEME_KEY) || (legacy && legacy.theme) || 'system';
    var accent = localStorage.getItem(ACCENT_KEY) || (legacy && legacy.accentColour) || '${DEFAULT_ACCENT}';

    var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = pref === 'dark' || pref === 'oled' || (pref === 'system' && systemDark);

    var root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.classList.toggle('theme-oled', pref === 'oled');
    root.classList.toggle('theme-sepia', pref === 'sepia');
    root.style.colorScheme = dark ? 'dark' : 'light';

    // Mirrors hexToRgbTriplet below — see the note there on why both forms ship.
    var hex = String(accent).trim().replace(/^#/, '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    var triplet = '${DEFAULT_ACCENT_RGB}';
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      var n = parseInt(hex, 16);
      triplet = ((n >> 16) & 255) + ' ' + ((n >> 8) & 255) + ' ' + (n & 255);
    }
    // Mirrors readableForeground below.
    var p = triplet.split(' ').map(Number).map(function (c) {
      var s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    var lum = 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
    var fg = 1.05 / (lum + 0.05) >= (lum + 0.05) / 0.05 ? '255 255 255' : '0 0 0';

    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-rgb', triplet);
    root.style.setProperty('--accent-fg', fg);
  } catch (e) {}
})();
`;

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(preference: ThemePreference): "light" | "dark" {
  if (preference === "system") return systemPrefersDark() ? "dark" : "light";
  return DARK_THEMES.includes(preference) ? "dark" : "light";
}

function isThemePreference(value: unknown): value is ThemePreference {
  return (
    value === "light" ||
    value === "dark" ||
    value === "system" ||
    value === "oled" ||
    value === "sepia"
  );
}

/** Legacy budget settings blob, read only to migrate off it. */
function readLegacy(): { theme?: unknown; accentColour?: unknown } | null {
  try {
    return JSON.parse(localStorage.getItem(LEGACY_SETTINGS_KEY) ?? "null");
  } catch {
    return null;
  }
}

function readStoredTheme(): ThemePreference {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (isThemePreference(stored)) return stored;
  const legacy = readLegacy()?.theme;
  return isThemePreference(legacy) ? legacy : "system";
}

function readStoredAccent(): string {
  const stored = localStorage.getItem(ACCENT_STORAGE_KEY);
  if (stored) return stored;
  const legacy = readLegacy()?.accentColour;
  return typeof legacy === "string" && legacy ? legacy : DEFAULT_ACCENT;
}

/** The one place `<html>` gets its appearance classes. */
function applyTheme(preference: ThemePreference) {
  const root = document.documentElement;
  const isDark = resolve(preference) === "dark";
  root.classList.toggle("dark", isDark);
  root.classList.toggle("theme-oled", preference === "oled");
  root.classList.toggle("theme-sepia", preference === "sepia");
  root.style.colorScheme = isDark ? "dark" : "light";
  return isDark;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");
  const [accent, setAccentState] = useState<string>(DEFAULT_ACCENT);

  // Hydrate from storage. The init script has already painted the right theme;
  // this only brings React's state into agreement with it.
  useEffect(() => {
    const initial = readStoredTheme();
    const initialAccent = readStoredAccent();
    setPreferenceState(initial);
    setResolved(resolve(initial));
    setAccentState(initialAccent);
    applyAccent(initialAccent);
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
    setResolved(applyTheme(next) ? "dark" : "light");
  }, []);

  const setAccent = useCallback((next: string) => {
    setAccentState(next);
    localStorage.setItem(ACCENT_STORAGE_KEY, next);
    applyAccent(next);
  }, []);

  // Follow the OS while the user is on "system".
  useEffect(() => {
    if (preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(applyTheme("system") ? "dark" : "light");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  // Keep tabs in step — appearance is the setting users are most likely to
  // change with the app open twice.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === THEME_STORAGE_KEY && isThemePreference(event.newValue)) {
        setPreferenceState(event.newValue);
        setResolved(applyTheme(event.newValue) ? "dark" : "light");
      }
      if (event.key === ACCENT_STORAGE_KEY && event.newValue) {
        setAccentState(event.newValue);
        applyAccent(event.newValue);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference, accent, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
