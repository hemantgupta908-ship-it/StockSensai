// @vitest-environment jsdom

/**
 * Characterisation tests for `CategoryBreakdown`.
 *
 * Written before `analytics-view.tsx` is split apart, to pin what this widget
 * renders today. They assert on what a user can actually read — category names,
 * amounts, share percentages — rather than on markup structure, so that moving
 * the component to its own file, or reworking its layout, does not break them
 * while a genuine change to the numbers does.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";

import { CategoryBreakdown } from "./analytics-view";
import { renderWithBudget, screen } from "@/test/render-budget";

afterEach(cleanup);

/** Default category pks, from `defaultCategories()`. */
const DINING = "1";
const GROCERIES = "2";
const SHOPPING = "3";

describe("CategoryBreakdown", () => {
  it("renders a title when given one", async () => {
    await renderWithBudget(
      <CategoryBreakdown byCategory={new Map([[DINING, 1000]])} title="Where it went" />,
    );
    expect(screen.getByText("Where it went")).toBeDefined();
  });

  it("names each category present in the map", async () => {
    await renderWithBudget(
      <CategoryBreakdown
        byCategory={
          new Map([
            [DINING, 3000],
            [GROCERIES, 1000],
          ])
        }
      />,
    );
    expect(screen.getByText("Dining")).toBeDefined();
    expect(screen.getByText("Groceries")).toBeDefined();
  });

  it("does not name a category absent from the map", async () => {
    await renderWithBudget(<CategoryBreakdown byCategory={new Map([[DINING, 3000]])} />);
    expect(screen.queryByText("Shopping")).toBeNull();
  });

  it("shows only the first two categories until expanded", async () => {
    // `displayedEntries` slices to two while collapsed. Worth pinning, because
    // it means a caller cannot assume everything it passes will be visible.
    await renderWithBudget(
      <CategoryBreakdown
        byCategory={
          new Map([
            [DINING, 5000],
            [SHOPPING, 2000],
            [GROCERIES, 500],
          ])
        }
      />,
    );
    expect(screen.getByText("Dining")).toBeDefined();
    expect(screen.getByText("Shopping")).toBeDefined();
    expect(screen.queryByText("Groceries")).toBeNull();
  });

  it("shows each category's share of the total", async () => {
    // 3000 of 4000 is 75%, 1000 is 25%. The percentages are the part a reader
    // actually acts on, so they are pinned explicitly.
    await renderWithBudget(
      <CategoryBreakdown
        byCategory={
          new Map([
            [DINING, 3000],
            [GROCERIES, 1000],
          ])
        }
      />,
    );
    // `getAllBy`: the share is shown in both the donut centre and the legend.
    expect(screen.getAllByText(/75%/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/25%/).length).toBeGreaterThan(0);
  });

  it("renders in the map's insertion order, not by magnitude", async () => {
    // This component does no sorting of its own — `entries` is the Map's own
    // order. Every caller therefore has to pass an already-sorted Map, and one
    // that forgets gets an arbitrarily ordered chart with no error. Pinned
    // because it is the opposite of what the rendered output implies.
    const { container } = await renderWithBudget(
      <CategoryBreakdown
        byCategory={
          new Map([
            [GROCERIES, 500],
            [DINING, 5000],
          ])
        }
      />,
    );
    const text = container.textContent ?? "";
    expect(text.indexOf("Groceries")).toBeLessThan(text.indexOf("Dining"));
  });

  it("shows an empty state for an empty map", async () => {
    await renderWithBudget(<CategoryBreakdown byCategory={new Map()} />);
    expect(screen.getByText("Nothing to chart yet")).toBeDefined();
  });

  it("shows an empty state when the total is zero", async () => {
    // The degenerate case that would otherwise divide by zero and print NaN%
    // at the reader. Guarded by `total === 0` rather than by the map's size.
    const { container } = await renderWithBudget(
      <CategoryBreakdown byCategory={new Map([[DINING, 0]])} />,
    );
    expect(screen.getByText("Nothing to chart yet")).toBeDefined();
    expect(container.textContent ?? "").not.toContain("NaN");
  });

  it("renders an unknown category pk without crashing", async () => {
    // Category references can dangle — `repairDanglingCategoryRefs` exists
    // precisely because they do — so this must degrade rather than throw.
    const { container } = await renderWithBudget(
      <CategoryBreakdown byCategory={new Map([["no-such-category", 1000]])} />,
    );
    expect(container.textContent ?? "").not.toContain("NaN");
  });
});
