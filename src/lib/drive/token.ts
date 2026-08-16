/**
 * Access tokens for a user's own Google Drive.
 *
 * The point of this module is what it deliberately does *not* do: no token
 * reaches a server, and none is written to storage of any kind. It lives in a
 * module-level variable for the lifetime of the tab and is re-minted from
 * Google on the next load. That is what makes the claim "their data is in their
 * account, not ours" true rather than aspirational — this deployment never
 * holds a credential that could read a user's Drive, so it cannot read one
 * later, be compelled to, or leak one in a database dump.
 *
 * Why Google Identity Services rather than Supabase's `provider_token`:
 * Supabase hands back a provider token exactly once, at sign-in, and does not
 * refresh it. An hour later it is dead, and the only ways to survive that are
 * to store the refresh token somewhere (ours — the thing being avoided) or to
 * bounce the user through a full OAuth redirect every hour. GIS mints a fresh
 * one silently in an iframe against the consent the user has already given.
 */

import { googleClientId } from "@/lib/env";

/** Read and write files this app created in the user's hidden app folder. */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

const GIS_SRC = "https://accounts.google.com/gsi/client";

/**
 * Refresh this long before the token actually expires.
 *
 * A token that expires mid-flight fails the request that was carrying a user's
 * budget edit, and the retry costs a round trip through Google. A minute of
 * margin is cheap by comparison.
 */
const EXPIRY_MARGIN_MS = 60_000;

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: { type?: string; message?: string }) => void;
          }): TokenClient;
          revoke(token: string, done?: () => void): void;
        };
      };
    };
  }
}

let cached: { token: string; expiresAt: number } | null = null;
let scriptPromise: Promise<void> | null = null;
/** In-flight request, so ten simultaneous reads mint one token, not ten. */
let pending: Promise<string | null> | null = null;

/**
 * Load Google's Identity Services script.
 *
 * Injected from our own bundle rather than declared in the document head, and
 * that matters under this app's CSP: `script-src` uses `strict-dynamic`, which
 * ignores host allowlists entirely and instead trusts whatever an
 * already-trusted script injects. A `<script src>` in the markup would need a
 * nonce and would load on every page for the benefit of the few that sync.
 */
function loadGis(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("server"));
  if (window.google?.accounts?.oauth2) return Promise.resolve();

  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Let a later call try again — this is usually a flaky network or a
      // blocker, neither of which is permanent.
      scriptPromise = null;
      reject(new Error("Could not load Google Identity Services"));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

/**
 * A Drive access token for the signed-in Google account, or null.
 *
 * Null is a first-class answer, not a failure to handle later: the user may
 * have declined the Drive scope, revoked it since, or be offline. Every caller
 * treats null as "no remote this time" and leaves the browser-storage copy as
 * the record, which is the same degradation the app already has for users with
 * no account at all.
 *
 * This is the silent path only. It never shows UI, so it is safe to call from
 * anywhere — a background sync, a page load. Obtaining *consent* is a separate
 * function with a hard requirement attached; see `requestDriveConsent`.
 */
export async function getDriveToken(): Promise<string | null> {
  if (!googleClientId) return null;
  if (cached && Date.now() < cached.expiresAt - EXPIRY_MARGIN_MS) return cached.token;

  pending ??= mintSilently().finally(() => {
    pending = null;
  });

  return pending;
}

/** Record a freshly issued token. Shared by both paths. */
function cache(response: TokenResponse): string | null {
  if (!response.access_token) return null;
  cached = {
    token: response.access_token,
    // Google documents 3600s; default defensively rather than treating a
    // missing value as "expires now".
    expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
  };
  return response.access_token;
}

function mintSilently(): Promise<string | null> {
  return loadGis()
    .then(
      () =>
        new Promise<string | null>((resolve) => {
          const oauth2 = window.google?.accounts?.oauth2;
          if (!oauth2) return resolve(null);

          const client = oauth2.initTokenClient({
            client_id: googleClientId,
            scope: DRIVE_SCOPE,
            callback: (response) => {
              if (!response.access_token) {
                console.warn("[drive] token request rejected:", response.error ?? "unknown");
              }
              resolve(cache(response));
            },
            error_callback: (error) => {
              console.warn("[drive] token request failed:", error.message ?? error.type ?? "");
              resolve(null);
            },
          });

          // An empty prompt is the silent path: Google reuses the existing
          // grant and shows nothing, failing instead of prompting when consent
          // is missing. That is the correct trade for a background sync.
          client.requestAccessToken({ prompt: "" });
        }),
    )
    .catch((error: unknown) => {
      console.warn("[drive] token unavailable:", error instanceof Error ? error.message : error);
      return null;
    });
}

/* ---------------------------------------------------------------- consent --
 *
 * Asking for consent means opening a popup, and a popup is only permitted
 * while the browser still considers a user gesture "active". That window does
 * not survive an `await` on anything that touches the network, so the usual
 * shape — click, load the script, build a client, request — is blocked every
 * time, with only a console warning to show for it.
 *
 * So the work is split. Everything slow happens on mount, and the click itself
 * does nothing but call `requestAccessToken` synchronously.
 */

/** Built ahead of the click by `prepareDriveConsent`. */
let consentClient: TokenClient | null = null;
/** Resolver for the request in flight; the client's callback is fixed at init. */
let consentResolve: ((token: string | null) => void) | null = null;

/**
 * Get everything ready so a later click can open a popup.
 *
 * Call this when a screen knows a connect button might be pressed — not when
 * it is pressed. Safe to call repeatedly; the work happens once.
 */
export function prepareDriveConsent(): void {
  if (!googleClientId || consentClient) return;

  void loadGis()
    .then(() => {
      const oauth2 = window.google?.accounts?.oauth2;
      if (!oauth2 || consentClient) return;

      const settle = (token: string | null) => {
        const resolve = consentResolve;
        consentResolve = null;
        resolve?.(token);
      };

      consentClient = oauth2.initTokenClient({
        client_id: googleClientId,
        scope: DRIVE_SCOPE,
        callback: (response) => {
          if (!response.access_token) {
            console.warn("[drive] consent declined:", response.error ?? "unknown");
          }
          settle(cache(response));
        },
        error_callback: (error) => {
          console.warn("[drive] consent failed:", error.message ?? error.type ?? "");
          settle(null);
        },
      });
    })
    .catch(() => {
      // Best-effort. `requestDriveConsent` reports the failure to the user.
    });
}

/**
 * Ask the user to grant Drive access.
 *
 * **Must be called synchronously from a click handler** — no `await` before it,
 * or the popup is blocked. Returns null if the client was not prepared in time,
 * which is a real possibility on a slow connection and reads to the user as
 * "that didn't work, try again" rather than anything worse.
 */
export function requestDriveConsent(): Promise<string | null> {
  if (!consentClient) {
    // Nothing to request against yet. Start preparing so the next click works.
    prepareDriveConsent();
    return Promise.resolve(null);
  }

  return new Promise<string | null>((resolve) => {
    consentResolve = resolve;
    consentClient!.requestAccessToken();
  });
}

/**
 * Drop the cached token.
 *
 * Called on sign-out. Without it the token outlives the session in memory, and
 * signing into a second account in the same tab would write the first
 * account's Drive.
 */
export function clearDriveToken(): void {
  cached = null;
  // The consent client is bound to a client ID, not an account, so it stays —
  // but any request it still owns must not resolve into the next session.
  consentResolve = null;
}
