"use client";
import { useShallow } from "zustand/react/shallow";

/**
 * The budget environment's data store.
 *
 * Local-first by design, matching the rest of this app: everything works with
 * no account and no backend, persisted to `localStorage` under its own
 * `cashew.` namespace so the budget environment shares no state with the stock
 * side. When Supabase is configured and the user is signed in, the same data is
 * mirrored there; a failed sync degrades to local rather than losing the write.
 *
 * Cashew's own model is reproduced faithfully (see `src/lib/budget/types.ts`),
 * including delete tombstones, so an export from here round-trips.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createStore, useStore, type StoreApi } from "zustand";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useSession } from "@/components/auth/session-provider";
import {
  BALANCE_CORRECTION_CATEGORY_PK,
  TRANSFER_CATEGORY_PK,
  DeleteLogType,
  ObjectiveType,
  type Budget,
  type BudgetDatabase,
  type CategoryBudgetLimit,
  type DeleteLog,
  type Objective,
  type Policy,
  type ScannerTemplate,
  type Transaction,
  type TransactionAssociatedTitle,
  type TransactionCategory,
  type TransactionWallet,
} from "@/lib/budget/types";
import {
  DEFAULT_BUDGET_SETTINGS,
  DEFAULT_INCOME_SUBCATEGORIES,
  defaultCategories,
  defaultWallets,
  type BudgetSettings,
} from "@/lib/budget/defaults";
import { buildAllWallets, DEFAULT_EXCHANGE_RATES, type AllWallets } from "@/lib/budget/currency";
import { autoPayDueTransactions } from "@/lib/budget/recurring";
import { getPolicySavingsTotal } from "@/lib/budget/credit";
import { repairDanglingCategoryRefs } from "@/lib/budget/repair";
import { mergePolicies } from "@/lib/budget/policy-merge";
import { mergeDatabases } from "@/lib/budget/sync";
import { newId } from "@/lib/budget/factory";
import { backendFor } from "@/lib/store/backend";
import { readBudget, writeBudget, UNREACHABLE } from "@/lib/store/budget-remote";

const DATA_KEY = "cashew.data";
const SETTINGS_KEY = "cashew.settings";

/** How long edits are batched before the document is pushed to Supabase. */
const REMOTE_WRITE_DEBOUNCE_MS = 800;

/**
 * How many times a write will re-read, merge and retry before giving up.
 *
 * Each round trip narrows the window, so losing three in a row means something
 * is wrong rather than busy. The local copy is authoritative either way, so
 * stopping costs a delayed sync, not data.
 */
const MAX_SYNC_ATTEMPTS = 3;

/** Mirror the document into this browser. Synchronous, and never throws. */
function writeLocal(data: BudgetDatabase, settings: BudgetSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn("[budget] local persist failed:", e);
  }
}

function emptyDatabase(): BudgetDatabase {
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

/**
 * Bring a stored database up to date with the current schema.
 *
 * Kept deliberately small and idempotent: it only backfills things whose
 * absence would break rendering, and runs on every load.
 */
function migrate(db: BudgetDatabase): BudgetDatabase {
  let categories = db.categories;
  let transactions = db.transactions;

  // The Transfer category was split out of Balance Correction; stores written
  // before that have neither the category nor correctly-filed transfers.
  const hasTransferCategory = categories.some((c) => c.categoryPk === TRANSFER_CATEGORY_PK);
  if (categories.length > 0 && !hasTransferCategory) {
    const seeded = defaultCategories().find((c) => c.categoryPk === TRANSFER_CATEGORY_PK);
    if (seeded) categories = [seeded, ...categories];

    // A paired transaction in the correction category is a transfer — that
    // pairing is exactly what a correction never has.
    transactions = transactions.map((t) =>
      t.categoryFk === BALANCE_CORRECTION_CATEGORY_PK && t.pairedTransactionFk !== null
        ? { ...t, categoryFk: TRANSFER_CATEGORY_PK }
        : t,
    );
  }

  const rebuilt =
    categories === db.categories && transactions === db.transactions
      ? db
      : { ...db, categories, transactions };

  // Re-point category references that resolve to nothing. Runs last so it sees
  // any category the steps above seeded.
  return repairDanglingCategoryRefs(rebuilt);
}

/** First-run dataset: one account and Cashew's twelve categories. */
function seedDatabase(): BudgetDatabase {
  return { ...emptyDatabase(), wallets: defaultWallets(), categories: defaultCategories() };
}

function readLocalData(): BudgetDatabase {
  if (typeof window === "undefined") return emptyDatabase();
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (!raw) return seedDatabase();
    const parsed = JSON.parse(raw) as Partial<BudgetDatabase>;
    // Merge over an empty shell so a store written by an older build that
    // lacked a table still loads instead of throwing on a missing array.
    return migrate({ ...emptyDatabase(), ...parsed });
  } catch {
    return seedDatabase();
  }
}

