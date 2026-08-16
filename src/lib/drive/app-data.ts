/**
 * JSON documents in the user's hidden Drive app folder.
 *
 * `appDataFolder` is a per-app, per-user folder that does not appear in the
 * Drive UI. It counts against the user's own quota, is covered by their own
 * account security, and is deleted wholesale when they disconnect the app from
 * their Google settings — at which point this deployment has no copy, because
 * it never had one. That is the entire point of routing storage here.
 *
 * Every request goes browser → Google directly. Nothing in this module runs on
 * a server, and no route in this app proxies it.
 */

import { getDriveToken } from "./token";

const FILES = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

/**
 * One file per domain, rather than one document for everything.
 *
 * The budget store is orders of magnitude larger than a watchlist and changes
 * on a different rhythm. Sharing a file would mean rewriting the whole budget
 * to star a ticker, and — worse — would put two unrelated edit streams in
 * contention for the same document.
 */
/*
 * There is deliberately no `preferences.json`. Risk tolerance and feed layout
 * live in localStorage and a cookie, because the server reads them during SSR —
 * they have never been in Supabase for any user, so there is nothing to move.
 */
export const DOCS = {
  budget: "budget.json",
  watchlist: "watchlist.json",
  portfolio: "portfolio.json",
} as const;

export type DocName = (typeof DOCS)[keyof typeof DOCS];

/**
 * A document as it was found in Drive.
 *
 * `version` is Drive's own monotonic counter for the file. It is carried back
 * into the next write so a device can tell whether it is overwriting the copy
 * it actually read — see `writeDoc`.
 */
export interface DriveDoc<T> {
  data: T | null;
  fileId: string | null;
  version: number | null;
}

/** Result of a write, or null when Drive was unreachable and nothing happened. */
export interface DriveWriteResult {
  fileId: string;
  version: number | null;
}

/**
 * Bearer headers, or null when no token is available.
 *
 * Always the silent path. Nothing in this module is reached from a click, so
 * asking for consent here could only ever produce a popup the browser blocks —
 * granting access is the settings screen's job, and it has the user gesture to
 * do it with.
 */
async function authHeaders(): Promise<HeadersInit | null> {
  const token = await getDriveToken();
  return token ? { Authorization: `Bearer ${token}` } : null;
}

/** Locate a document by name, or null when this user has never written one. */
async function findFile(
  name: DocName,
  headers: HeadersInit,
): Promise<{ id: string; version: number | null } | null> {
  const params = new URLSearchParams({
    spaces: "appDataFolder",
    // Names are fixed constants above, so there is nothing here to escape.
    q: `name = '${name}' and trashed = false`,
    fields: "files(id,version)",
    pageSize: "1",
  });

  const response = await fetch(`${FILES}?${params}`, { headers });
  if (!response.ok) throw new Error(`Drive list failed: ${response.status}`);

  const body = (await response.json()) as { files?: { id: string; version?: string }[] };
  const file = body.files?.[0];
  if (!file) return null;

  // Drive returns `version` as a string — it is an int64, which does not
  // survive JSON's number type intact.
  return { id: file.id, version: file.version ? Number(file.version) : null };
}

/**
 * Read one document.
 *
 * A missing file and an unreachable Drive are deliberately distinguished by the
 * caller through `fileId`: the first is a new user with nothing synced yet,
 * where local data should be uploaded; the second must leave local data alone.
 * Conflating them would have a network blip look like a fresh account and
 * publish an empty document over real data.
 */
