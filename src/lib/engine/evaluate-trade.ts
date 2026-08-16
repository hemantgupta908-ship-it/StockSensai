/**
 * Outcome rules for a logged recommendation.
 *
 * Pure and separate from the cron route so the decision that drives every
 * strategy's win rate — and through it, the confidence on every card — can be
 * exercised directly rather than only through a scheduled job against a live
 * database.
 */

export type TradeStatus = "pending" | "won" | "lost" | "expired";

/**
 * Calendar days per trading day.
 *
 * `estimatedHoldDays` comes from a strategy's `holdDays`, which is quoted in
 * *trading* sessions — a "15–30 day" swing hold means 15–30 sessions. Ageing it
 * against the wall clock retires every setup roughly 40% early and inflates the
 * expired bucket at the expense of trades that would have resolved.
 */
export const CALENDAR_DAYS_PER_TRADING_DAY = 7 / 5;

/**
 * Grace period before a stranded row is retired.
 *
 * A row whose ticker stops returning a quote — delisted, renamed, or dropped
 * from the universe — would otherwise sit `pending` forever, and the recompute
 * cron's pending-set would then permanently refuse to log that ticker and
 * strategy again.
 */
export const STRANDED_GRACE_DAYS = 30;

export interface TradePlan {
  targetPrice: number;
  stopLoss: number;
  /** In trading sessions, as the strategies quote it. */
  estimatedHoldDays: number;
}

/** The session's range. `high`/`low` fall back to `price` when unavailable. */
export interface SessionRange {
  price: number;
  high?: number;
  low?: number;
}

export function resolveTrade(
  plan: TradePlan,
  session: SessionRange | null,
  daysElapsed: number,
): TradeStatus {
  const allowedCalendarDays = plan.estimatedHoldDays * CALENDAR_DAYS_PER_TRADING_DAY;

  // No quote to judge against. Retire the row once it is clearly stale so it
  // cannot block this ticker and strategy from being logged again.
  if (!session) {
    return daysElapsed > allowedCalendarDays + STRANDED_GRACE_DAYS ? "expired" : "pending";
  }

  // Judge against the session's range, not its last print. A target hit at 11am
  // that gave the level back by close is a real win the closing snapshot cannot
  // see — and this job samples once a day, so what it misses it misses for good.
  const high = Number.isFinite(session.high) ? (session.high as number) : session.price;
  const low = Number.isFinite(session.low) ? (session.low as number) : session.price;

  const hitTarget = high >= plan.targetPrice;
  const hitStop = low <= plan.stopLoss;

  // Both levels traded in the same session. OHLC does not record which came
  // first, and resolving the ambiguity as a win would inflate the win rate that
  // feeds back into confidence scoring. Take the loss.
  if (hitTarget && hitStop) return "lost";
  if (hitTarget) return "won";
  if (hitStop) return "lost";
  if (daysElapsed > allowedCalendarDays) return "expired";

  return "pending";
}
