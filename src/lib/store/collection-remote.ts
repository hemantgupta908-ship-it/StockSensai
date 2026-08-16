/**
 * Watchlist and portfolio, stored in a Google account's own Drive.
 *
 * These two are collections rather than a single evolving document, and they
 * are stored the plainest way that works: the whole array as one JSON file,
 * rewritten on every change. Both are small — tens of entries, not thousands —
 * and both change at human speed, so the alternative (per-entry files, or a
 * change log) would buy nothing but complexity.
 *
 * Drive is authoritative whenever it is reachable, and the browser copy is a
 * read cache for when it is not. That is deliberately the *same* contract the
 * Supabase-backed path already has, where a failed write rolls the UI back
 * rather than queuing: an edit made with no connection does not survive a
 * reload. Doing better needs per-row tombstones, which the budget document has
 * and these do not — and inventing a half-version here would resurrect deleted
 * entries, which is a worse failure than losing an offline add.
 */

import { readDoc, writeDoc, type DocName } from "@/lib/drive/app-data";

/**
 * The contents of a collection document.
 *
 * Wrapped in an object rather than stored as a bare array so the file can grow
 * a field later — a schema version, a last-synced stamp — without every
 * existing file becoming unreadable.
 */
interface CollectionFile<T> {
  items: T[];
}

/**
 * Read a collection.
 *
 * Three outcomes, and callers must distinguish all three:
 * - `null`      — Drive unreachable. Show the cached copy, change nothing.
 * - `"empty"`   — reached Drive, no document yet. A new account: upload local.
 * - `T[]`       — the stored collection, authoritative.
 */
export async function readCollection<T>(doc: DocName): Promise<T[] | "empty" | null> {
  const result = await readDoc<CollectionFile<T>>(doc);
  if (!result) return null;
  if (!result.data) return "empty";
  return result.data.items ?? [];
}

/**
 * Replace a collection. Returns false when the write did not land, which the
 * caller uses to roll the optimistic UI update back.
 *
 * No version check: for a whole-array rewrite there is nothing useful to do
 * with a conflict, since neither copy can be merged without per-entry
 * timestamps. Last writer wins, which for a single person on two devices means
 * the device they are actually using.
 */
export async function writeCollection<T>(doc: DocName, items: T[]): Promise<boolean> {
  const result = await writeDoc<CollectionFile<T>>(doc, { items }, "any");
  return result !== null && result !== "conflict";
}
