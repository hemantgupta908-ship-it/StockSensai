import { INTRADAY_STRATEGIES } from "./intraday";
import { LONG_TERM_STRATEGIES } from "./long-term";
import { POSITIONAL_STRATEGIES } from "./positional";
import { SHORT_TERM_STRATEGIES } from "./short-term";
import { SWING_STRATEGIES } from "./swing";
import type { Strategy, StrategyId, TradingStyle } from "./types";

export * from "./types";

/**
 * All 25 strategies: 5 for each of the five trading styles.
 * Ordered by holding period, shortest first — the same order the UI uses.
 */
export const ALL_STRATEGIES: Strategy[] = [
  ...INTRADAY_STRATEGIES,
  ...SHORT_TERM_STRATEGIES,
  ...SWING_STRATEGIES,
  ...POSITIONAL_STRATEGIES,
  ...LONG_TERM_STRATEGIES,
];

const BY_ID = new Map<StrategyId, Strategy>(ALL_STRATEGIES.map((s) => [s.id, s]));

export function getStrategy(id: string): Strategy | undefined {
  return BY_ID.get(id as StrategyId);
}

export function getStrategiesByStyle(style: TradingStyle): Strategy[] {
  return ALL_STRATEGIES.filter((s) => s.style === style);
}

export function strategyName(id: StrategyId): string {
  return BY_ID.get(id)?.name ?? id;
}

export {
  INTRADAY_STRATEGIES,
  SHORT_TERM_STRATEGIES,
  SWING_STRATEGIES,
  POSITIONAL_STRATEGIES,
  LONG_TERM_STRATEGIES,
};
