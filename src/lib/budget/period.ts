/**
 * Budget period arithmetic, ported from Cashew's `functions.dart`.
 *
 * This file is a deliberate 1:1 translation rather than a tidier rewrite: the
 * loop structure, the asymmetric `>` / `>=` comparisons and the "start on the
 * first of the month" trick all produce period boundaries that users' existing
 * data depends on. The Dart original is quoted where the reason is non-obvious.
 *
 * Dart's `DateTime(y, m, d)` normalises out-of-range components (month 13 rolls
 * into the next year, day 0 into the previous month, Feb 31 into March). JS's
 * `new Date(y, mIndex, d)` normalises identically, so the ports are faithful.
 */

import { BudgetReoccurence, type Budget } from "./types";

export interface DateTimeRange {
  start: Date;
  end: Date;
}

/**
 * Cashew's `DateTime.justDay` extension: strip the time, then shift by whole
 * calendar units. Offsets are applied to the raw components and normalised, so
 * `justDay(monthOffset: 1)` on Jan 31 gives Mar 2 — matching Dart.
 */
export function justDay(
  date: Date,
  { yearOffset = 0, monthOffset = 0, dayOffset = 0 } = {},
): Date {
  return new Date(
    date.getFullYear() + yearOffset,
    date.getMonth() + monthOffset,
    date.getDate() + dayOffset,
  );
}

export function firstDayOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Format a date as `YYYY-MM-DD` in **local** time, for `<input type="date">`.
 *
 * Not `toISOString().slice(0, 10)`: that converts to UTC first, so anywhere
 * east of Greenwich a local midnight reads as the previous day. In IST a budget
 * starting 1 August would be stored as 31 July and every period boundary would
 * be off by one.
 */
export function toDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

