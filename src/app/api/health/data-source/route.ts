import { NextResponse } from "next/server";

import { cronSecret } from "@/lib/env";
import { getMarketDataProvider, DAILY_LOOKBACK } from "@/lib/market-data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * This endpoint is expensive and was reachable by anyone.
 *
 * The middleware exempts `/api/health` from the session gate, and one GET
 * fetches quotes for the entire universe plus candles, the benchmark and
 * fundamentals — roughly forty outbound requests against the configured
 * provider, with a 60s budget and no rate limit. Anonymous callers could use it
 * to bill the deployment's serverless time and hammer the upstream feed, and
 * the response discloses the provider and instrument list besides.
 *
 * So it authenticates the same way the cron does: a shared-secret bearer,
 * which keeps `curl` usable for its actual purpose (validating a live feed
 * before switching the app over).
 */
function isAuthorised(request: Request): boolean {
  if (cronSecret) {
    return request.headers.get("authorization") === `Bearer ${cronSecret}`;
  }
  // No secret configured: allowed outside production, refused inside it. Same
  // stance as the cron route, so a misconfigured deploy fails closed.
  return process.env.NODE_ENV !== "production";
}

/**
 * Data-source health check.
 *
 * Exercises every method the strategy engine depends on against whichever
 * provider is configured, and reports what came back. Use this to validate a
 * live feed *before* switching the app over — a provider that authenticates
 * successfully can still return empty candles, the wrong exchange, or no
 * fundamentals, and each of those breaks a different part of the engine in a
 * way that's hard to diagnose from the UI.
 *
 *   curl localhost:3000/api/health/data-source
 */
export async function GET(request: Request) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const provider = getMarketDataProvider();
  const startedAt = Date.now();

  const report: Record<string, unknown> = {
    provider: provider.name,
    isLiveData: provider.isLive,
    marketOpen: provider.isMarketOpen(),
  };

  try {
    const instruments = await provider.listInstruments();
    report.instruments = {
      ok: instruments.length > 0,
      count: instruments.length,
      sample: instruments.slice(0, 3).map((i) => `${i.ticker} (${i.exchange})`),
      nonIndian: instruments.filter((i) => i.exchange !== "NSE" && i.exchange !== "BSE").length,
    };

    if (instruments.length === 0) {
      return NextResponse.json({ ...report, ok: false, error: "No instruments returned" }, { status: 503 });
    }

    const probe = instruments[0].ticker;

    // Batched quotes — the path the engine actually uses.
    const quotes = await provider.getQuotes(instruments.map((i) => i.ticker));
    report.quotes = {
      ok: quotes.length > 0,
      requested: instruments.length,
      returned: quotes.length,
      missing: instruments
        .filter((i) => !quotes.some((q) => q.ticker === i.ticker))
        .map((i) => i.ticker)
        .slice(0, 10),
      sample: quotes[0],
    };

    const daily = await provider.getCandles({ ticker: probe, interval: "1d", limit: DAILY_LOOKBACK });
    report.dailyCandles = {
      ok: daily.length >= 200,
      ticker: probe,
      count: daily.length,
      // 200+ bars are needed for the 200 EMA the long-term screens require.
      note: daily.length < 200 ? "Fewer than 200 bars — 200 EMA strategies will not fire" : undefined,
      newest: daily.length ? new Date(daily[daily.length - 1].time * 1000).toISOString() : null,
      oldest: daily.length ? new Date(daily[0].time * 1000).toISOString() : null,
    };

    const intraday = await provider.getCandles({ ticker: probe, interval: "5m", limit: 225 });
    report.intradayCandles = {
      ok: intraday.length > 0,
      count: intraday.length,
      note:
        intraday.length === 0
          ? "No intraday bars — VWAP, ORB and gap strategies will stand down"
          : undefined,
    };

    const benchmark = await provider.getBenchmarkCandles(DAILY_LOOKBACK);
    report.benchmark = {
      ok: benchmark.length > 0,
      count: benchmark.length,
      note: benchmark.length === 0 ? "No NIFTY series — relative strength will not fire" : undefined,
    };

    const fundamentals = await provider.getFundamentals(probe);
    report.fundamentals = {
      ok: fundamentals !== null,
      note:
        fundamentals === null
          ? "Provider has no fundamentals feed — all 5 long-term strategies will stand down"
          : undefined,
    };

    const checks = ["instruments", "quotes", "dailyCandles", "benchmark"] as const;
    const ok = checks.every((key) => (report[key] as { ok: boolean }).ok);

    return NextResponse.json(
      { ...report, ok, durationMs: Date.now() - startedAt },
      { status: ok ? 200 : 503 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ...report,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      },
      { status: 503 },
    );
  }
}
