/**
 * Messages shared by the on-device engine worker and its client.
 *
 * Kept in its own module so neither side imports the other: the worker pulls in
 * the whole strategy engine, and having the client import it for a type would
 * drag that into the main bundle, which is the exact cost the worker exists to
 * avoid.
 *
 * The traffic goes both ways, and that is the load-bearing part. Capacitor
 * injects its native bridge into the main window only — a Web Worker has no
 * `Capacitor` global and cannot reach a plugin at all. So the worker, which is
 * where the screening runs, cannot itself perform the HTTP that live market data
 * needs. It asks the main thread to do that instead: every bit of computation
 * stays off the UI thread, and only the network hops across, which costs nothing
 * because it was always going to be waiting on I/O.
 */

import type { Instrument, Quote } from "@/lib/market-data/types";
import type { StockAnalysis } from "@/lib/engine/analysis";
import type { RecommendationFeed } from "@/lib/engine/types";
import type { RiskTolerance, TradingStyle } from "@/lib/strategies/types";

/** What the client asks the engine to do. */
export type EngineRequest =
  | { id: number; op: "feed"; style: TradingStyle; tolerance: RiskTolerance; force: boolean }
  | { id: number; op: "analyse"; ticker: string; tolerance: RiskTolerance }
  | { id: number; op: "quotes"; tickers: string[] }
  | { id: number; op: "instruments"; tickers: string[] }
  | { id: number; op: "listInstruments" }
  | { id: number; op: "isLive" }
  | { id: number; op: "invalidate" };

export interface EngineResultMap {
  feed: RecommendationFeed;
  analyse: StockAnalysis | null;
  quotes: Quote[];
  instruments: Record<string, Instrument>;
  listInstruments: Instrument[];
  isLive: boolean;
  invalidate: null;
}

/** A request reduced to what survives `postMessage`. */
export interface SerialisedRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface SerialisedResponse {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** main thread → worker */
export type ToWorker =
  | { kind: "request"; request: EngineRequest }
  /** Answer to the worker's "am I native?" question. */
  | { kind: "platform"; id: number; isNative: boolean }
  /** Answer to one of the worker's fetch requests. */
  | { kind: "fetch"; id: number; response?: SerialisedResponse; error?: string };

/** worker → main thread */
export type FromWorker =
  | { kind: "result"; id: number; ok: true; result: unknown }
  | { kind: "result"; id: number; ok: false; error: string }
  /** "Am I running inside the native shell?" — only the main thread can tell. */
  | { kind: "platform"; id: number }
  /** "Perform this request for me, where the native bridge exists." */
  | { kind: "fetch"; id: number; request: SerialisedRequest };