function readLocalSettings(): BudgetSettings {
  if (typeof window === "undefined") return DEFAULT_BUDGET_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_BUDGET_SETTINGS;
    return { ...DEFAULT_BUDGET_SETTINGS, ...(JSON.parse(raw) as Partial<BudgetSettings>) };
  } catch {
    return DEFAULT_BUDGET_SETTINGS;
  }
}

type TableName = keyof BudgetDatabase;

interface BudgetStore extends BudgetDatabase {
  loading: boolean;
  /** True when running without a backend — everything lives in this browser. */
  isLocal: boolean;
  settings: BudgetSettings;
  /** Accounts plus resolved primary currency, for every money calculation. */
  allWallets: AllWallets;

  updateSettings: (patch: Partial<BudgetSettings>) => void;

  upsertTransaction: (transaction: Transaction) => void;
  upsertTransactions: (transactions: Transaction[]) => void;
  deleteTransaction: (pk: string, opts?: { includePaired?: boolean }) => void;
  deleteTransactions: (pks: string[]) => void;

  upsertCategory: (category: TransactionCategory) => void;
  deleteCategory: (pk: string, moveToCategoryPk?: string) => void;

  upsertWallet: (wallet: TransactionWallet) => void;
  deleteWallet: (pk: string, moveToWalletPk?: string) => void;

  upsertBudget: (budget: Budget) => void;
  deleteBudget: (pk: string) => void;

  upsertObjective: (objective: Objective) => void;
  deleteObjective: (pk: string) => void;

  upsertCategoryLimit: (limit: CategoryBudgetLimit) => void;
  deleteCategoryLimit: (pk: string) => void;

  upsertAssociatedTitle: (title: TransactionAssociatedTitle) => void;
  deleteAssociatedTitle: (pk: string) => void;

  upsertScannerTemplate: (template: ScannerTemplate) => void;
  deleteScannerTemplate: (pk: string) => void;

  upsertPolicy: (policy: Policy) => void;
  deletePolicy: (pk: string) => void;
  /** Fold `sourcePks` into `targetPk`, moving their recorded premiums across. */
  mergePoliciesInto: (targetPk: string, sourcePks: string[]) => void;

  /** Wholesale replace — used by CSV/JSON import and by "reset". */
  replaceDatabase: (next: BudgetDatabase) => void;
  resetDatabase: () => void;
  exportDatabase: () => BudgetDatabase;
}

const BudgetStoreContext = createContext<StoreApi<BudgetStore> | null>(null);

