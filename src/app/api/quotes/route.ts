import { NextResponse } from "next/server";

import { getMarketDataProvider } from "@/lib/market-data";

export const dynamic = "force-dynamic";

/** Cap so a crafted query can't ask the provider for the whole exchange. */
const MAX_TICKERS = 60;

/** Live quotes for the watchlist and journal screens. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("tickers") ?? "";

  const tickers = Array.from(
    new Set(
      raw
        .split(",")
        .map((t) => t.trim().toUpperCase())
        .filter((t) => /^[A-Z0-9&-]{1,20}$/.test(t)),
    ),
  ).slice(0, MAX_TICKERS);

  if (tickers.length === 0) {
    return NextResponse.json({ quotes: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const provider = getMarketDataProvider();
    const quotes = await provider.getQuotes(tickers);
    return NextResponse.json(
      { quotes, isLiveData: provider.isLive },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[api/quotes] failed:", error);
    return NextResponse.json({ error: "Failed to fetch quotes" }, { status: 500 });
  }
}
