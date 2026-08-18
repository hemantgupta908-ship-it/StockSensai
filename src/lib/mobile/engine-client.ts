/**
 * Main-thread client for the on-device engine worker.
 *
 * Two responsibilities. It sends requests and resolves their answers, and it
 * *serves* the worker: Capacitor's bridge exists only on this thread, so when the
 * worker needs an HTTP request performed — which is how live market data gets in
 * — it asks here, and this module makes the native call on its behalf.
 *
 * Falls back to running the engine inline when a worker cannot be constructed:
 * an old WebView, a restrictive CSP, a bundler that did not emit the chunk. That
 * blocks the UI while it screens, which is bad, but it is the difference between
 * a slow feed and no feed at all.
 */

import type {
  EngineRequest,
  EngineResultMap,
  FromWorker,
  SerialisedRequest,
  ToWorker,
} from "./engine-protocol";
import { isNativePlatform, marketDataFetch } from "./native-http";

type Op = EngineRequest["op"];
type Payload<K extends Op> = Omit<Extract<EngineRequest, { op: K }>, "id" | "op">;

let worker: Worker | null = null;
/** Set once construction has failed, so we stop retrying on every call. */
let workerUnavailable = false;

let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

/** Perform a request the worker asked for, and hand the result back to it. */
async function serveFetch(active: Worker, id: number, request: SerialisedRequest) {
  try {
    const response = await marketDataFetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });

    // Only the headers the market-data providers actually read are carried
    // across: `postMessage` cannot clone a `Headers`, and the full set is not
    // enumerable through the minimal shape `marketDataFetch` returns.
    const headers: Record<string, string> = {};
    for (const name of ["content-type", "set-cookie"]) {
      const value = response.headers.get(name);
      if (value) headers[name] = value;
    }

    const message: ToWorker = {
      kind: "fetch",
      id,
      response: {
        ok: response.ok,
        status: response.status,
        headers,
        body: await response.text(),
      },
    };
    active.postMessage(message);
  } catch (error) {
    const message: ToWorker = {
      kind: "fetch",
      id,
      error: error instanceof Error ? error.message : String(error),
    };
    active.postMessage(message);
  }
}

function getWorker(): Worker | null {
  if (worker || workerUnavailable) return worker;

  try {
    // `new URL(..., import.meta.url)` is the form webpack recognises to emit a
    // separate worker chunk. It must be written inline — hoisting the URL into
    // a variable defeats the static analysis and the chunk is never emitted.
    const active = new Worker(new URL("./engine.worker.ts", import.meta.url));
    worker = active;

    active.addEventListener("message", (event: MessageEvent<FromWorker>) => {
      const message = event.data;

      if (message.kind === "platform") {
        // Only this thread can answer — the worker has no Capacitor global.
        const reply: ToWorker = {
          kind: "platform",
          id: message.id,
          isNative: isNativePlatform(),
        };
        active.postMessage(reply);
        return;
      }

      if (message.kind === "fetch") {
        void serveFetch(active, message.id, message.request);
        return;
      }

      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.ok) entry.resolve(message.result);
      else entry.reject(new Error(message.error));
    });

    active.addEventListener("error", (event) => {
      // A worker that has errored at the top level will never answer, so fail
      // everything waiting on it rather than leaving those promises hanging.
      const error = new Error(event.message || "engine worker crashed");
      for (const [, entry] of pending) entry.reject(error);
      pending.clear();
      active.terminate();
      worker = null;
      workerUnavailable = true;
    });
  } catch {
    workerUnavailable = true;
    worker = null;
  }

  return worker;
}

/** Run the request on the main thread. Slow, and only used when there is no worker. */
async function runInline(request: EngineRequest): Promise<unknown> {
  const engine = await import("./device-engine");
  // Inline, the network is directly reachable — no proxy needed.
  engine.configureDevicePlatform({ fetch: marketDataFetch, isNative: isNativePlatform() });

  switch (request.op) {
    case "feed":
      return engine.deviceFeed(request.style, request.tolerance, { force: request.force });
    case "analyse":
      return engine.deviceAnalyseStock(request.ticker, request.tolerance);
    case "quotes":
      return engine.deviceQuotes(request.tickers);
    case "instruments":
      return engine.deviceInstruments(request.tickers);
    case "listInstruments":
      return engine.deviceListInstruments();
    case "isLive":
      return engine.deviceIsLive();
    case "invalidate":
      engine.invalidateDeviceCaches();
      return null;
  }
}

export function callEngine<K extends Op>(
  op: K,
  payload: Payload<K> = {} as Payload<K>,
): Promise<EngineResultMap[K]> {
  const id = nextId++;
  const request = { id, op, ...payload } as EngineRequest;

  const active = getWorker();
  if (!active) return runInline(request) as Promise<EngineResultMap[K]>;

  return new Promise<EngineResultMap[K]>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    const message: ToWorker = { kind: "request", request };
    active.postMessage(message);
  });
}
