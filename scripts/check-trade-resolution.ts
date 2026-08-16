/**
 * Outcome rules for logged recommendations.
 *
 * `resolveTrade` decides every strategy's recorded win rate, and that rate is
 * fed back into the confidence shown on every card — so a wrong call here does
 * not stay contained, it biases the whole feed.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/check-trade-resolution.ts
 */
import {
  CALENDAR_DAYS_PER_TRADING_DAY,
  resolveTrade,
  type SessionRange,
  type TradeStatus,
} from "@/lib/engine/evaluate-trade";

const plan = { targetPrice: 110, stopLoss: 90, estimatedHoldDays: 10 };
/** 10 trading sessions == 14 calendar days. */
const holdCalendarDays = plan.estimatedHoldDays * CALENDAR_DAYS_PER_TRADING_DAY;

const cases: {
  label: string;
  session: SessionRange | null;
  daysElapsed: number;
  expected: TradeStatus;
}[] = [
  {
    label: "close below target but session high touched it",
    session: { price: 104, high: 111, low: 100 },
    daysElapsed: 3,
    expected: "won",
  },
  {
    label: "close above stop but session low touched it",
    session: { price: 95, high: 99, low: 89 },
    daysElapsed: 3,
    expected: "lost",
  },
  {
    label: "both levels traded in one session — ambiguous, take the loss",
    session: { price: 100, high: 112, low: 88 },
    daysElapsed: 3,
    expected: "lost",
  },
  {
    label: "quiet session inside both bands",
    session: { price: 100, high: 103, low: 97 },
    daysElapsed: 3,
    expected: "pending",
  },
  {
    label: `day ${holdCalendarDays - 1} of a ${plan.estimatedHoldDays}-session hold`,
    session: { price: 100, high: 103, low: 97 },
    daysElapsed: holdCalendarDays - 1,
    expected: "pending",
  },
  {
    label: `day ${holdCalendarDays + 1} of a ${plan.estimatedHoldDays}-session hold`,
    session: { price: 100, high: 103, low: 97 },
    daysElapsed: holdCalendarDays + 1,
    expected: "expired",
  },
  {
    label: "hold measured in trading days, not calendar days",
    session: { price: 100, high: 103, low: 97 },
    daysElapsed: plan.estimatedHoldDays + 1, // past 10 calendar, inside 14
    expected: "pending",
  },
  {
    label: "no quote, inside the stranded grace period",
    session: null,
    daysElapsed: 20,
    expected: "pending",
  },
  {
    label: "no quote, past the grace period — must not block future logging",
    session: null,
    daysElapsed: 50,
    expected: "expired",
  },
  {
    label: "missing high/low falls back to the last price",
    session: { price: 115 },
    daysElapsed: 3,
    expected: "won",
  },
];

let failed = 0;
for (const { label, session, daysElapsed, expected } of cases) {
  const actual = resolveTrade(plan, session, daysElapsed);
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` (got ${actual}, want ${expected})`}`);
}

console.log(`\n${cases.length - failed}/${cases.length} passed.`);
if (failed > 0) process.exit(1);
