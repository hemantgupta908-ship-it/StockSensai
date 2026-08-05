"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { RiskTolerance, TradingStyle } from "@/lib/strategies/types";
import { TRADING_STYLES } from "@/lib/strategies/types";
import {
  FEED_VIEW_STORAGE_KEY,
  parseFeedView,
  parseRiskTolerance,
  RISK_COOKIE,
  RISK_STORAGE_KEY,
  type FeedView,
} from "@/lib/preferences";

const STYLE_STORAGE_KEY = "stockpilot.style";

interface PreferencesValue {
  riskTolerance: RiskTolerance;
  setRiskTolerance: (value: RiskTolerance) => void;
  /** Last trading style the user looked at, so the app reopens where they left. */
  tradingStyle: TradingStyle;
  setTradingStyle: (value: TradingStyle) => void;
  /** Cards or compact rows in the ideas feed. Display only — see `FeedView`. */
  feedView: FeedView;
  setFeedView: (value: FeedView) => void;
  /** False until localStorage has been read, so consumers can avoid flicker. */
  hydrated: boolean;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

function isTradingStyle(value: string | null): value is TradingStyle {
  return value !== null && (TRADING_STYLES as readonly string[]).includes(value);
}

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
  const [feedView, setFeedViewState] = useState<FeedView>("card");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const storedRisk = parseRiskTolerance(localStorage.getItem(RISK_STORAGE_KEY));
    const storedStyle = localStorage.getItem(STYLE_STORAGE_KEY);
    setRiskState(storedRisk);
    // Checked against the live list rather than a hardcoded set, so a style
    // saved by a newer build is still honoured and a removed one falls back.
    if (isTradingStyle(storedStyle)) setStyleState(storedStyle);
    setFeedViewState(parseFeedView(localStorage.getItem(FEED_VIEW_STORAGE_KEY)));
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

  const setFeedView = useCallback((value: FeedView) => {
    setFeedViewState(value);
    localStorage.setItem(FEED_VIEW_STORAGE_KEY, value);
  }, []);

  return (
    <PreferencesContext.Provider
      value={{
        riskTolerance,
        setRiskTolerance,
        tradingStyle,
        setTradingStyle,
        feedView,
        setFeedView,
        hydrated,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

const DEFAULT_PREFERENCES: PreferencesValue = {
  riskTolerance: "moderate",
  setRiskTolerance: () => {},
  tradingStyle: "swing",
  setTradingStyle: () => {},
  feedView: "card",
  setFeedView: () => {},
  hydrated: true,
};

export function usePreferences(): PreferencesValue {
  const context = useContext(PreferencesContext);
  return context ?? DEFAULT_PREFERENCES;
}
