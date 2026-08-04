import { LONG_TERM_STRATEGIES } from "./long-term";
import { SHORT_TERM_STRATEGIES } from "./short-term";
import { SWING_STRATEGIES } from "./swing";
import type { Strategy, StrategyId, TradingStyle } from "./types";

export * from "./types";

/** All 15 strategies: 5 swing, 5 short-term, 5 long-term. */
export const ALL_STRATEGIES: Strategy[] = [
  ...SWING_STRATEGIES,
  ...SHORT_TERM_STRATEGIES,
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

export { SWING_STRATEGIES, SHORT_TERM_STRATEGIES, LONG_TERM_STRATEGIES };
