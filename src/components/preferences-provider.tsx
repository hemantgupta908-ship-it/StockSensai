"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { RiskTolerance, TradingStyle } from "@/lib/strategies/types";
import { parseRiskTolerance, RISK_COOKIE, RISK_STORAGE_KEY } from "@/lib/preferences";

const STYLE_STORAGE_KEY = "stockpilot.style";

interface PreferencesValue {
  riskTolerance: RiskTolerance;
  setRiskTolerance: (value: RiskTolerance) => void;
  /** Last trading style the user looked at, so the app reopens where they left. */
  tradingStyle: TradingStyle;
  setTradingStyle: (value: TradingStyle) => void;
  /** False until localStorage has been read, so consumers can avoid flicker. */
  hydrated: boolean;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

function writeCookie(name: string, value: string) {
  // One year, site-wide, Lax — this is a UI preference, not a credential.
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
}

export function PreferencesProvider({
  initialRiskTolerance = "moderate",
  children,
}: {
  initialRiskTolerance?: RiskTolerance;
  children: React.ReactNode;
}) {
  const [riskTolerance, setRiskState] = useState<RiskTolerance>(initialRiskTolerance);
  const [tradingStyle, setStyleState] = useState<TradingStyle>("swing");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const storedRisk = parseRiskTolerance(localStorage.getItem(RISK_STORAGE_KEY));
    const storedStyle = localStorage.getItem(STYLE_STORAGE_KEY) as TradingStyle | null;
    setRiskState(storedRisk);
    if (storedStyle === "swing" || storedStyle === "short-term" || storedStyle === "long-term") {
      setStyleState(storedStyle);
    }
    // Keep the cookie in step in case storage was changed in another tab.
    writeCookie(RISK_COOKIE, storedRisk);
    setHydrated(true);
  }, []);

  const setRiskTolerance = useCallback((value: RiskTolerance) => {
    setRiskState(value);
    localStorage.setItem(RISK_STORAGE_KEY, value);
    writeCookie(RISK_COOKIE, value);
  }, []);

  const setTradingStyle = useCallback((value: TradingStyle) => {
    setStyleState(value);
    localStorage.setItem(STYLE_STORAGE_KEY, value);
  }, []);

  return (
    <PreferencesContext.Provider
      value={{ riskTolerance, setRiskTolerance, tradingStyle, setTradingStyle, hydrated }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesValue {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error("usePreferences must be used inside PreferencesProvider");
  return context;
}
