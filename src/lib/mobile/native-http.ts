/**
 * A `fetch` that is not subject to CORS.
 *
 * This is what lets the Android app read live market data with no server of its
 * own. Yahoo's endpoints send no `Access-Control-Allow-Origin`, so a request
 * from the WebView's `https://localhost` origin is blocked by the browser
 * before it is even sent — which is the entire reason market data used to go
 * through this app's own API routes. Capacitor's `CapacitorHttp` performs the
 * request in native code instead, where the same-origin policy does not apply.
 *
 * Two details make it usable as a drop-in:
 *
 *  - **Cookies.** Yahoo requires a session cookie plus a matching crumb before
 *    it will answer the summary endpoint. Native requests go through Android's
 *    `CookieManager`, which persists and re-sends them across calls exactly as
 *    a browser would, so the provider's existing handshake works unchanged.
 *  - **Headers.** A WebView cannot set `User-Agent` or `Cookie` on a `fetch`;
 *    they are forbidden header names. Native code can, and the provider depends
 *    on sending a desktop `User-Agent`.
 *
 * Off native — the web app, or a browser running the exported bundle — this
 * hands straight back to the platform `fetch`, so there is one code path.
 */

/** Response shape the market-data providers actually use. */
type MinimalResponse = Pick<Response, "ok" | "status" | "statusText" | "json" | "text"> & {
  headers: Pick<Headers, "get"> & {
    /**
     * Every `Set-Cookie` on the response.
     *
     * The Yahoo provider reads these to build its session jar. Native responses
     * arrive with headers flattened into one object, so multiple cookies are
     * joined into a single value and have to be split apart again — see
     * `splitSetCookie`.
     */
    getSetCookie?: () => string[];
  };
};

export type FetchLike = (url: string, init?: RequestInit) => Promise<MinimalResponse>;

let nativeChecked = false;
let isNative = false;

/** Whether this is running inside the Capacitor shell. */
export function isNativePlatform(): boolean {
  if (nativeChecked) return isNative;
  nativeChecked = true;
  try {
    // Read off the injected global rather than importing `@capacitor/core`, so
    // the web bundle does not pull the runtime in just to answer "no".
    const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    isNative = cap?.isNativePlatform?.() === true;
  } catch {
    isNative = false;
  }
  return isNative;
}

/**
 * Split a joined `Set-Cookie` header back into individual cookies.
 *
 * Commas appear *inside* cookies too (in `Expires`), so splitting on every
 * comma corrupts the jar. This splits only where a comma is followed by
 * something shaped like the start of a new cookie — `name=`.
 */
function splitSetCookie(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(/,(?=\s*[^;,=\s]+\s*=)/).map((part) => part.trim()).filter(Boolean);
}

function headerValue(headers: Record<string, string>, name: string): string | null {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return null;
}

/**
 * Perform one request natively and present it as a `Response`.
 *
 * `CapacitorHttp` parses JSON bodies itself when the content type says so, so
 * `data` arrives as an object in that case and a string otherwise. Both are
 * normalised below rather than left for each caller to sniff.
 */
async function nativeFetch(url: string, init?: RequestInit): Promise<MinimalResponse> {
  const { CapacitorHttp } = await import("@capacitor/core");

  const headers: Record<string, string> = {};
  if (init?.headers) {
    for (const [key, value] of Object.entries(init.headers as Record<string, string>)) {
      headers[key] = value;
    }
  }

  const response = await CapacitorHttp.request({
    url,
    method: (init?.method ?? "GET") as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    headers,
    data: init?.body as unknown,
    // Yahoo answers 404 on the cookie-seeding URL *and* sets the cookie we
    // need, so a non-2xx must be returned rather than thrown.
    readTimeout: 20_000,
    connectTimeout: 20_000,
  });

  const responseHeaders = (response.headers ?? {}) as Record<string, string>;
  const raw = response.data;

  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    statusText: "",
    headers: {
      get: (name: string) => headerValue(responseHeaders, name),
      getSetCookie: () => splitSetCookie(headerValue(responseHeaders, "set-cookie")),
    },
    async json() {
      // Already parsed when the response was JSON; parse defensively otherwise
      // so a text/plain body carrying JSON still works.
      if (typeof raw === "string") return JSON.parse(raw);
      return raw;
    },
    async text() {
      return typeof raw === "string" ? raw : JSON.stringify(raw);
    },
  };
}

/**
 * The fetch to use for outbound market-data requests.
 *
 * Native when available, the platform's own otherwise.
 */
export const marketDataFetch: FetchLike = (url, init) =>
  isNativePlatform() ? nativeFetch(url, init) : fetch(url, init);