/** Parse a `YYYY-MM-DD` input value as local midnight, mirroring the above. */
export function fromDateInputValue(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/**
 * Move a date to local midday.
 *
 * Transactions are stamped at midday rather than midnight so that a later
 * timezone shift — a DST change, or the same data opened from another zone —
 * cannot tip the stored instant across a day boundary and move a transaction
 * into the neighbouring budget period.
 */
export function atMidday(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
}

/**
 * `count` dates one month apart, starting at `start`, each at local midday.
 *
 * The day of month is taken from `start` and clamped to the length of each
 * target month, so a schedule starting on the 31st lands on the 28th/30th
 * rather than rolling forward into the following month the way
 * `setMonth(m + 1)` would.
 */
export function monthlySchedule(start: Date, count: number): Date[] {
  const day = start.getDate();
  const dates: Date[] = [];
  for (let i = 0; i < count; i++) {
    const month = start.getMonth() + i;
    const daysInMonth = new Date(start.getFullYear(), month + 1, 0).getDate();
    dates.push(atMidday(new Date(start.getFullYear(), month, Math.min(day, daysInMonth))));
  }
  return dates;
}

/**
 * Clamp a budget's period to the same ceilings Cashew enforces on save, and
 * normalise `startDate` to midnight. `getBudgetDate` re-applies this because
 * the Dart original does, and an unclamped `periodLength` would otherwise let
 * the search loops below run to their 10,000-iteration cap.
 */
export function limitBudgetPeriod(budget: Budget): Budget {
  const maxTimePeriodYears = 10;
  const maxTimePeriodMonths = 100;
  const maxTimePeriodWeeks = 500;
  const maxTimePeriodDays = 1000;

  let periodLength = budget.periodLength;

  if (budget.reoccurrence === BudgetReoccurence.yearly && periodLength >= maxTimePeriodYears)
    periodLength = maxTimePeriodYears;
  else if (budget.reoccurrence === BudgetReoccurence.monthly && periodLength >= maxTimePeriodMonths)
    periodLength = maxTimePeriodMonths;
  else if (budget.reoccurrence === BudgetReoccurence.weekly && periodLength >= maxTimePeriodWeeks)
    periodLength = maxTimePeriodWeeks;
  else if (budget.reoccurrence === BudgetReoccurence.daily && periodLength >= maxTimePeriodDays)
    periodLength = maxTimePeriodDays;

  if (periodLength <= 0) periodLength = 1;

  return {
    ...budget,
    periodLength,
    startDate: justDay(new Date(budget.startDate)).toISOString(),
  };
}

/**
 * The period of `budget` that contains `currentDate`.
 *
 * Walks the period grid outward from the budget's `startDate` until it brackets
 * `currentDate`. The returned `end` is inclusive (the last day of the period),
 * which is why the loops subtract a day from the exclusive boundary.
 */
export function getBudgetDate(budgetInput: Budget, currentDate: Date): DateTimeRange {
  const budget = limitBudgetPeriod(budgetInput);

  if (budget.reoccurrence === BudgetReoccurence.custom) {
    return { start: new Date(budget.startDate), end: new Date(budget.endDate) };
  }

  const periodLength = budget.periodLength;
  let currentDateLoopStart = new Date(budget.startDate);
  let currentDateLoopEnd: Date;

  switch (budget.reoccurrence) {
    case BudgetReoccurence.daily:
      currentDateLoopEnd = justDay(currentDateLoopStart, { dayOffset: periodLength });
      break;
    case BudgetReoccurence.monthly:
      currentDateLoopEnd = justDay(currentDateLoopStart, { monthOffset: periodLength });
      break;
    case BudgetReoccurence.yearly:
      currentDateLoopEnd = justDay(currentDateLoopStart, { yearOffset: periodLength });
      break;
    case BudgetReoccurence.weekly:
      currentDateLoopEnd = justDay(currentDateLoopStart, { dayOffset: periodLength * 7 });
      break;
    default:
      return { start: new Date(budget.startDate), end: new Date(budget.endDate) };
  }

  const shift = (start: Date, end: Date, direction: 1 | -1): [Date, Date] => {
    const n = periodLength * direction;
    switch (budget.reoccurrence) {
      case BudgetReoccurence.daily:
        return [justDay(start, { dayOffset: n }), justDay(end, { dayOffset: n })];
      case BudgetReoccurence.monthly:
        return [justDay(start, { monthOffset: n }), justDay(end, { monthOffset: n })];
      case BudgetReoccurence.yearly:
        return [justDay(start, { yearOffset: n }), justDay(end, { yearOffset: n })];
      case BudgetReoccurence.weekly:
        return [justDay(start, { dayOffset: n * 7 }), justDay(end, { dayOffset: n * 7 })];
      default:
        return [start, end];
    }
  };

  const now = currentDate.getTime();

  if (now <= currentDateLoopEnd.getTime()) {
    // Walk backwards. Cashew's comment: "dont set this one >= only >, the other
    // if statement will catch it" — the asymmetry is what stops a date landing
    // exactly on a boundary from matching two adjacent periods.
    for (let i = 0; i < 10000; i++) {
      if (now > currentDateLoopStart.getTime() && now <= currentDateLoopEnd.getTime()) {
        return { start: currentDateLoopStart, end: justDay(currentDateLoopEnd, { dayOffset: -1 }) };
      }
      [currentDateLoopStart, currentDateLoopEnd] = shift(
        currentDateLoopStart,
        currentDateLoopEnd,
        -1,
      );
    }
  } else if (now >= currentDateLoopEnd.getTime()) {
    // Walk forwards.
    for (let i = 0; i < 10000; i++) {
      if (now >= currentDateLoopStart.getTime() && now <= currentDateLoopEnd.getTime()) {
        return { start: currentDateLoopStart, end: justDay(currentDateLoopEnd, { dayOffset: -1 }) };
      }
      [currentDateLoopStart, currentDateLoopEnd] = shift(
        currentDateLoopStart,
        currentDateLoopEnd,
        1,
      );
    }
  }

  return { start: new Date(budget.startDate), end: new Date(budget.endDate) };
}

/**
 * The probe date for the period `index` cycles before the current one — used to
 * page through budget history (index 0 is the current period).
 *
 * Monthly budgets probe day 1 rather than today's day-of-month: Cashew's fix
 * for the 31st, where a February probe would otherwise roll into March and skip
 * a period. The `isChecking` recursion then corrects the off-by-one that day-1
 * probing introduces when a monthly period resets mid-month.
 */
export function getDatePastToDetermineBudgetDate(
  index: number,
  budget: Budget,
  isChecking = true,
): Date {
  const reoccurrence = budget.reoccurrence;
  const periodLength = budget.periodLength;
  if (reoccurrence === null || reoccurrence === undefined) return new Date();

  const today = new Date();

  const year =
    today.getFullYear() - (reoccurrence === BudgetReoccurence.yearly ? index * periodLength : 0);
  const month =
    today.getMonth() - (reoccurrence === BudgetReoccurence.monthly ? index * periodLength : 0);
  const day =
    reoccurrence === BudgetReoccurence.monthly
      ? 1
      : today.getDate() -
        (reoccurrence === BudgetReoccurence.daily ? index * periodLength : 0) -
        (reoccurrence === BudgetReoccurence.weekly ? index * 7 * periodLength : 0);

  if (isChecking && reoccurrence === BudgetReoccurence.monthly) {
    const budgetRange = getBudgetDate(
      budget,
      getDatePastToDetermineBudgetDate(0, budget, false),
    );
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (budgetRange.end.getTime() < yesterday.getTime()) {
      return getDatePastToDetermineBudgetDate(index - 1, budget, false);
    }
  }

  return new Date(year, month, day, 0, 0, 1);
}

/** Convenience: the period `index` cycles back from now. */
export function getBudgetPeriodForIndex(budget: Budget, index: number): DateTimeRange {
  return getBudgetDate(budget, getDatePastToDetermineBudgetDate(index, budget));
}

/**
 * Next occurrence of a repeating transaction, matching
 * `createNewSubscriptionTransaction`'s date arithmetic (which preserves the
 * time-of-day rather than snapping to midnight).
 */
export function getNextRecurrenceDate(
  from: Date,
  reoccurrence: BudgetReoccurence | null,
  periodLength: number | null,
): Date {
  const n = periodLength ?? 0;
  let yearOffset = 0;
  let monthOffset = 0;
  let dayOffset = 0;

  if (reoccurrence === BudgetReoccurence.yearly) yearOffset = n;
  else if (reoccurrence === BudgetReoccurence.monthly) monthOffset = n;
  else if (reoccurrence === BudgetReoccurence.weekly) dayOffset = n * 7;
  else if (reoccurrence === BudgetReoccurence.daily) dayOffset = n;

  return new Date(
    from.getFullYear() + yearOffset,
    from.getMonth() + monthOffset,
    from.getDate() + dayOffset,
    from.getHours(),
    from.getMinutes(),
    from.getSeconds(),
    from.getMilliseconds(),
  );
}

/** "Monthly", "Every 3 weeks" — Cashew's period label form. */
export function reoccurrenceLabel(
  reoccurrence: BudgetReoccurence | null,
  periodLength: number | null,
): string {
  if (reoccurrence === BudgetReoccurence.custom) return "Custom";

  const n = periodLength ?? 1;
  const labels: Record<
    BudgetReoccurence.daily | BudgetReoccurence.weekly | BudgetReoccurence.monthly | BudgetReoccurence.yearly,
    { singular: string; unit: string }
  > = {
    [BudgetReoccurence.daily]: { singular: "Daily", unit: "day" },
    [BudgetReoccurence.weekly]: { singular: "Weekly", unit: "week" },
    [BudgetReoccurence.monthly]: { singular: "Monthly", unit: "month" },
    [BudgetReoccurence.yearly]: { singular: "Yearly", unit: "year" },
  };

  const label = labels[(reoccurrence ?? BudgetReoccurence.monthly) as keyof typeof labels];
  if (!label) return "Custom";

  return n === 1 ? label.singular : `Every ${n} ${label.unit}s`;
}

export function toDateTimeInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function fromDateTimeInputValue(value: string): Date {
  if (!value) return new Date();
  const [datePart, timePart] = value.split("T");
  const [y, m, d] = (datePart || "").split("-").map(Number);
  if (timePart) {
    const [hr, min] = timePart.split(":").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1, hr ?? 12, min ?? 0, 0, 0);
  }
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}
