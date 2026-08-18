/**
 * The app's API routes, served from inside the WebView.
 *
 * Each handler mirrors its `src/app/api/**` counterpart — same query parsing,
 * same caps, same response shape, same status codes — so a call site cannot
 * tell which side answered it. Where the server route validates input, this
 * does too: the caps exist to stop a crafted query fanning out across the
 * universe, and on-device that fan-out costs battery instead of a rate limit,
 * which is not an improvement.
 *
 * Only the three endpoints the client actually calls are implemented. The cron
 * routes have no meaning on a phone (there is no scheduler and no service-role
 * key), and `/api/health/data-source` is a curl tool for validating a live feed
 * before switching a deployment over.
 */

import { callEngine } from "./engine-client";
import { toStockDetailPayload } from "@/lib/engine/stock-detail";
import { TRADING_STYLES, type RiskTolerance, type TradingStyle } from "@/lib/strategies/types";

const TOLERANCES: RiskTolerance[] = ["conservative", "moderate", "aggressive"];

/** Cap so a crafted query can't ask the provider for the whole exchange. */
const MAX_QUOTE_TICKERS = 60;
/** Comfortably above any realistic portfolio. */
const MAX_INSTRUMENT_TICKERS = 100;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function parseTickers(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((t) => t.trim().toUpperCase())
        .filter((t) => /^[A-Z0-9&-]{1,20}$/.test(t)),
    ),
  );
}

async function recommendations(params: URLSearchParams): Promise<Response> {
  const styleParam = params.get("style") ?? "swing";
  const toleranceParam = params.get("tolerance") ?? "moderate";
  const refresh = params.get("refresh") === "1";

  if (!TRADING_STYLES.includes(styleParam as TradingStyle)) {
    return json({ error: "Invalid query parameters" }, 400);
  }
  if (!TOLERANCES.includes(toleranceParam as RiskTolerance)) {
    return json({ error: "Invalid query parameters" }, 400);
  }

  // No rate limit on the forced path. The server meters it because a refresh
  // costs *its* serverless time and the upstream feed's budget; here it costs
  // the user's own battery on their own device, and the universe cache already
  // stops a held pull-to-refresh from rescreening.
  const feed = await callEngine("feed", {
    style: styleParam as TradingStyle,
    tolerance: toleranceParam as RiskTolerance,
    force: refresh,
  });

  return json(feed);
}

async function quotes(params: URLSearchParams): Promise<Response> {
  const tickers = parseTickers(params.get("tickers") ?? "").slice(0, MAX_QUOTE_TICKERS);
  if (tickers.length === 0) return json({ quotes: [] });

  const [result, isLiveData] = await Promise.all([
    callEngine("quotes", { tickers }),
    callEngine("isLive"),
  ]);
  // Reported from the provider that actually answered, never hardcoded. This is
  // what the portfolio reads to decide whether to warn that its "Now" prices —
  // and every profit figure derived from them — are simulated, so a wrong value
  // here launders invented numbers as real ones on the one screen built to say
  // otherwise.
  return json({ quotes: result, isLiveData });
}

async function stockDetail(ticker: string, params: URLSearchParams): Promise<Response> {
  const symbol = decodeURIComponent(ticker).toUpperCase();
  if (!/^[A-Z0-9&-]{1,20}$/.test(symbol)) {
    return json({ error: "Invalid ticker" }, 400);
  }

  const toleranceParam = params.get("tolerance") ?? "moderate";
  const tolerance = TOLERANCES.includes(toleranceParam as RiskTolerance)
    ? (toleranceParam as RiskTolerance)
    : "moderate";

  const analysis = await callEngine("analyse", { ticker: symbol, tolerance });
  if (!analysis) return json({ error: "Stock not found" }, 404);

  return json(toStockDetailPayload(analysis));
}

async function instruments(params: URLSearchParams): Promise<Response> {
  const raw = params.get("tickers");
  if (!raw) return json({ error: "Missing tickers parameter" }, 400);

  const tickers = parseTickers(raw);
  if (tickers.length === 0) return json({ error: "No valid tickers supplied" }, 400);
  if (tickers.length > MAX_INSTRUMENT_TICKERS) {
    return json(
      { error: `Too many tickers — ${MAX_INSTRUMENT_TICKERS} maximum, got ${tickers.length}` },
      400,
    );
  }

  return json(await callEngine("instruments", { tickers }));
}

/**
 * Route a request to its on-device handler.
 *
 * Returns null for a path with no on-device equivalent, so the caller can
 * decide — a 404 masquerading as an answer is worse than an explicit miss.
 */
export async function handleDeviceRequest(path: string): Promise<Response | null> {
  // A relative path has no origin to parse against; the base is discarded.
  const url = new URL(path, "https://device.local");
  const params = url.searchParams;

  try {
    switch (url.pathname) {
      case "/api/recommendations":
        return await recommendations(params);
      case "/api/quotes":
        return await quotes(params);
      case "/api/instruments":
        return await instruments(params);
      default: {
        const stockMatch = /^\/api\/stock\/([^/]+)\/?$/.exec(url.pathname);
        if (stockMatch) return await stockDetail(stockMatch[1], params);
        return null;
      }
    }
  } catch (error) {
    console.error(`[device-api] ${url.pathname} failed:`, error);
    return json({ error: "Request failed" }, 500);
  }
}
