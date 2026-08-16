/**
 * Characterisation tests for the chart path builder.
 *
 * Written to pin the *existing* behaviour of the two identical copies that
 * lived in `analytics-view.tsx` and `account-transactions-view.tsx`, so the
 * extraction into one shared module is provably behaviour-preserving. They are
 * deliberately assertions about exact output rather than about intent: the
 * point is to detect change, not to argue the curve is the right one.
 */

import { describe, expect, it } from "vitest";

import { getSmoothPath, type Point } from "./chart-path";

const line: Point[] = [
  { x: 0, y: 100 },
  { x: 10, y: 80 },
  { x: 20, y: 90 },
  { x: 30, y: 40 },
];

/** Every command letter in a path, in order. */
function commands(d: string): string[] {
  return d.match(/[A-Z]/g) ?? [];
}

describe("degenerate inputs", () => {
  it("returns an empty string for no points", () => {
    // An empty `d` renders nothing; "M" alone would be a parse error in strict
    // SVG consumers.
    expect(getSmoothPath([])).toBe("");
  });

  it("returns a bare move for a single point", () => {
    expect(getSmoothPath([{ x: 5, y: 7 }])).toBe("M 5.0,7.0");
  });

  it("returns a straight line for two points", () => {
    // No neighbours to derive curvature from, so smoothing is not attempted.
    expect(getSmoothPath([{ x: 0, y: 0 }, { x: 10, y: 20 }])).toBe("M 0.0,0.0 L 10.0,20.0");
  });
});

describe("smoothed paths", () => {
  it("starts with a move to the first point", () => {
    expect(getSmoothPath(line).startsWith("M 0.0,100.0")).toBe(true);
  });

  it("emits one cubic segment per gap between points", () => {
    expect(commands(getSmoothPath(line))).toEqual(["M", "C", "C", "C"]);
  });

  it("passes exactly through every data point", () => {
    // The property that matters for a chart: a curve that only approximates
    // the data is drawing numbers the user did not have.
    const d = getSmoothPath(line);
    for (const p of line.slice(1)) {
      expect(d).toContain(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    }
  });

  it("ends at the last point", () => {
    expect(getSmoothPath(line).endsWith("30.0,40.0")).toBe(true);
  });

  it("is deterministic", () => {
    expect(getSmoothPath(line)).toBe(getSmoothPath(line));
  });

  it("produces the exact path it always has", () => {
    // Golden output, captured by running the implementation being extracted —
    // not derived by hand. The point of a characterisation test is to record
    // what the code does today, so working it out independently would be
    // pinning an opinion about what it should do instead.
    expect(getSmoothPath(line)).toBe(
      "M 0.0,100.0 C 1.5,97.0 7.0,81.5 10.0,80.0 C 13.0,78.5 17.0,96.0 20.0,90.0 C 23.0,84.0 28.5,47.5 30.0,40.0",
    );
  });
});

describe("tension", () => {
  it("changes the control points", () => {
    expect(getSmoothPath(line, 0.15)).not.toBe(getSmoothPath(line, 0.4));
  });

  it("collapses control points onto the data points at zero", () => {
    // With no tension every control point sits on its anchor, so the curve is
    // effectively straight between points.
    const d = getSmoothPath(line, 0);
    expect(d).toContain("C 0.0,100.0 10.0,80.0 10.0,80.0");
  });

  it("keeps the endpoints fixed regardless of tension", () => {
    for (const tension of [0, 0.15, 0.5, 1]) {
      const d = getSmoothPath(line, tension);
      expect(d.startsWith("M 0.0,100.0")).toBe(true);
      expect(d.endsWith("30.0,40.0")).toBe(true);
    }
  });
});

describe("numeric handling", () => {
  it("rounds coordinates to one decimal place", () => {
    const d = getSmoothPath([{ x: 1.26, y: 2.34 }]);
    expect(d).toBe("M 1.3,2.3");
  });

  it("handles negative coordinates", () => {
    expect(getSmoothPath([{ x: -5.55, y: -1 }])).toBe("M -5.5,-1.0");
  });

  it("handles a flat series without producing NaN", () => {
    const flat = Array.from({ length: 6 }, (_, i) => ({ x: i * 10, y: 50 }));
    expect(getSmoothPath(flat)).not.toContain("NaN");
  });

  it("handles a long series without producing NaN", () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ x: i, y: Math.sin(i / 8) * 40 + 50 }));
    const d = getSmoothPath(many);
    expect(d).not.toContain("NaN");
    expect(commands(d)).toHaveLength(400); // 1 move + 399 curves
  });
});
