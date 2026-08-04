import type { RiskTolerance } from "@/lib/strategies/types";

/**
 * Risk tolerance is read on the server (to tune strategy thresholds during
 * SSR) and written on the client. It's mirrored into a cookie precisely so the
 * server can see it — localStorage alone would force every screen that depends
 * on it to become client-rendered.
 */
export const RISK_COOKIE = "stockpilot.risk";
export const RISK_STORAGE_KEY = "stockpilot.risk";

export const RISK_TOLERANCES: RiskTolerance[] = ["conservative", "moderate", "aggressive"];

export const RISK_LABELS: Record<RiskTolerance, string> = {
  conservative: "Conservative",
  moderate: "Moderate",
  aggressive: "Aggressive",
};

export const RISK_DESCRIPTIONS: Record<RiskTolerance, string> = {
  conservative:
    "Fewer, higher-conviction ideas. Demands more confirmation, wider reward-to-risk and stronger balance sheets.",
  moderate: "A balanced screen. The default thresholds most of the strategy literature assumes.",
  aggressive:
    "More ideas, taken earlier. Looser confirmation and wider stops — expect more false starts.",
};

export function parseRiskTolerance(value: string | undefined | null): RiskTolerance {
  return value === "conservative" || value === "aggressive" || value === "moderate"
    ? value
    : "moderate";
}
