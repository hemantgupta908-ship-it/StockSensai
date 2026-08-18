/// <reference lib="webworker" />

/**
 * Worker entry for the on-device strategy engine.
 *
 * Screening the 204-name universe means fetching or generating ~500 bars per
 * instrument and running five strategies of indicator maths over each. On the
 * main thread that is a multi-second freeze on first load — no scrolling, no tab
 * switch, no spinner animation — which is precisely the failure a phone makes
 * unforgivable. Everything expensive therefore runs here, and the UI thread only
 * ever waits on a message.
 *
 * What it cannot do here is reach the network for live data. Capacitor injects
 * its bridge into the main window only, so there is no `Capacitor` global in a
 * worker and `CapacitorHttp` is unreachable — and a plain `fetch` to Yahoo from
 * this origin dies on CORS. So HTTP is proxied to the main thread, which has
 * both. The computation stays here; only the waiting moves.
 *
 * The module-level caches in `device-engine` live in this worker's scope, which
 * is what makes them useful: the worker outlives any single screen, so tabbing
 * between styles reuses one screened universe.
 */

import {
  configureDevicePlatform,
  deviceAnalyseStock,
  deviceFeed,
  deviceInstruments,
  deviceIsLive,
  deviceListInstruments,
  deviceQuotes,
  invalidateDeviceCaches,
} from "./device-engine";
import type {
  EngineRequest,
  FromWorker,
  SerialisedResponse,
  ToWorker,
} from "./engine-protocol";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function post(message: FromWorker) {
  ctx.postMessage(message);
}

let nextBridgeId = 1;
const pendingFetches = new Map<
  number,
  { resolve: (value: SerialisedResponse) => void; reject: (error: Error) => void }
>();
const platformResolvers = new Map<number, (isNative: boolean) => void>();

function headerGetter(headers: Record<string, string>) {
  return (name: string) => {
    const wanted = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === wanted) return value;
    }
    return null;
  };
}

/** Ask the main thread to perform one request, and present its answer as a Response. */
function proxiedFetch(url: string, init?: RequestInit) {
  const id = nextBridgeId++;

  const settled = new Promise<SerialisedResponse>((resolve, reject) => {
    pendingFetches.set(id, { resolve, reject });
    post({
      kind: "fetch",
      id,
      request: {
        url,
        method: init?.method,
        headers: init?.headers as Record<string, string> | undefined,
        body: typeof init?.body === "string" ? init.body : undefined,
      },
    });
  });

  return settled.then((response) => {
    const get = headerGetter(response.headers);
    return {
      ok: response.ok,
      status: response.status,
      statusText: "",
      headers: {
        get,
        getSetCookie: () => {
          const raw = get("set-cookie");
          if (!raw) return [];
          // Commas appear inside cookies too (in `Expires`), so split only where
          // one precedes something shaped like the start of a new cookie.
          return raw
            .split(/,(?=\s*[^;,=\s]+\s*=)/)
            .map((part) => part.trim())
            .filter(Boolean);
        },
      },
      async json() {
        return JSON.parse(response.body);
      },
      async text() {
        return response.body;
      },
    };
  });
}

/**
 * Learn whether the main thread is inside the native shell.
 *
 * Asked once, before the first request is served, because the answer decides
 * whether live market data is possible at all. Falls back to `false` on any
 * failure — seeded data is a working app; a wedged worker is not.
 */
let platformReady: Promise<void> | null = null;

function ensurePlatform(): Promise<void> {
  platformReady ??= new Promise<void>((resolve) => {
    const id = nextBridgeId++;

    platformResolvers.set(id, (isNative) => {
      configureDevicePlatform({ fetch: proxiedFetch, isNative });
      resolve();
    });
    post({ kind: "platform", id });

    setTimeout(() => {
      if (platformResolvers.delete(id)) {
        configureDevicePlatform({ fetch: proxiedFetch, isNative: false });
        resolve();
      }
    }, 5000);
  });

  return platformReady;
}

async function handle(request: EngineRequest): Promise<unknown> {
  await ensurePlatform();

  switch (request.op) {
    case "feed":
      return deviceFeed(request.style, request.tolerance, { force: request.force });
    case "analyse":
      return deviceAnalyseStock(request.ticker, request.tolerance);
    case "quotes":
      return deviceQuotes(request.tickers);
    case "instruments":
      return deviceInstruments(request.tickers);
    case "listInstruments":
      return deviceListInstruments();
    case "isLive":
      return deviceIsLive();
    case "invalidate":
      invalidateDeviceCaches();
      return null;
  }
}

ctx.addEventListener("message", (event: MessageEvent<ToWorker>) => {
  const message = event.data;

  if (message.kind === "platform") {
    platformResolvers.get(message.id)?.(message.isNative);
    platformResolvers.delete(message.id);
    return;
  }

  if (message.kind === "fetch") {
    const waiting = pendingFetches.get(message.id);
    if (!waiting) return;
    pendingFetches.delete(message.id);
    if (message.response) waiting.resolve(message.response);
    else waiting.reject(new Error(message.error ?? "proxied fetch failed"));
    return;
  }

  const request = message.request;
  void handle(request).then(
    (result) => post({ kind: "result", id: request.id, ok: true, result }),
    (error: unknown) =>
      post({
        kind: "result",
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
  );
});
