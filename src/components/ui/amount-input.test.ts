import { describe, expect, it } from "vitest";

import { applyKey, settle, toggleSign } from "./amount-input";

/**
 * The keypad's editing rules.
 *
 * These matter more than they look: the pad is the *only* way to enter an
 * amount on a phone, so a rule that lets a malformed expression through has no
 * OS keyboard behind it to correct with. Everything here is the pocket-calculator
 * behaviour people already expect.
 */

const type = (keys: string[]) => keys.reduce(applyKey, "");

describe("applyKey", () => {
  it("builds a plain number", () => {
    expect(type(["1", "2", ".", "5"])).toBe("12.5");
  });

  it("eats a lone leading zero", () => {
    expect(type(["0", "0", "7"])).toBe("7");
    // ...but not the zero that belongs to a decimal.
    expect(type(["0", ".", "5"])).toBe("0.5");
  });

  it("opens a decimal with its own zero", () => {
    expect(type([".", "5"])).toBe("0.5");
    expect(type(["1", "+", "."])).toBe("1+0.");
  });

  it("allows only one point per number", () => {
    expect(type(["1", ".", "2", "."])).toBe("1.2");
    // The second number gets its own point.
    expect(type(["1", ".", "2", "+", "3", ".", "4"])).toBe("1.2+3.4");
  });

  it("replaces an operator rather than stacking one", () => {
    expect(type(["5", "+", "-"])).toBe("5-");
    expect(type(["5", "+", "-", "×"])).toBe("5×");
  });

  it("refuses an operator as the first key, except minus", () => {
    expect(type(["×"])).toBe("");
    expect(type(["-", "5"])).toBe("-5");
  });

  it("implies a multiply before an opening bracket", () => {
    expect(type(["2", "("])).toBe("2×(");
    expect(type(["2", "+", "("])).toBe("2+(");
  });

  it("closes a bracket only when one is open and complete", () => {
    expect(type(["2", "(", "3", ")"])).toBe("2×(3)");
    expect(type([")"])).toBe("");
    expect(type(["(", "+"])).toBe("(");
    expect(type(["(", "3", "+", ")"])).toBe("(3+");
  });
});

describe("toggleSign", () => {
  it("negates and restores the number being entered", () => {
    expect(toggleSign("50")).toBe("-50");
    expect(toggleSign("-50")).toBe("50");
  });

  it("touches only the trailing number", () => {
    expect(toggleSign("12+5")).toBe("12-5");
    expect(toggleSign("12-5")).toBe("12+5");
  });

  it("starts a negative from empty", () => {
    expect(toggleSign("")).toBe("-");
  });
});

describe("settle", () => {
  it("reduces a complete expression to its result", () => {
    expect(settle("886.38-878")).toBe("8.38");
    expect(settle("1200÷3")).toBe("400");
    expect(settle("2×(3+4)")).toBe("14");
  });

  it("leaves a plain number alone", () => {
    expect(settle("12.5")).toBe("12.5");
    expect(settle("")).toBe("");
  });

  it("leaves an unfinished expression as typed, to be corrected", () => {
    expect(settle("886.38-")).toBe("886.38-");
    expect(settle("5÷0")).toBe("5÷0");
  });
});
