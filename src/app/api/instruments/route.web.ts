import { NextResponse } from "next/server";

import { getMarketDataProvider } from "@/lib/market-data";
import type { Instrument } from "@/lib/market-data/types";

/**
 * Instrument metadata (sector, industry, name) for a set of tickers.
 *
 * Used by the portfolio's sector breakdown, which needs classification for
 * holdings the user typed in rather than picked out of a feed.
 */

/**
 * Cap on tickers per request. Each one costs an upstream call, so an unbounded
 * list turns a single request into a fan-out against a rate-limited provider.
 * Comfortably above any realistic portfolio.
 */
const MAX_TICKERS = 100;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tickersParam = searchParams.get("tickers");

  if (!tickersParam) {
    return NextResponse.json({ error: "Missing tickers parameter" }, { status: 400 });
  }

  const tickers = Array.from(
    new Set(
      tickersParam
        .split(",")
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean),
    ),
  );

  if (tickers.length === 0) {
    return NextResponse.json({ error: "No valid tickers supplied" }, { status: 400 });
  }

  if (tickers.length > MAX_TICKERS) {
    return NextResponse.json(
      { error: `Too many tickers — ${MAX_TICKERS} maximum, got ${tickers.length}` },
      { status: 400 },
    );
  }

  const provider = getMarketDataProvider();

  try {
    // No batch endpoint on the provider, so these go out concurrently. One bad
    // ticker must not fail the whole breakdown, hence allSettled.
    const settled = await Promise.allSettled(
      tickers.map((ticker) => provider.getInstrument(ticker)),
    );

    const result: Record<string, Instrument> = {};
    for (const outcome of settled) {
      if (outcome.status === "fulfilled" && outcome.value) {
        result[outcome.value.ticker] = outcome.value;
      }
    }

    return NextResponse.json(result, {
      // Sector and industry do not change intraday.
      headers: { "Cache-Control": "private, max-age=3600" },
    });
  } catch (error) {
    console.error("[api/instruments] Failed to fetch instruments:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