export function BudgetProvider({ children }: { children: React.ReactNode }) {
  const { user, authEnabled } = useSession();
  const [data, setData] = useState<BudgetDatabase>(emptyDatabase);
  const [settings, setSettings] = useState<BudgetSettings>(DEFAULT_BUDGET_SETTINGS);
  const [loading, setLoading] = useState(true);
  const hydrated = useRef(false);

  /**
   * Where this account's budget lives: its own Drive, this project's database,
   * or nowhere but the browser. See `@/lib/store/backend`.
   */
  const backend = backendFor(user, authEnabled);
  const isLocal = backend === "local";

  // ---- remote write ------------------------------------------------------
  /**
   * The `revision` this device believes the server row is at, or `null` when it
   * has not seen a row for this user. Every write is conditional on it, so a
   * device that has fallen behind fails to match instead of overwriting.
   */
  const revisionRef = useRef<number | null>(null);
  const pendingRef = useRef<{ data: BudgetDatabase; settings: BudgetSettings } | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushRemote = useCallback(
    async (initialData: BudgetDatabase, nextSettings: BudgetSettings): Promise<void> => {
      // `local` covers both the signed-out case and a Google account whose Drive
      // is unavailable. Neither has anywhere to push to, and for the second that
      // is the intended outcome rather than a degradation to paper over: this
      // deployment's database is not a fallback for those users.
      if (backend === "local") return;

      const supabase = getSupabaseBrowserClient();

      // Iterative rather than self-recursive. A `useCallback` that calls its own
      // binding reads that binding from the render it was created in, which ties
      // the retry chain to a closure that may already be stale — and reads as a
      // hazard even where it happens to work. A loop has neither problem.
      let nextData = initialData;

      for (let attempt = 0; attempt <= MAX_SYNC_ATTEMPTS; attempt++) {
        const result = await writeBudget(
          backend,
          user,
          supabase,
          nextData,
          nextSettings,
          revisionRef.current,
        );

        if (result === null) return;
        if (result !== "conflict") {
          revisionRef.current = result.revision;
          return;
        }

        // Someone else wrote since this device last read. Merge their copy in
        // and try again rather than choosing a winner.
        const remote = await readBudget(backend, user, supabase);
        if (remote === UNREACHABLE) return;

        // Remote payloads need the same schema repair as local ones — without
        // this, migrations only ever reached signed-out users.
        const remoteData = migrate({ ...emptyDatabase(), ...(remote.payload ?? {}) });
        nextData = mergeDatabases(nextData, remoteData);

        revisionRef.current = remote.revision;
        // The merge is now what this device holds, so state and localStorage
        // move with it — otherwise the next edit would be computed against a
        // document the server has already superseded, reopening this conflict.
        setData(nextData);
        writeLocal(nextData, nextSettings);
      }

      console.warn("[budget] gave up reconciling after", MAX_SYNC_ATTEMPTS, "attempts");
    },
    [user, backend],
  );

  /**
   * Coalesce remote writes.
   *
   * Every keystroke in an amount field is a `mutate`, and each one would
   * otherwise be a round trip carrying the entire document. localStorage still
   * takes the write synchronously, so nothing is at risk in the gap.
   */
  const queueRemoteWrite = useCallback(
    (nextData: BudgetDatabase, nextSettings: BudgetSettings) => {
      pendingRef.current = { data: nextData, settings: nextSettings };
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending) void pushRemote(pending.data, pending.settings);
      }, REMOTE_WRITE_DEBOUNCE_MS);
    },
    [pushRemote],
  );

  // A tab closed or backgrounded mid-debounce would drop the last edit from the
  // server copy — it would survive locally and resurface as a conflict later.
  // `pagehide` rather than `unload`, which is unreliable on mobile Safari.
  useEffect(() => {
    if (typeof window === "undefined") return;

    function flush() {
      if (!flushTimerRef.current) return;
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) void pushRemote(pending.data, pending.settings);
    }

    function onHidden() {
      if (document.visibilityState === "hidden") flush();
    }

    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHidden);
      flush();
    };
  }, [pushRemote]);

  // ---- hydrate -----------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const localData = readLocalData();
      const localSettings = readLocalSettings();

      if (backend === "local") {
        if (!cancelled) {
          setData(localData);
          setSettings(localSettings);
          setLoading(false);
          hydrated.current = true;
        }
        return;
      }

      const remote = await readBudget(backend, user, getSupabaseBrowserClient());

      if (cancelled) return;

      if (remote === UNREACHABLE || !remote.payload) {
        // Either nothing stored yet, or the remote could not be reached: keep
        // working locally. `revision` stays null, which tells the writer to
        // create rather than update, and to treat "it already exists" as a lost
        // race rather than something to overwrite.
        revisionRef.current = null;
        setData(localData);
        setSettings(localSettings);
      } else {
        // Remote payloads need the same schema repair as local ones — without
        // this, migrations only ever reached signed-out users.
        const remoteData = migrate({
          ...emptyDatabase(),
          ...remote.payload,
        });

        // Merge rather than adopt. Anything written on this device while it was
        // offline — or before the last sign-in — exists only in localStorage,
        // and taking the server copy wholesale is precisely how that work
        // disappears. Tombstones in both copies still retire what was deleted,
        // so this recovers unsynced edits without resurrecting deletions.
        const merged = mergeDatabases(localData, remoteData);

        revisionRef.current = remote.revision;
        setData(merged);
        // Settings carry no per-field timestamps, so there is nothing to merge
        // on: this device's copy wins. They are small, self-describing
        // preferences, and the cost of picking wrong is a toggle to flip back.
        setSettings(localSettings);

        // Anything the merge recovered exists only in this tab until it is
        // pushed. Skipped when the merge changed nothing, which is the common
        // case of opening the app on the device that wrote it last.
        if (JSON.stringify(merged) !== JSON.stringify(remoteData)) {
          queueRemoteWrite(merged, localSettings);
        }
      }
      setLoading(false);
      hydrated.current = true;
    }

    void load();
    return () => {
      cancelled = true;
    };
    // `queueRemoteWrite` is a stable ref-backed callback; re-running hydration
    // on its identity would re-fetch the document on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ---- cross-tab sync ----------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    function handleStorage(e: StorageEvent) {
      if (e.key === DATA_KEY && e.newValue) {
        try {
          setData({ ...emptyDatabase(), ...JSON.parse(e.newValue) });
        } catch {}
      }
      if (e.key === SETTINGS_KEY && e.newValue) {
        try {
          setSettings({ ...DEFAULT_BUDGET_SETTINGS, ...JSON.parse(e.newValue) });
        } catch {}
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // ---- persist -----------------------------------------------------------
  // Writes go to localStorage synchronously and to Supabase on a debounce. The
  // `hydrated` guard stops the initial empty state from clobbering stored data.
  //
  // Theme and accent are no longer budget settings — `ThemeProvider` owns them
  // for the whole app and persists them itself.
  const persist = useCallback(
    (nextData: BudgetDatabase, nextSettings: BudgetSettings) => {
      if (typeof window === "undefined") return;
      if (!hydrated.current) return;

      writeLocal(nextData, nextSettings);

      if (backend !== "local") queueRemoteWrite(nextData, nextSettings);
    },
    [backend, queueRemoteWrite],
  );

  /** Apply a change to the database and persist the result. */
  const mutate = useCallback(
    (fn: (db: BudgetDatabase) => BudgetDatabase) => {
      setData((current) => {
        const next = fn(current);
        persist(next, settings);
        return next;
      });
    },
    [persist, settings],
  );

  const updateSettings = useCallback(
    (patch: Partial<BudgetSettings>) => {
      setSettings((current) => {
        const next = { ...current, ...patch };
        setData((db) => {
          persist(db, next);
          return db;
        });
        return next;
      });
    },
    [persist],
  );

  // ---- auto-pay past-due scheduled transactions --------------------------
  // Cashew settles overdue upcoming/subscription rows on launch when the user
  // has opted in. Runs once per hydration.
  useEffect(() => {
    if (!hydrated.current || loading) return;
    if (!settings.autoPayUpcoming && !settings.autoPaySubscriptions) return;

    const outcome = autoPayDueTransactions(data.transactions, {
      autoPayUpcoming: settings.autoPayUpcoming,
      autoPaySubscriptions: settings.autoPaySubscriptions,
      newPk: newId,
    });
    if (!outcome.changed) return;

    mutate((db) => {
      const byPk = new Map(db.transactions.map((t) => [t.transactionPk, t]));
      for (const t of outcome.updated) byPk.set(t.transactionPk, t);
      for (const t of outcome.created) byPk.set(t.transactionPk, t);
      return { ...db, transactions: [...byPk.values()] };
    });
    // Intentionally keyed on load completion, not on `data`, so settling a
    // transaction cannot retrigger the sweep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // ---- generic helpers ---------------------------------------------------
  const upsert = useCallback(
    <T,>(table: TableName, pkField: keyof T, row: T) =>
      mutate((db) => {
        const list = db[table] as unknown as T[];
        const idx = list.findIndex((r) => r[pkField] === row[pkField]);
        const next = idx >= 0 ? list.map((r, i) => (i === idx ? row : r)) : [...list, row];
        return { ...db, [table]: next };
      }),
    [mutate],
  );

  /**
   * Remove a row and leave a tombstone, so a later sync deletes it remotely
   * rather than treating the absence as "not yet uploaded".
   */
  const removeWithLog = useCallback(
    <T,>(table: TableName, pkField: keyof T, pk: string, logType: DeleteLogType) =>
      mutate((db) => {
        const list = db[table] as unknown as T[];
        const log: DeleteLog = {
          deleteLogPk: newId(),
          entryPk: pk,
          type: logType,
          dateTimeModified: new Date().toISOString(),
        };
        return {
          ...db,
          [table]: list.filter((r) => r[pkField] !== pk),
          deleteLogs: [...db.deleteLogs, log],
        };
      }),
    [mutate],
  );

  // ---- transactions ------------------------------------------------------
  const upsertTransaction = useCallback(
    (t: Transaction) =>
      upsert<Transaction>("transactions", "transactionPk", {
        ...t,
        dateTimeModified: new Date().toISOString(),
      }),
    [upsert],
  );

  const upsertTransactions = useCallback(
    (rows: Transaction[]) =>
      mutate((db) => {
        const byPk = new Map(db.transactions.map((t) => [t.transactionPk, t]));
        for (const t of rows) byPk.set(t.transactionPk, t);
        return { ...db, transactions: [...byPk.values()] };
      }),
    [mutate],
  );

  const deleteTransaction = useCallback(
    (pk: string, opts: { includePaired?: boolean } = {}) =>
      mutate((db) => {
        const target = db.transactions.find((t) => t.transactionPk === pk);
        // A balance transfer is two rows; deleting both is the usual intent.
        const alsoDelete =
          opts.includePaired && target?.pairedTransactionFk ? [target.pairedTransactionFk] : [];
        const removing = new Set([pk, ...alsoDelete]);

        const logs: DeleteLog[] = [...removing].map((entryPk) => ({
          deleteLogPk: newId(),
          entryPk,
          type: DeleteLogType.Transaction,
          dateTimeModified: new Date().toISOString(),
        }));

        return {
          ...db,
          transactions: db.transactions.filter((t) => !removing.has(t.transactionPk)),
          deleteLogs: [...db.deleteLogs, ...logs],
        };
      }),
    [mutate],
  );

  const deleteTransactions = useCallback(
    (pks: string[]) =>
      mutate((db) => {
        const removing = new Set(pks);
        const logs: DeleteLog[] = pks.map((entryPk) => ({
          deleteLogPk: newId(),
          entryPk,
          type: DeleteLogType.Transaction,
          dateTimeModified: new Date().toISOString(),
        }));
        return {
          ...db,
          transactions: db.transactions.filter((t) => !removing.has(t.transactionPk)),
          deleteLogs: [...db.deleteLogs, ...logs],
        };
      }),
    [mutate],
  );

  // ---- categories --------------------------------------------------------
  const upsertCategory = useCallback(
    (c: TransactionCategory) =>
      upsert<TransactionCategory>("categories", "categoryPk", {
        ...c,
        dateTimeModified: new Date().toISOString(),
      }),
    [upsert],
  );

  /**
   * Delete a category, optionally re-homing its transactions.
   *
   * Without a destination the transactions are deleted too — matching Cashew's
   * warning that they are not kept. Subcategories are removed with their parent
   * rather than being left dangling.
   */
  const deleteCategory = useCallback(
    (pk: string, moveToCategoryPk?: string) =>
      mutate((db) => {
        const subPks = db.categories
          .filter((c) => c.mainCategoryPk === pk)
          .map((c) => c.categoryPk);
        const affected = new Set([pk, ...subPks]);

        const transactions = moveToCategoryPk
          ? db.transactions.map((t) =>
              affected.has(t.categoryFk)
                ? { ...t, categoryFk: moveToCategoryPk, subCategoryFk: null }
                : t,
            )
          : db.transactions.filter((t) => !affected.has(t.categoryFk));

        const logs: DeleteLog[] = [...affected].map((entryPk) => ({
          deleteLogPk: newId(),
          entryPk,
          type: DeleteLogType.TransactionCategory,
          dateTimeModified: new Date().toISOString(),
        }));

        // A policy holds a categoryFk too. Left dangling it is worse than a
        // missing one: `createPremiumTransaction` falls back with `??`, which a
        // dead pk passes straight through, so every future premium is stamped
        // with a category that cannot be resolved and renders "Uncategorised".
        const policies = db.policies.map((p) =>
          p.categoryFk && affected.has(p.categoryFk)
            ? { ...p, categoryFk: moveToCategoryPk ?? null }
            : p,
        );

        return {
          ...db,
          categories: db.categories.filter((c) => !affected.has(c.categoryPk)),
          categoryBudgetLimits: db.categoryBudgetLimits.filter((l) => !affected.has(l.categoryFk)),
          associatedTitles: db.associatedTitles.filter((t) => !affected.has(t.categoryFk)),
          policies,
          transactions,
          deleteLogs: [...db.deleteLogs, ...logs],
        };
      }),
    [mutate],
  );

  // ---- wallets -----------------------------------------------------------
  const upsertWallet = useCallback(
    (w: TransactionWallet) =>
      upsert<TransactionWallet>("wallets", "walletPk", {
        ...w,
        dateTimeModified: new Date().toISOString(),
      }),
    [upsert],
  );

  /** Delete an account; without a destination its transactions go with it. */
  const deleteWallet = useCallback(
    (pk: string, moveToWalletPk?: string) =>
      mutate((db) => {
        const transactions = moveToWalletPk
          ? db.transactions.map((t) => (t.walletFk === pk ? { ...t, walletFk: moveToWalletPk } : t))
          : db.transactions.filter((t) => t.walletFk !== pk);

        return {
          ...db,
          wallets: db.wallets.filter((w) => w.walletPk !== pk),
          transactions,
          deleteLogs: [
            ...db.deleteLogs,
            {
              deleteLogPk: newId(),
              entryPk: pk,
              type: DeleteLogType.TransactionWallet,
              dateTimeModified: new Date().toISOString(),
            },
          ],
        };
      }),
    [mutate],
  );

  // ---- budgets, objectives, limits, titles, templates ---------------------
  const upsertBudget = useCallback(
    (b: Budget) =>
      upsert<Budget>("budgets", "budgetPk", { ...b, dateTimeModified: new Date().toISOString() }),
    [upsert],
  );

  /**
   * Delete a budget. Transactions added to it are unlinked, never deleted —
   * Cashew is explicit about this in its confirmation copy.
   */
  const deleteBudget = useCallback(
    (pk: string) =>
      mutate((db) => ({
        ...db,
        budgets: db.budgets.filter((b) => b.budgetPk !== pk),
        categoryBudgetLimits: db.categoryBudgetLimits.filter((l) => l.budgetFk !== pk),
        transactions: db.transactions.map((t) =>
          t.sharedReferenceBudgetPk === pk ? { ...t, sharedReferenceBudgetPk: null } : t,
        ),
        deleteLogs: [
          ...db.deleteLogs,
          {
            deleteLogPk: newId(),
            entryPk: pk,
            type: DeleteLogType.Budget,
            dateTimeModified: new Date().toISOString(),
          },
        ],
      })),
    [mutate],
  );

  const upsertObjective = useCallback(
    (o: Objective) =>
      upsert<Objective>("objectives", "objectivePk", {
        ...o,
        dateTimeModified: new Date().toISOString(),
      }),
    [upsert],
  );

  /** Unlinks contributing transactions (and clears loan tags), keeps them. */
  const deleteObjective = useCallback(
    (pk: string) =>
      mutate((db) => {
        const objective = db.objectives.find((o) => o.objectivePk === pk);
        const isLoan = objective?.type === ObjectiveType.loan;
        return {
          ...db,
          objectives: db.objectives.filter((o) => o.objectivePk !== pk),
          transactions: db.transactions.map((t) => {
            if (isLoan && t.objectiveLoanFk === pk) return { ...t, objectiveLoanFk: null };
            if (!isLoan && t.objectiveFk === pk) return { ...t, objectiveFk: null };
            return t;
          }),
          deleteLogs: [
            ...db.deleteLogs,
            {
              deleteLogPk: newId(),
              entryPk: pk,
              type: DeleteLogType.Objective,
              dateTimeModified: new Date().toISOString(),
            },
          ],
        };
      }),
    [mutate],
  );

  const upsertCategoryLimit = useCallback(
    (l: CategoryBudgetLimit) =>
      upsert<CategoryBudgetLimit>("categoryBudgetLimits", "categoryLimitPk", {
        ...l,
        dateTimeModified: new Date().toISOString(),
      }),
    [upsert],
  );
  const deleteCategoryLimit = useCallback(
    (pk: string) =>
      removeWithLog<CategoryBudgetLimit>(
        "categoryBudgetLimits",
        "categoryLimitPk",
        pk,
        DeleteLogType.CategoryBudgetLimit,
      ),
    [removeWithLog],
  );

  const upsertAssociatedTitle = useCallback(
    (t: TransactionAssociatedTitle) =>
      upsert<TransactionAssociatedTitle>("associatedTitles", "associatedTitlePk", {
        ...t,
        dateTimeModified: new Date().toISOString(),
      }),
    [upsert],
  );
  const deleteAssociatedTitle = useCallback(
    (pk: string) =>
      removeWithLog<TransactionAssociatedTitle>(
        "associatedTitles",
        "associatedTitlePk",
        pk,
        DeleteLogType.TransactionAssociatedTitle,
      ),
    [removeWithLog],
  );

  const upsertScannerTemplate = useCallback(
    (t: ScannerTemplate) =>
      upsert<ScannerTemplate>("scannerTemplates", "scannerTemplatePk", {
        ...t,
        dateTimeModified: new Date().toISOString(),
      }),
    [upsert],
  );
  const deleteScannerTemplate = useCallback(
    (pk: string) =>
      removeWithLog<ScannerTemplate>(
        "scannerTemplates",
        "scannerTemplatePk",
        pk,
        DeleteLogType.ScannerTemplate,
      ),
    [removeWithLog],
  );

  const upsertPolicy = useCallback(
    (p: Policy) =>
      upsert<Policy>("policies", "policyPk", {
        ...p,
        dateTimeModified: new Date().toISOString(),
      }),
    [upsert],
  );

  /**
   * Fold policies into one, moving every premium recorded against them onto the
   * target. Amounts are untouched, so the combined "Paid in" equals the sum of
   * the parts.
   */
  const mergePoliciesInto = useCallback(
    (targetPk: string, sourcePks: string[]) =>
      mutate((db) => {
        const { database, removedPolicies } = mergePolicies(db, targetPk, sourcePks);
        if (removedPolicies === 0) return db;
        return {
          ...database,
          deleteLogs: [
            ...database.deleteLogs,
            ...sourcePks
              .filter((pk) => pk !== targetPk)
              .map((pk) => ({
                deleteLogPk: newId(),
                entryPk: pk,
                type: DeleteLogType.Policy,
                dateTimeModified: new Date().toISOString(),
              })),
          ],
        };
      }),
    [mutate],
  );

  /**
   * Delete a policy. Premium transactions are kept — they are real money that
   * already moved — but lose their policy tag so they stop being counted
   * towards a policy that no longer exists.
   */
  const deletePolicy = useCallback(
    (pk: string) =>
      mutate((db) => {
        const tag = `policy:${pk}`;
        return {
          ...db,
          policies: db.policies.filter((p) => p.policyPk !== pk),
          transactions: db.transactions.map((t) =>
            t.note.includes(tag) ? { ...t, note: t.note.replace(tag, "").trim() } : t,
          ),
          deleteLogs: [
            ...db.deleteLogs,
            {
              deleteLogPk: newId(),
              entryPk: pk,
              type: DeleteLogType.Policy,
              dateTimeModified: new Date().toISOString(),
            },
          ],
        };
      }),
    [mutate],
  );

  const replaceDatabase = useCallback(
    (next: BudgetDatabase) => mutate(() => ({ ...emptyDatabase(), ...next })),
    [mutate],
  );
  const resetDatabase = useCallback(() => mutate(() => seedDatabase()), [mutate]);
  const exportDatabase = useCallback(() => data, [data]);

  // Exchange rates: user overrides layered on the offline table.
  const allWallets = useMemo(
    () =>
      buildAllWallets(data.wallets, settings.primaryWalletPk, {
        ...DEFAULT_EXCHANGE_RATES,
        ...settings.exchangeRates,
      }),
    [data.wallets, settings.primaryWalletPk, settings.exchangeRates],
  );

  /**
   * Memoised, because this context feeds every budget screen.
   *
   * A fresh object literal each render makes the context value a new reference
   * every time, so all ~25 consumers re-render on any change anywhere — the
   * 1,466-line account view included. The mutators are already `useCallback`ed,
   * so the only genuinely changing inputs are the state slices below.
   */
  const value: BudgetStore = useMemo(
    () => ({
      ...data,
      loading,
      isLocal,
      settings,
      allWallets,
      updateSettings,
      upsertTransaction,
      upsertTransactions,
      deleteTransaction,
      deleteTransactions,
      upsertCategory,
      deleteCategory,
      upsertWallet,
      deleteWallet,
      upsertBudget,
      deleteBudget,
      upsertObjective,
      deleteObjective,
      upsertCategoryLimit,
      deleteCategoryLimit,
      upsertAssociatedTitle,
      deleteAssociatedTitle,
      upsertScannerTemplate,
      deleteScannerTemplate,
      upsertPolicy,
      deletePolicy,
      mergePoliciesInto,
      replaceDatabase,
      resetDatabase,
      exportDatabase,
    }),
    [
      data,
      loading,
      isLocal,
      settings,
      allWallets,
      updateSettings,
      upsertTransaction,
      upsertTransactions,
      deleteTransaction,
      deleteTransactions,
      upsertCategory,
      deleteCategory,
      upsertWallet,
      deleteWallet,
      upsertBudget,
      deleteBudget,
      upsertObjective,
      deleteObjective,
      upsertCategoryLimit,
      deleteCategoryLimit,
      upsertAssociatedTitle,
      deleteAssociatedTitle,
      upsertScannerTemplate,
      deleteScannerTemplate,
      upsertPolicy,
      deletePolicy,
      mergePoliciesInto,
      replaceDatabase,
      resetDatabase,
      exportDatabase,
    ],
  );

  // A `useState` initialiser rather than the lazy-ref idiom this replaced.
  // Both create the store exactly once, but the ref version had to be *read*
  // during render to pass the store down, which is the access React warns
  // about. This is stable by construction and needs no suppression.
  const [store] = useState(() => createStore<BudgetStore>(() => value));

  useLayoutEffect(() => {
    store.setState(value);
  }, [store, value]);

  return <BudgetStoreContext.Provider value={store}>{children}</BudgetStoreContext.Provider>;
}

export function useBudget<T = BudgetStore>(selector?: (state: BudgetStore) => T): T {
  const store = useContext(BudgetStoreContext);
  if (!store) {
    throw new Error("useBudget must be used inside <BudgetProvider>");
  }
  return useStore(store, selector ?? ((s) => s as unknown as T));
}

/** Categories indexed by pk, with subcategories grouped under their parent. */
/**
 * Accumulated policy savings, and whether they belong in net worth.
 *
 * Shared so the home screen, the accounts screen and the savings card cannot
 * disagree about a figure that appears on all three.
 */
export function usePolicySavings() {
  const { policies, transactions, allWallets, settings } = useBudget(useShallow((s) => ({ policies: s.policies, transactions: s.transactions, allWallets: s.allWallets, settings: s.settings })));

  const total = useMemo(
    () =>
      getPolicySavingsTotal(
        allWallets,
        policies,
        transactions,
        settings.savingsExcludedPolicyPks ?? [],
      ),
    [allWallets, policies, transactions, settings.savingsExcludedPolicyPks],
  );

  const included = (settings.includeSavingsInNetWorth ?? true) ? total : 0;

  return { total, netWorthContribution: included, visible: settings.showSavingsCard ?? true };
}

export function useCategoryLookup() {
  const { categories } = useBudget(useShallow((s) => ({ categories: s.categories })));
  return useMemo(() => {
    const all = [...categories];
    for (const sub of DEFAULT_INCOME_SUBCATEGORIES) {
      if (!all.some((c) => c.categoryPk === sub.categoryPk)) {
        all.push(sub);
      }
    }
    const byPk = new Map(all.map((c) => [c.categoryPk, c]));
    const main = all
      .filter((c) => c.mainCategoryPk === null)
      .sort((a, b) => a.order - b.order);
    const subsByParent = new Map<string, TransactionCategory[]>();
    for (const c of all) {
      if (c.mainCategoryPk === null) continue;
      const list = subsByParent.get(c.mainCategoryPk) ?? [];
      list.push(c);
      subsByParent.set(c.mainCategoryPk, list);
    }
    return { byPk, main, subsByParent };
  }, [categories]);
}
