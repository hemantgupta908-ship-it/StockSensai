import { NextResponse } from "next/server";

import { analyseStock } from "@/lib/engine/recommend";
import { toStockDetailPayload } from "@/lib/engine/stock-detail";
import { parseRiskTolerance } from "@/lib/preferences";

export const dynamic = "force-dynamic";
/** A cold single-stock fetch against a live provider is several round trips. */
export const maxDuration = 60;

/**
 * The stock detail screen's data, for clients that cannot render it on a server.
 *
 * The web app resolves this during SSR and needs no endpoint. The Android build
 * does: pointed at a deployment it wants that deployment's live analysis, and
 * the alternative — screening the stock on the phone while a perfectly good
 * server sits idle — would answer with demo data on a device the user
 * configured precisely to avoid it.
 *
 * The payload is the same `StockDetailPayload` the server component renders, so
 * the two cannot drift.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;
  const symbol = ticker.toUpperCase();

  if (!/^[A-Z0-9&-]{1,20}$/.test(symbol)) {
    return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  }

  const tolerance = parseRiskTolerance(new URL(request.url).searchParams.get("tolerance"));

  try {
    const analysis = await analyseStock(symbol, tolerance);
    if (!analysis) {
      return NextResponse.json({ error: "Stock not found" }, { status: 404 });
    }

    return NextResponse.json(toStockDetailPayload(analysis), {
      // Levels move with the quote, so this is deliberately not cached at the
      // edge; the client caches per screen.
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(`[api/stock] ${symbol} failed:`, error);
    return NextResponse.json({ error: "Failed to analyse stock" }, { status: 500 });
  }
}