export async function readDoc<T>(name: DocName): Promise<DriveDoc<T> | null> {
  const headers = await authHeaders();
  if (!headers) return null;

  try {
    const file = await findFile(name, headers);
    if (!file) return { data: null, fileId: null, version: null };

    const response = await fetch(`${FILES}/${file.id}?alt=media`, { headers });
    if (!response.ok) throw new Error(`Drive read failed: ${response.status}`);

    return { data: (await response.json()) as T, fileId: file.id, version: file.version };
  } catch (error) {
    console.warn("[drive] read failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * What the caller believes Drive currently holds.
 *
 * `"absent"` is not the same as version-unknown, and conflating them loses
 * data: a device that has never seen a document must not blindly overwrite one
 * that another device created in the meantime. It is the direct equivalent of
 * inserting a row and letting the duplicate-key error surface, rather than
 * upserting over whoever won the race.
 */
export type ExpectedVersion = number | "absent" | "any";

/**
 * Write one document, creating it on first use.
 *
 * Drive has no conditional write — no `If-Match`, no compare-and-swap — so a
 * lost update cannot be prevented at this layer. It can be *detected*:
 * `expected` is compared against what Drive currently holds, and a mismatch is
 * reported rather than steamrolled, leaving the caller to merge and try again.
 * For the budget that is `mergeDatabases`, which is convergent, so a conflict
 * costs a round trip rather than an edit.
 *
 * The check is not atomic — another device can write in the window between the
 * lookup and the upload. That window is milliseconds against a debounce
 * measured in seconds, and the merge on the next read repairs it. Drive offers
 * nothing stronger; a design needing true serialisability could not use it.
 */
export async function writeDoc<T>(
  name: DocName,
  data: T,
  expected: ExpectedVersion = "any",
): Promise<DriveWriteResult | "conflict" | null> {
  const headers = await authHeaders();
  if (!headers) return null;

  try {
    const existing = await findFile(name, headers);

    if (expected === "absent" && existing) return "conflict";
    if (typeof expected === "number" && (!existing || existing.version !== expected)) {
      return "conflict";
    }

    const body = JSON.stringify(data);

    if (!existing) {
      // Multipart: metadata and content in one request. A create followed by a
      // separate content upload would leave an empty file behind if the second
      // half failed, and an empty file reads as "synced, and you had nothing".
      const boundary = `wsx${crypto.randomUUID().replace(/-/g, "")}`;
      const payload =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify({ name, parents: ["appDataFolder"] })}\r\n` +
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${body}\r\n--${boundary}--`;

      const response = await fetch(`${UPLOAD}?uploadType=multipart&fields=id,version`, {
        method: "POST",
        headers: { ...headers, "Content-Type": `multipart/related; boundary=${boundary}` },
        body: payload,
      });
      if (!response.ok) throw new Error(`Drive create failed: ${response.status}`);

      const created = (await response.json()) as { id: string; version?: string };
      return { fileId: created.id, version: created.version ? Number(created.version) : null };
    }

    const response = await fetch(
      `${UPLOAD}/${existing.id}?uploadType=media&fields=id,version`,
      {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body,
      },
    );
    if (!response.ok) throw new Error(`Drive write failed: ${response.status}`);

    const updated = (await response.json()) as { id: string; version?: string };
    return { fileId: updated.id, version: updated.version ? Number(updated.version) : null };
  } catch (error) {
    console.warn("[drive] write failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Whether Drive will actually serve this user right now.
 *
 * Deliberately a real request rather than a token check. Minting a token only
 * proves the user consented; it says nothing about whether the Drive API is
 * enabled on the Cloud project, which is a separate switch and the one most
 * often left off. Checking the cheaper thing would let the settings screen
 * announce "stored in your Google Drive" while every write 403s — a false
 * reassurance about where someone's financial data is, which is worse than
 * saying nothing.
 */
export async function probeDrive(): Promise<boolean> {
  const headers = await authHeaders();
  if (!headers) return false;

  try {
    // Ask for nothing in particular — the point is the status code.
    const params = new URLSearchParams({ spaces: "appDataFolder", pageSize: "1", fields: "files(id)" });
    const response = await fetch(`${FILES}?${params}`, { headers });
    if (!response.ok) {
      console.warn("[drive] unavailable:", response.status, await response.text().catch(() => ""));
    }
    return response.ok;
  } catch (error) {
    console.warn("[drive] probe failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Delete every document this app has written.
 *
 * Offered from settings so "stop syncing to my Drive" is something the user can
 * do here, rather than a hunt through Google's account settings. It is not the
 * only way — disconnecting the app in Google removes the folder too — but it is
 * the one they will look for first.
 */
export async function deleteAllDocs(): Promise<boolean> {
  // Silent is enough: deleting is only offered once Drive is connected, so a
  // token already exists.
  const headers = await authHeaders();
  if (!headers) return false;

  try {
    for (const name of Object.values(DOCS)) {
      const file = await findFile(name, headers);
      if (!file) continue;
      await fetch(`${FILES}/${file.id}`, { method: "DELETE", headers });
    }
    return true;
  } catch (error) {
    console.warn("[drive] delete failed:", error instanceof Error ? error.message : error);
    return false;
  }
}
