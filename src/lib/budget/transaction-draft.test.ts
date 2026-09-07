// @vitest-environment jsdom

/**
 * The draft is the only thing standing between a half-typed expense and the
 * back button, so these pin the three ways it is allowed to come back empty:
 * a different sheet, an older build's shape, and an entry old enough to be
 * someone else's problem.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  clearTransactionDraft,
  draftContextKey,
  readTransactionDraft,
  writeTransactionDraft,
  type TransactionDraft,
} from "./transaction-draft";

const KEY = "cashew.transaction-draft";

function draft(overrides: Partial<TransactionDraft> = {}): TransactionDraft {
  return {
    tab: "expense",
    amount: "42.50",
    name: "Groceries",
    note: "",
    categoryFk: "cat-1",
    subCategoryFk: "",
    walletFk: "wallet-1",
    date: "2026-09-02T18:30",
    specialType: "none",
    reoccurrence: "2",
    periodLength: "1",
    endDate: "",
    paid: true,
    objectiveFk: "",
    objectiveLoanFk: "",
    budgetFk: "",
    toWalletFk: "",
    transferFee: "",
    ...overrides,
  };
}

describe("transaction draft", () => {
  beforeEach(() => localStorage.clear());

  it("returns what was written for the same sheet", () => {
    const context = draftContextKey({ walletFk: "wallet-1" }, undefined);
    writeTransactionDraft(context, draft());
    expect(readTransactionDraft(context)).toEqual(draft());
  });

  it("keys on the content of the defaults, not their identity", () => {
    // Call sites pass a fresh object literal on every render; two of them must
    // still address the same draft.
    expect(draftContextKey({ walletFk: "w1" }, "expense")).toBe(
      draftContextKey({ walletFk: "w1" }, "expense"),
    );
  });

  it("withholds a draft from a sheet opened with different presets", () => {
    writeTransactionDraft(draftContextKey({ walletFk: "wallet-1" }, undefined), draft());
    expect(readTransactionDraft(draftContextKey({ walletFk: "wallet-2" }, undefined))).toBeNull();
    expect(readTransactionDraft(draftContextKey(undefined, undefined))).toBeNull();
  });

  it("drops a draft older than a day rather than resurrecting it", () => {
    const context = draftContextKey(undefined, undefined);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(
      KEY,
      JSON.stringify({ context, savedAt: twoDaysAgo, values: draft() }),
    );
    expect(readTransactionDraft(context)).toBeNull();
  });

  it("drops a draft whose shape predates a field", () => {
    const context = draftContextKey(undefined, undefined);
    const { transferFee: _dropped, ...incomplete } = draft();
    localStorage.setItem(
      KEY,
      JSON.stringify({ context, savedAt: new Date().toISOString(), values: incomplete }),
    );
    expect(readTransactionDraft(context)).toBeNull();
  });

  it("survives junk in storage", () => {
    localStorage.setItem(KEY, "{not json");
    expect(readTransactionDraft(draftContextKey(undefined, undefined))).toBeNull();
  });

  it("clears", () => {
    const context = draftContextKey(undefined, undefined);
    writeTransactionDraft(context, draft());
    clearTransactionDraft();
    expect(readTransactionDraft(context)).toBeNull();
  });
});
