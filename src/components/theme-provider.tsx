"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Appearance for the whole app — both environments.
 *
 * Single owner of theme and adaptive paired accent. The budget settings
 * and stock settings screens drive it through `useTheme()`.
 */

export type ThemePreference =
  | "light"
  | "dark"
  | "system"
  | "oled"
  | "sepia"
  | "midnight"
  | "forest"
  | "mocha"
  | "velvet"
  | "cream"
  | "nordic"
  | "blush"
  | "sage"
  | "dune";

/** Themes that render dark chrome. `system` resolves at runtime. */
const DARK_THEMES: ThemePreference[] = [
  "dark",
  "oled",
  "midnight",
  "forest",
  "mocha",
  "velvet",
];

export const THEME_STORAGE_KEY = "stockpilot.theme";
export const ACCENT_STORAGE_KEY = "stockpilot.accent";

export interface AccentPair {
  id: string;
  name: string;
  light: string;
  dark: string;
  legacyHexes?: string[];
}

/**
 * Curated FinTech & iOS-inspired Adaptive Paired Accents.
 *
 * Light mode tones are rich, deep, and clear WCAG AA contrast (>= 4.5:1)
 * against white/light gray backgrounds.
 * Dark mode tones are luminous and vibrant against deep black/dark gray backgrounds.
 */
export const ACCENT_PALETTES: AccentPair[] = [
  {
    id: "blue",
    name: "iOS Blue",
    light: "#0071E3",
    dark: "#0A84FF",
    legacyHexes: ["#0071E3", "#007AFF", "0 113 227", "0 122 255"],
  },
  {
    id: "teal",
    name: "Teal Surge",
    light: "#008780",
    dark: "#30D1C7",
    legacyHexes: ["#00A896", "#30B0C7", "#80CBC4"],
  },
  {
    id: "emerald",
    name: "Emerald Green",
    light: "#1B8755",
    dark: "#30D158",
    legacyHexes: ["#34C759", "#8BC34A"],
  },
  {
    id: "violet",
    name: "Electric Violet",
    light: "#6D28D9",
    dark: "#BF5AF2",
    legacyHexes: ["#5856D6", "#AF52DE"],
  },
  {
    id: "indigo",
    name: "Deep Indigo",
    light: "#4338CA",
    dark: "#5E5CE6",
    legacyHexes: ["#3F51B5"],
  },
  {
    id: "rose",
    name: "Rose Magenta",
    light: "#E11D48",
    dark: "#FF375F",
    legacyHexes: ["#FF2D55"],
  },
  {
    id: "amber",
    name: "Sunset Amber",
    light: "#D95D00",
    dark: "#FF9F0A",
    legacyHexes: ["#FF9500", "#FF6B6B", "#FFAB91"],
  },
  {
    id: "gold",
    name: "Solar Gold",
    light: "#B8860B",
    dark: "#FFD60A",
    legacyHexes: ["#FFCC00"],
  },
  {
    id: "crimson",
    name: "Crimson Red",
    light: "#DC2626",
    dark: "#FF453A",
    legacyHexes: ["#FF3B30"],
  },
  {
    id: "cyan",
    name: "Neon Cyan",
    light: "#0284C7",
    dark: "#64D2FF",
    legacyHexes: [],
  },
  {
    id: "mint",
    name: "Soft Mint",
    light: "#0D9488",
    dark: "#40C8B5",
    legacyHexes: [],
  },
  {
    id: "slate",
    name: "Titanium Slate",
    light: "#334155",
    dark: "#94A3B8",
    legacyHexes: ["#607D8B", "#424242", "#8D6E63"],
  },
];

export const DEFAULT_ACCENT = "blue";
export const DEFAULT_ACCENT_LIGHT_HEX = "#0071E3";
export const DEFAULT_ACCENT_DARK_HEX = "#0A84FF";

export function getAccentPair(accentValue: string): AccentPair {
  const normalized = (accentValue || "").trim().toLowerCase();
  const found = ACCENT_PALETTES.find(
    (p) =>
      p.id.toLowerCase() === normalized ||
      p.light.toLowerCase() === normalized ||
      p.dark.toLowerCase() === normalized ||
      p.legacyHexes?.some((h) => h.toLowerCase() === normalized),
  );
  return found ?? ACCENT_PALETTES[0];
}

