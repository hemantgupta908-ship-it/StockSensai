/**
 * Tests for partial exits.
 *
 * A partial sell splits one open row into a closed tranche and a smaller open
 * remainder, which is how the journal supports selling half a position without
 * an `exitQuantity` column. That makes `splitLot` the one place where share
 * counts are rewritten, so the invariant it has to hold is conservation: the
 * quantity across the resulting rows equals the quantity before it ran.
 *
 * The assertions below are about quantities and realised P&L rather than row
 * order or ids, so reordering the journal or changing how ids are minted does
 * not break them while a genuine arithmetic change does.
 */

import { describe, expect, it } from "vitest";

import { splitLot, type PortfolioEntry } from "./portfolio-provider";

let counter = 0;
const nextId = () => `generated-${++counter}`;

function entry(overrides: Partial<PortfolioEntry> = {}): PortfolioEntry {
  return {
    id: "lot-1",
    ticker: "MAZDOCK",
    name: "Mazagon Dock Shipbuilders",
    exchange: "NSE",
    quantity: 130,
    entryPrice: 245,
    entryDate: "2026-01-01",
    strategyId: "swing-ema-cross",
    tradingStyle: "swing",
    recommendedBuyLow: 240,
    recommendedBuyHigh: 250,
    recommendedSellLow: 300,
    recommendedSellHigh: 320,
    recommendedStopLoss: 220,
    exitPrice: null,
    exitDate: null,
    note: "first tranche",
    ...overrides,
  };
}

/** Shares across every row, closed or open. */
function totalQuantity(entries: PortfolioEntry[]): number {
  return entries.reduce((sum, e) => sum + e.quantity, 0);
}

describe("splitLot", () => {
  it("conserves the share count across the split", () => {
    const before = [entry()];
    const after = splitLot(before, "lot-1", 50, 300, "2026-08-21", nextId);

    expect(after).not.toBeNull();
    expect(totalQuantity(after!)).toBe(totalQuantity(before));
  });

  it("closes the sold tranche and leaves the remainder open", () => {
    const after = splitLot([entry()], "lot-1", 50, 300, "2026-08-21", nextId)!;

    const closed = after.filter((e) => e.exitPrice !== null);
    const open = after.filter((e) => e.exitPrice === null);

    expect(closed).toHaveLength(1);
    expect(closed[0].quantity).toBe(50);
    expect(closed[0].exitPrice).toBe(300);
    expect(closed[0].exitDate).toBe("2026-08-21");

    expect(open).toHaveLength(1);
    expect(open[0].id).toBe("lot-1");
    expect(open[0].quantity).toBe(80);
    expect(open[0].exitDate).toBeNull();
  });

  it("realises P&L only on the shares actually sold", () => {
    const after = splitLot([entry()], "lot-1", 50, 300, "2026-08-21", nextId)!;
    const closed = after.find((e) => e.exitPrice !== null)!;

    // 50 shares bought at 245, sold at 300.
    expect((closed.exitPrice! - closed.entryPrice) * closed.quantity).toBe(2750);
  });

  it("carries the original cost basis and plan onto the closed tranche", () => {
    const original = entry();
    const after = splitLot([original], "lot-1", 50, 300, "2026-08-21", nextId)!;
    const closed = after.find((e) => e.exitPrice !== null)!;

    expect(closed.entryPrice).toBe(original.entryPrice);
    expect(closed.entryDate).toBe(original.entryDate);
    expect(closed.ticker).toBe(original.ticker);
    expect(closed.strategyId).toBe(original.strategyId);
    expect(closed.recommendedStopLoss).toBe(original.recommendedStopLoss);
  });

  it("gives the closed tranche a fresh id so it does not collide with the open lot", () => {
    const after = splitLot([entry()], "lot-1", 50, 300, "2026-08-21", nextId)!;
    const ids = after.map((e) => e.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("lot-1");
  });

  it("leaves other positions untouched", () => {
    const other = entry({ id: "lot-2", ticker: "TMPV", quantity: 53 });
    const after = splitLot([entry(), other], "lot-1", 50, 300, "2026-08-21", nextId)!;

    expect(after.find((e) => e.id === "lot-2")).toEqual(other);
  });

  it("supports selling the same lot down in successive tranches", () => {
    let entries = [entry()];
    entries = splitLot(entries, "lot-1", 30, 300, "2026-08-21", nextId)!;
    entries = splitLot(entries, "lot-1", 40, 310, "2026-08-22", nextId)!;

    expect(totalQuantity(entries)).toBe(130);
    expect(entries.find((e) => e.id === "lot-1")!.quantity).toBe(60);

    const realised = entries
      .filter((e) => e.exitPrice !== null)
      .reduce((sum, e) => sum + (e.exitPrice! - e.entryPrice) * e.quantity, 0);
    // 30 × (300−245) = 1650, plus 40 × (310−245) = 2600.
    expect(realised).toBe(4250);
  });

  it("declines a full exit, which is an ordinary close rather than a split", () => {
    expect(splitLot([entry()], "lot-1", 130, 300, "2026-08-21", nextId)).toBeNull();
  });

  it("declines a quantity larger than the position", () => {
    expect(splitLot([entry()], "lot-1", 200, 300, "2026-08-21", nextId)).toBeNull();
  });

  it("declines a non-positive quantity", () => {
    expect(splitLot([entry()], "lot-1", 0, 300, "2026-08-21", nextId)).toBeNull();
    expect(splitLot([entry()], "lot-1", -10, 300, "2026-08-21", nextId)).toBeNull();
  });

  it("declines an unknown position", () => {
    expect(splitLot([entry()], "nope", 10, 300, "2026-08-21", nextId)).toBeNull();
  });
});
