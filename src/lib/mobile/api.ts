/**
 * The single entry point for calling this app's API.
 *
 * On the web it is `fetch` with the path untouched — same relative URL, same
 * cookies, same behaviour the app has always had. In the Android build there is
 * no server behind the WebView's origin, so the call is routed to a configured
 * deployment or served on-device.
 *
 * Every client call site goes through here rather than calling `fetch("/api/…")`
 * directly. That is the whole reason the mobile build needs no forked
 * components: the call sites keep their `Response`, their `res.ok` check and
 * their error handling, and never learn which side answered.
 */

import { IS_MOBILE, getApiBase, hasRemote } from "./config";

/**
 * How long a remote call may hang before the device takes over.
 *
 * A phone that has "connectivity" but no working route — captive portal, a
 * train tunnel, a dead deployment — will otherwise leave the fetch pending
 * until the platform's own timeout, which is far longer than anyone will wait
 * while looking at a spinner. Screening locally takes seconds, so falling back
 * early is nearly always the faster answer.
 */
const REMOTE_TIMEOUT_MS = 8000;

/**
 * The signed-in user's access token, if there is one.
 *
 * The deployment's session cookie is unreachable from `https://localhost` — it
 * is cross-site and simply not sent — so the session travels as a bearer token
 * instead. The middleware validates it against Supabase exactly as it validates
 * the cookie; see `@/lib/auth/mobile-origin`.
 *
 * Absent in demo mode, where there is no account and the endpoints being called
 * carry no account data anyway.
 */
async function authHeader(): Promise<Record<string, string>> {
  try {
    const { getSupabaseBrowserClient } = await import("@/lib/supabase/client");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return {};

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function fetchRemote(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);

  try {
    return await fetch(`${getApiBase()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { ...(init?.headers as Record<string, string> | undefined), ...(await authHeader()) },
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!IS_MOBILE) return fetch(path, init);

  const { handleDeviceRequest } = await import("./device-api");

  if (hasRemote()) {
    try {
      const response = await fetchRemote(path, init);
      // Fall through on anything that means "this deployment cannot answer":
      // 5xx (up but broken) and 401/403 (it will not serve us — no session, or
      // this origin is not on its allow-list). Demo data beats an error screen
      // in all three cases. Every other 4xx is a real answer about a real
      // request — a bad ticker, an unknown style — and is returned as-is.
      const unusable = response.status >= 500 || response.status === 401 || response.status === 403;
      if (!unusable) return response;
    } catch {
      // Offline, aborted, DNS failure — fall through to the device.
    }
  }

  const local = await handleDeviceRequest(path);
  if (local) return local;

  return new Response(JSON.stringify({ error: "Not available offline" }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}