export function resolveAccentHex(accentValue: string, isDark: boolean): string {
  if (!accentValue) return isDark ? DEFAULT_ACCENT_DARK_HEX : DEFAULT_ACCENT_LIGHT_HEX;
  const normalized = accentValue.trim();
  const found = ACCENT_PALETTES.find(
    (p) =>
      p.id.toLowerCase() === normalized.toLowerCase() ||
      p.light.toLowerCase() === normalized.toLowerCase() ||
      p.dark.toLowerCase() === normalized.toLowerCase() ||
      p.legacyHexes?.some((h) => h.toLowerCase() === normalized.toLowerCase()),
  );
  if (found) {
    return isDark ? found.dark : found.light;
  }
  if (/^#?[0-9a-fA-F]{3,6}$/.test(normalized)) {
    return normalized.startsWith("#") ? normalized : `#${normalized}`;
  }
  return isDark ? DEFAULT_ACCENT_DARK_HEX : DEFAULT_ACCENT_LIGHT_HEX;
}

function hexToRgbTriplet(hex: string): string {
  const value = hex.trim().replace(/^#/, "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return "0 113 227";
  const int = parseInt(full, 16);
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`;
}

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

function applyAccent(accentValue: string, isDark: boolean) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const hex = resolveAccentHex(accentValue, isDark);
  const rgb = hexToRgbTriplet(hex);
  root.style.setProperty("--accent", hex);
  root.style.setProperty("--accent-rgb", rgb);
  root.style.setProperty("--accent-fg", readableForeground(rgb));
}

const LEGACY_SETTINGS_KEY = "cashew.settings";

interface ThemeContextValue {
  /** What the user chose (e.g. 'system', 'light', 'dark', 'oled', 'sepia', 'midnight', 'forest', 'mocha', 'velvet', 'cream', 'nordic', 'blush', 'sage', 'dune'). */
  preference: ThemePreference;
  /** What is actually rendered right now ('light' | 'dark'). */
  resolved: "light" | "dark";
  setPreference: (preference: ThemePreference) => void;
  /** App-wide accent key or hex value. */
  accent: string;
  /** The rendered hex code matching current theme mode. */
  resolvedAccent: string;
  /** The active AccentPair definition. */
  activePair: AccentPair;
  setAccent: (accent: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Inlined into <head> so the correct theme and adaptive accent are on <html> before first paint.
 */
export const themeInitScript = `
(function() {
  try {
    var THEME_KEY = '${THEME_STORAGE_KEY}';
    var ACCENT_KEY = '${ACCENT_STORAGE_KEY}';
    var legacy = null;
    try { legacy = JSON.parse(localStorage.getItem('${LEGACY_SETTINGS_KEY}') || 'null'); } catch (e) {}

    var pref = localStorage.getItem(THEME_KEY) || (legacy && legacy.theme) || 'system';
    var rawAccent = localStorage.getItem(ACCENT_KEY) || (legacy && legacy.accentColour) || 'blue';

    var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var darkList = ['dark', 'oled', 'midnight', 'forest', 'mocha', 'velvet'];
    var isDark = darkList.indexOf(pref) !== -1 || (pref === 'system' && systemDark);

    var root = document.documentElement;
    root.classList.toggle('dark', isDark);
    
    var themeClasses = ['theme-oled', 'theme-sepia', 'theme-midnight', 'theme-forest', 'theme-mocha', 'theme-velvet', 'theme-cream', 'theme-nordic', 'theme-blush', 'theme-sage', 'theme-dune'];
    themeClasses.forEach(function(cls) { root.classList.remove(cls); });
    if (pref !== 'system' && pref !== 'light' && pref !== 'dark') {
      root.classList.add('theme-' + pref);
    }
    root.style.colorScheme = isDark ? 'dark' : 'light';

    var palettes = {
      blue: { light: '#0071E3', dark: '#0A84FF' },
      teal: { light: '#008780', dark: '#30D1C7' },
      green: { light: '#1B8755', dark: '#30D158' },
      violet: { light: '#6D28D9', dark: '#BF5AF2' },
      indigo: { light: '#4338CA', dark: '#5E5CE6' },
      rose: { light: '#E11D48', dark: '#FF375F' },
      amber: { light: '#D95D00', dark: '#FF9F0A' },
      gold: { light: '#B8860B', dark: '#FFD60A' },
      crimson: { light: '#DC2626', dark: '#FF453A' },
      cyan: { light: '#0284C7', dark: '#64D2FF' },
      mint: { light: '#0D9488', dark: '#40C8B5' },
      slate: { light: '#334155', dark: '#94A3B8' }
    };
    var legacyMap = {
      '#0071e3': 'blue', '#007aff': 'blue', '0 113 227': 'blue',
      '#34c759': 'green', '#8bc34a': 'green',
      '#00a896': 'teal', '#30b0c7': 'teal', '#80cbc4': 'teal',
      '#3f51b5': 'indigo', '#5856d6': 'violet', '#af52de': 'violet',
      '#ff2d55': 'rose', '#ff3b30': 'crimson', '#ff6b6b': 'amber',
      '#ff9500': 'amber', '#ffcc00': 'gold', '#607d8b': 'slate',
      '#424242': 'slate', '#ffab91': 'amber', '#8d6e63': 'slate'
    };

    var key = String(rawAccent).trim().toLowerCase();
    var pairKey = palettes[key] ? key : (legacyMap[key] || (legacyMap['#' + key.replace(/^#/, '')] || null));
    var hex = pairKey ? (isDark ? palettes[pairKey].dark : palettes[pairKey].light) : (key.startsWith('#') ? key : ('#' + key));
    if (!/^[0-9a-fA-F]{6}$/.test(hex.replace(/^#/, ''))) {
      hex = isDark ? '#0A84FF' : '#0071E3';
    }

    var cleanHex = hex.replace(/^#/, '');
    var n = parseInt(cleanHex, 16);
    var triplet = ((n >> 16) & 255) + ' ' + ((n >> 8) & 255) + ' ' + (n & 255);

    var p = triplet.split(' ').map(Number).map(function (c) {
      var s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    var lum = 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
    var fg = 1.05 / (lum + 0.05) >= (lum + 0.05) / 0.05 ? '255 255 255' : '0 0 0';

    root.style.setProperty('--accent', hex);
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
    value === "sepia" ||
    value === "midnight" ||
    value === "forest" ||
    value === "mocha" ||
    value === "velvet" ||
    value === "cream" ||
    value === "nordic" ||
    value === "blush" ||
    value === "sage" ||
    value === "dune"
  );
}

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

function applyTheme(preference: ThemePreference) {
  const root = document.documentElement;
  const isDark = resolve(preference) === "dark";
  root.classList.toggle("dark", isDark);
  root.classList.toggle("theme-oled", preference === "oled");
  root.classList.toggle("theme-sepia", preference === "sepia");
  root.classList.toggle("theme-midnight", preference === "midnight");
  root.classList.toggle("theme-forest", preference === "forest");
  root.classList.toggle("theme-mocha", preference === "mocha");
  root.classList.toggle("theme-velvet", preference === "velvet");
  root.classList.toggle("theme-cream", preference === "cream");
  root.classList.toggle("theme-nordic", preference === "nordic");
  root.classList.toggle("theme-blush", preference === "blush");
  root.classList.toggle("theme-sage", preference === "sage");
  root.classList.toggle("theme-dune", preference === "dune");
  root.style.colorScheme = isDark ? "dark" : "light";
  return isDark;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");
  const [accent, setAccentState] = useState<string>(DEFAULT_ACCENT);

  useEffect(() => {
    const initialTheme = readStoredTheme();
    const initialAccent = readStoredAccent();
    const isDark = resolve(initialTheme) === "dark";
    setPreferenceState(initialTheme);
    setResolved(isDark ? "dark" : "light");
    setAccentState(initialAccent);
    applyTheme(initialTheme);
    applyAccent(initialAccent, isDark);
  }, []);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next);
      localStorage.setItem(THEME_STORAGE_KEY, next);
      const isDark = applyTheme(next);
      setResolved(isDark ? "dark" : "light");
      applyAccent(accent, isDark);
    },
    [accent],
  );

  const setAccent = useCallback(
    (next: string) => {
      setAccentState(next);
      localStorage.setItem(ACCENT_STORAGE_KEY, next);
      applyAccent(next, resolved === "dark");
    },
    [resolved],
  );

  // Update accent if theme resolved changes (e.g. OS theme flips while on "system")
  useEffect(() => {
    applyAccent(accent, resolved === "dark");
  }, [resolved, accent]);

  // Follow the OS while the user is on "system".
  useEffect(() => {
    if (preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const isDark = applyTheme("system");
      setResolved(isDark ? "dark" : "light");
      applyAccent(accent, isDark);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference, accent]);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === THEME_STORAGE_KEY && isThemePreference(event.newValue)) {
        setPreferenceState(event.newValue);
        const isDark = applyTheme(event.newValue);
        setResolved(isDark ? "dark" : "light");
        applyAccent(accent, isDark);
      }
      if (event.key === ACCENT_STORAGE_KEY && event.newValue) {
        setAccentState(event.newValue);
        applyAccent(event.newValue, resolved === "dark");
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [accent, resolved]);

  const activePair = useMemo(() => getAccentPair(accent), [accent]);
  const resolvedAccent = useMemo(
    () => resolveAccentHex(accent, resolved === "dark"),
    [accent, resolved],
  );

  return (
    <ThemeContext.Provider
      value={{
        preference,
        resolved,
        setPreference,
        accent,
        resolvedAccent,
        activePair,
        setAccent,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
