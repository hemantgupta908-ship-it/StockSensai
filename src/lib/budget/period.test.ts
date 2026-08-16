/**
 * Budget period arithmetic.
 *
 * The suite runs pinned to Asia/Kolkata (see vitest.config.ts). That is not
 * incidental: this module's known production bug was a UTC conversion that
 * moved every date back a day east of Greenwich, and a test running in UTC
 * cannot see it.
 */

import { describe, expect, it } from "vitest";

import { BudgetReoccurence, type Budget } from "./types";
import {
  atMidday,
  firstDayOfMonth,
  fromDateInputValue,
  fromDateTimeInputValue,
  getBudgetDate,
  getNextRecurrenceDate,
  justDay,
  limitBudgetPeriod,
  monthlySchedule,
  reoccurrenceLabel,
  toDateInputValue,
  toDateTimeInputValue,
} from "./period";

function budget(patch: Partial<Budget> = {}): Budget {
  return {
    budgetPk: "b1",
    name: "Test",
    amount: 10000,
    startDate: new Date(2026, 7, 1).toISOString(), // 1 Aug 2026, local
    endDate: new Date(2027, 7, 1).toISOString(),
    reoccurrence: BudgetReoccurence.monthly,
    periodLength: 1,
    dateTimeModified: null,
    ...patch,
  } as Budget;
}

