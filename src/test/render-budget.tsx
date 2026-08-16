/**
 * Test harness for rendering budget components.
 *
 * The budget widgets all read their data from `BudgetProvider`'s store rather
 * than from props, so none of them can be rendered in isolation. This mounts a
 * real provider over a seeded database — deliberately the real one, not a mock
 * store, because a mock would let the widgets pass against a shape the actual
 * provider never produces.
 *
 * It works without any backend: with no Supabase environment variables set,
 * `isSupabaseConfigured` is false and the provider takes its local-only path,
 * hydrating from `localStorage`. So seeding storage before mounting is all the
 * setup required.
 */

import { render, screen, waitFor, type RenderResult } from "@testing-library/react";

import { SessionProvider } from "@/components/auth/session-provider";
import { BudgetProvider } from "@/components/budget/budget-provider";
import { defaultCategories, defaultWallets, DEFAULT_BUDGET_SETTINGS } from "@/lib/budget/defaults";
import type { BudgetDatabase } from "@/lib/budget/types";

const DATA_KEY = "cashew.data";
const SETTINGS_KEY = "cashew.settings";

export function emptyDatabase(): BudgetDatabase {
  return {
    wallets: [],
    transactions: [],
    categories: [],
    categoryBudgetLimits: [],
    associatedTitles: [],
    budgets: [],
    objectives: [],
    scannerTemplates: [],
    policies: [],
    deleteLogs: [],
  };
}

/** The first-run dataset: one account and Cashew's default categories. */
export function seededDatabase(patch: Partial<BudgetDatabase> = {}): BudgetDatabase {
  return {
    ...emptyDatabase(),
    wallets: defaultWallets(),
    categories: defaultCategories(),
    ...patch,
  };
}

/**
 * Mount `ui` inside a hydrated budget provider.
 *
 * Awaits hydration before returning. The provider loads asynchronously even in
 * local mode, so a synchronous render would hand back a tree still showing its
 * empty initial state, and every assertion would race it.
 */
export async function renderWithBudget(
  ui: React.ReactElement,
  db: BudgetDatabase = seededDatabase(),
): Promise<RenderResult> {
  localStorage.setItem(DATA_KEY, JSON.stringify(db));
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_BUDGET_SETTINGS));

  const result = render(
    <SessionProvider>
      <BudgetProvider>{ui}</BudgetProvider>
    </SessionProvider>,
  );

  // Wait for hydration to replace the provider's empty initial state. Throwing
  // rather than asserting keeps this harness independent of the test runner's
  // globals — `expect` is not global here unless `globals: true` is set.
  await waitFor(() => {
    if (!result.container.firstChild) throw new Error("nothing rendered yet");
  });

  return result;
}

export { screen, waitFor };
