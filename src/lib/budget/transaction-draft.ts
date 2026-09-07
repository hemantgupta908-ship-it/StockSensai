/**
 * The half-filled "add transaction" form, kept across unmounts.
 *
 * The form lives in component state inside a sheet rendered by whichever page
 * opened it, so anything that unmounts that page took a half-typed entry with
 * it: following a link, Android's hardware back button (which is wired to
 * `router.back()`, not to closing the sheet), or the WebView being evicted
 * while the app sits in the background. Mirroring the fields into
 * `localStorage` on every change makes the entry survive all three, and the
 * next time the same sheet opens it is restored.
 *
 * Only *new* transactions are drafted. An edit already has a stored row behind
 * it, and replaying a stale edit over a transaction that changed in the
 * meantime would lose data rather than save it.
 */

/**
 * The persisted fields, and the type each one is stored as.
 *
 * Everything is a form value rather than a `Transaction`: the draft has to hold
 * text that is not yet a valid transaction — "12.50+" mid-expression, an empty
 * amount, a date being typed — which is exactly what a parsed row cannot.
 */
const FIELDS = {
  tab: "string",
  amount: "string",
  name: "string",
  note: "string",
  categoryFk: "string",
  subCategoryFk: "string",
  walletFk: "string",
  date: "string",
  specialType: "string",
  reoccurrence: "string",
  periodLength: "string",
  endDate: "string",
  paid: "boolean",
  objectiveFk: "string",
  objectiveLoanFk: "string",
  budgetFk: "string",
  toWalletFk: "string",
  transferFee: "string",
} as const;

export type TransactionDraft = {
  [K in keyof typeof FIELDS]: (typeof FIELDS)[K] extends "boolean" ? boolean : string;
};

const DRAFT_KEY = "cashew.transaction-draft";

/**
 * How long a draft is worth restoring.
 *
 * An entry abandoned a day ago is no longer "in progress"; restoring it would
 * put yesterday's numbers in front of someone starting something new, which is
 * a worse failure than asking them to retype.
 */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

type StoredDraft = {
  /** Which sheet the draft belongs to — see `draftContextKey`. */
  context: string;
  /** Which page load wrote it — see `DOCUMENT_ID`. */
  documentId: string;
  savedAt: string;
  values: TransactionDraft;
};

/**
 * Identifies this page load, so a draft can be told from the sheet that is
 * still on screen.
 *
 * A module variable lives exactly as long as the document does. So a draft
 * carrying a *different* id was written before the app was reloaded — which on
 * Android means the system evicted it while the user was in another app, and
 * the sheet they were typing into is gone along with the rest of the page.
 * That is the one case worth re-opening the sheet by itself for; a draft
 * carrying this id belongs to a sheet the user is either looking at or
 * deliberately navigated away from.
 */
const DOCUMENT_ID = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * Identifies the sheet a draft came from, so it is never restored into another.
 *
 * The same modal is opened from a dozen places, several of which preset fields:
 * an account page pins the wallet, a goal pins the objective, the subscriptions
 * page pins the type. A draft started under one set of presets would be wrong
 * under another, so it is only offered back to a sheet opened the same way.
 */
export function draftContextKey(defaults: unknown, defaultTab: string | undefined): string {
  return `${defaultTab ?? ""}|${JSON.stringify(defaults ?? null)}`;
}

function parseValues(raw: unknown): TransactionDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, kind] of Object.entries(FIELDS)) {
    // A draft written by an older build can be missing a field or hold the
    // wrong type. Drop the whole thing rather than restore half a form.
    if (typeof source[key] !== kind) return null;
    out[key] = source[key];
  }
  return out as TransactionDraft;
}

function readStored(context: string): StoredDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<StoredDraft>;
    if (stored?.context !== context) return null;

    const savedAt = Date.parse(stored.savedAt ?? "");
    if (!Number.isFinite(savedAt) || Date.now() - savedAt > MAX_AGE_MS) return null;

    const values = parseValues(stored.values);
    if (!values) return null;

    return { context, documentId: String(stored.documentId ?? ""), savedAt: stored.savedAt!, values };
  } catch {
    return null;
  }
}

/** The stored draft for this sheet, or null if there is nothing to restore. */
export function readTransactionDraft(context: string): TransactionDraft | null {
  return readStored(context)?.values ?? null;
}

/**
 * Whether this sheet has a draft left over from a previous page load — the
 * signature of the app having been killed in the background mid-entry, and the
 * cue to put the sheet back on screen rather than wait to be re-opened.
 */
export function hasDraftFromPreviousLoad(context: string): boolean {
  const stored = readStored(context);
  return !!stored && stored.documentId !== DOCUMENT_ID;
}

/** Mirror the in-progress entry. Never throws: a full disk must not block typing. */
export function writeTransactionDraft(context: string, values: TransactionDraft): void {
  if (typeof window === "undefined") return;
  try {
    const stored: StoredDraft = {
      context,
      documentId: DOCUMENT_ID,
      savedAt: new Date().toISOString(),
      values,
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(stored));
  } catch (e) {
    console.warn("[budget] transaction draft persist failed:", e);
  }
}

export function clearTransactionDraft(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to do — a draft that cannot be cleared expires on its own.
  }
}