describe("local date formatting", () => {
  it("does not shift the day east of Greenwich", () => {
    // The regression itself: local midnight on 1 Aug is 31 Jul in UTC.
    const localMidnight = new Date(2026, 7, 1, 0, 0, 0);
    expect(toDateInputValue(localMidnight)).toBe("2026-08-01");
    expect(localMidnight.toISOString().slice(0, 10)).toBe("2026-07-31");
  });

  it("pads single-digit months and days", () => {
    expect(toDateInputValue(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("round-trips through fromDateInputValue", () => {
    for (const value of ["2026-08-01", "2026-01-05", "2026-12-31", "2024-02-29"]) {
      expect(toDateInputValue(fromDateInputValue(value))).toBe(value);
    }
  });

  it("parses input values at local midnight, not UTC midnight", () => {
    const parsed = fromDateInputValue("2026-08-01");
    expect(parsed.getHours()).toBe(0);
    expect(parsed.getDate()).toBe(1);
    expect(parsed.getMonth()).toBe(7);
  });

  it("round-trips datetime input values", () => {
    const value = "2026-08-01T14:30";
    expect(toDateTimeInputValue(fromDateTimeInputValue(value))).toBe(value);
  });

  it("defaults a bare date to midday, away from either day boundary", () => {
    expect(fromDateTimeInputValue("2026-08-01").getHours()).toBe(12);
  });
});

describe("atMidday", () => {
  it("puts the instant twelve hours from either boundary", () => {
    const d = atMidday(new Date(2026, 7, 1, 23, 59, 59));
    expect(d.getHours()).toBe(12);
    expect(d.getDate()).toBe(1);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
  });
});

describe("justDay", () => {
  it("strips the time", () => {
    const d = justDay(new Date(2026, 7, 15, 18, 45, 30));
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0]);
  });

  it("normalises an overflowing day the way Dart does", () => {
    // Jan 31 + 1 month is Feb 31, which normalises to Mar 2 (2026 is not a leap
    // year). The port depends on this matching Dart exactly.
    const d = justDay(new Date(2026, 0, 31), { monthOffset: 1 });
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(3);
  });

  it("rolls a month offset across a year boundary", () => {
    const d = justDay(new Date(2026, 11, 15), { monthOffset: 1 });
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(0);
  });

  it("handles negative day offsets across a month boundary", () => {
    const d = justDay(new Date(2026, 7, 1), { dayOffset: -1 });
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(31);
  });
});

describe("firstDayOfMonth", () => {
  it("returns day 1 at midnight", () => {
    const d = firstDayOfMonth(new Date(2026, 7, 23, 9, 30));
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(0);
  });
});

describe("monthlySchedule", () => {
  it("produces the requested count one month apart", () => {
    const dates = monthlySchedule(new Date(2026, 0, 15), 4);
    expect(dates).toHaveLength(4);
    expect(dates.map((d) => d.getMonth())).toEqual([0, 1, 2, 3]);
    expect(dates.every((d) => d.getDate() === 15)).toBe(true);
  });

  it("clamps the 31st to each month's length instead of rolling forward", () => {
    // The bug this guards: setMonth(m+1) on Jan 31 yields Mar 3, silently
    // skipping February and paying a premium twice in March.
    const dates = monthlySchedule(new Date(2026, 0, 31), 4);
    expect(dates.map((d) => [d.getMonth(), d.getDate()])).toEqual([
      [0, 31],
      [1, 28],
      [2, 31],
      [3, 30],
    ]);
  });

  it("clamps to 29 February in a leap year", () => {
    const dates = monthlySchedule(new Date(2024, 0, 31), 2);
    expect(dates[1].getDate()).toBe(29);
  });

  it("stamps every date at midday", () => {
    expect(monthlySchedule(new Date(2026, 0, 15), 3).every((d) => d.getHours() === 12)).toBe(true);
  });

  it("returns nothing for a zero count", () => {
    expect(monthlySchedule(new Date(2026, 0, 15), 0)).toEqual([]);
  });
});

describe("limitBudgetPeriod", () => {
  it("caps each recurrence at its own ceiling", () => {
    const cases: [BudgetReoccurence, number, number][] = [
      [BudgetReoccurence.yearly, 50, 10],
      [BudgetReoccurence.monthly, 500, 100],
      [BudgetReoccurence.weekly, 9999, 500],
      [BudgetReoccurence.daily, 5000, 1000],
    ];
    for (const [reoccurrence, given, expected] of cases) {
      expect(
        limitBudgetPeriod(budget({ reoccurrence, periodLength: given })).periodLength,
      ).toBe(expected);
    }
  });

  it("raises a non-positive period to 1", () => {
    // A zero period would make the search loops below run to their 10,000 cap
    // and return a nonsense range.
    expect(limitBudgetPeriod(budget({ periodLength: 0 })).periodLength).toBe(1);
    expect(limitBudgetPeriod(budget({ periodLength: -5 })).periodLength).toBe(1);
  });

  it("leaves a period inside the ceiling alone", () => {
    expect(limitBudgetPeriod(budget({ periodLength: 3 })).periodLength).toBe(3);
  });
});

describe("getBudgetDate", () => {
  it("brackets a date inside a monthly period", () => {
    const range = getBudgetDate(budget(), new Date(2026, 7, 15));
    expect(toDateInputValue(range.start)).toBe("2026-08-01");
    expect(toDateInputValue(range.end)).toBe("2026-08-31");
  });

  it("finds a period in the past by walking backwards", () => {
    const range = getBudgetDate(budget(), new Date(2026, 4, 10));
    expect(toDateInputValue(range.start)).toBe("2026-05-01");
    expect(toDateInputValue(range.end)).toBe("2026-05-31");
  });

  it("finds a period in the future by walking forwards", () => {
    const range = getBudgetDate(budget(), new Date(2026, 10, 10));
    expect(toDateInputValue(range.start)).toBe("2026-11-01");
    expect(toDateInputValue(range.end)).toBe("2026-11-30");
  });

  it("returns an inclusive end date", () => {
    // The end is the last day *in* the period, not the exclusive boundary —
    // an off-by-one here puts the 1st of a month in the previous budget.
    const range = getBudgetDate(budget(), new Date(2026, 7, 15));
    expect(range.end.getMonth()).toBe(7);
    expect(range.end.getDate()).toBe(31);
  });

  it("does not let one date match two adjacent periods", () => {
    // The asymmetric > / >= comparisons exist for exactly this.
    const first = getBudgetDate(budget(), new Date(2026, 7, 31, 12));
    const second = getBudgetDate(budget(), new Date(2026, 8, 1, 12));
    expect(toDateInputValue(first.start)).toBe("2026-08-01");
    expect(toDateInputValue(second.start)).toBe("2026-09-01");
  });

  it("handles a multi-month period length", () => {
    const range = getBudgetDate(budget({ periodLength: 3 }), new Date(2026, 9, 15));
    expect(toDateInputValue(range.start)).toBe("2026-08-01");
    expect(toDateInputValue(range.end)).toBe("2026-10-31");
  });

  it("handles weekly periods", () => {
    const range = getBudgetDate(
      budget({ reoccurrence: BudgetReoccurence.weekly, periodLength: 1 }),
      new Date(2026, 7, 5),
    );
    expect(toDateInputValue(range.start)).toBe("2026-08-01");
    expect(toDateInputValue(range.end)).toBe("2026-08-07");
  });

  it("handles daily periods", () => {
    const range = getBudgetDate(
      budget({ reoccurrence: BudgetReoccurence.daily, periodLength: 1 }),
      new Date(2026, 7, 5, 12),
    );
    expect(toDateInputValue(range.start)).toBe("2026-08-05");
    expect(toDateInputValue(range.end)).toBe("2026-08-05");
  });

  it("handles yearly periods", () => {
    const range = getBudgetDate(
      budget({ reoccurrence: BudgetReoccurence.yearly, periodLength: 1 }),
      new Date(2026, 9, 15),
    );
    expect(toDateInputValue(range.start)).toBe("2026-08-01");
    expect(toDateInputValue(range.end)).toBe("2027-07-31");
  });

  it("returns the explicit range for a custom budget", () => {
    const b = budget({
      reoccurrence: BudgetReoccurence.custom,
      startDate: new Date(2026, 2, 10).toISOString(),
      endDate: new Date(2026, 5, 20).toISOString(),
    });
    const range = getBudgetDate(b, new Date(2026, 3, 1));
    expect(toDateInputValue(range.start)).toBe("2026-03-10");
    expect(toDateInputValue(range.end)).toBe("2026-06-20");
  });

  it("terminates on a far-future date rather than hanging", () => {
    const range = getBudgetDate(
      budget({ reoccurrence: BudgetReoccurence.daily, periodLength: 1 }),
      new Date(2030, 0, 1, 12),
    );
    expect(range.start).toBeInstanceOf(Date);
  });
});

describe("getNextRecurrenceDate", () => {
  it("advances by each unit", () => {
    const from = new Date(2026, 7, 15, 9, 30, 15, 250);
    expect(getNextRecurrenceDate(from, BudgetReoccurence.daily, 1).getDate()).toBe(16);
    expect(getNextRecurrenceDate(from, BudgetReoccurence.weekly, 1).getDate()).toBe(22);
    expect(getNextRecurrenceDate(from, BudgetReoccurence.monthly, 1).getMonth()).toBe(8);
    expect(getNextRecurrenceDate(from, BudgetReoccurence.yearly, 1).getFullYear()).toBe(2027);
  });

  it("preserves the time of day", () => {
    const from = new Date(2026, 7, 15, 9, 30, 15, 250);
    const next = getNextRecurrenceDate(from, BudgetReoccurence.monthly, 1);
    expect([next.getHours(), next.getMinutes(), next.getSeconds(), next.getMilliseconds()]).toEqual([
      9, 30, 15, 250,
    ]);
  });

  it("returns the same instant for a null recurrence", () => {
    const from = new Date(2026, 7, 15, 9, 30);
    expect(getNextRecurrenceDate(from, null, null).getTime()).toBe(from.getTime());
  });
});

describe("reoccurrenceLabel", () => {
  it("uses the singular form for a period of one", () => {
    expect(reoccurrenceLabel(BudgetReoccurence.monthly, 1)).toBe("Monthly");
    expect(reoccurrenceLabel(BudgetReoccurence.daily, 1)).toBe("Daily");
  });

  it("pluralises a longer period", () => {
    expect(reoccurrenceLabel(BudgetReoccurence.weekly, 3)).toBe("Every 3 weeks");
    expect(reoccurrenceLabel(BudgetReoccurence.yearly, 2)).toBe("Every 2 years");
  });

  it("labels a custom budget", () => {
    expect(reoccurrenceLabel(BudgetReoccurence.custom, 1)).toBe("Custom");
  });
});
