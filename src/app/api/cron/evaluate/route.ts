import { NextResponse } from "next/server";
import { cronSecret } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getMarketDataProvider } from "@/lib/market-data";
import { resolveTrade } from "@/lib/engine/evaluate-trade";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const isVercelCron = request.headers.get("x-vercel-cron") !== null;

  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production" && !isVercelCron) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 401 },
    );
  }

  const startedAt = Date.now();
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({
      ok: false,
      reason: "Supabase service-role key not configured",
      durationMs: Date.now() - startedAt,
    });
  }

  try {
    // 1. Fetch pending trades
    const { data: pending, error: fetchError } = await supabase
      .from("recommendation_history")
      .select("*")
      .eq("status", "pending");

    if (fetchError) throw new Error(`Fetch failed: ${fetchError.message}`);
    if (!pending || pending.length === 0) {
      return NextResponse.json({
        ok: true,
        evaluated: 0,
        message: "No pending trades to evaluate",
        durationMs: Date.now() - startedAt,
      });
    }

    // 2. Fetch live prices
    const provider = getMarketDataProvider();
    const tickers = [...new Set(pending.map((p) => p.stock_ticker))];
    const quotes = await provider.getQuotes(tickers);
    const quotesMap = new Map(quotes.map((q) => [q.ticker, q]));

    const updates = [];
    let wonCount = 0;
    let lostCount = 0;
    let expiredCount = 0;

    const now = Date.now();

    for (const trade of pending) {
      const quote = quotesMap.get(trade.stock_ticker);
      const daysElapsed =
        (now - new Date(trade.generated_at).getTime()) / (1000 * 60 * 60 * 24);

      const newStatus = resolveTrade(
        {
          targetPrice: trade.target_price,
          stopLoss: trade.stop_loss,
          estimatedHoldDays: trade.estimated_hold_days,
        },
        quote ? { price: quote.price, high: quote.high, low: quote.low } : null,
        daysElapsed,
      );

      if (newStatus === "pending") continue;

      if (newStatus === "won") wonCount++;
      else if (newStatus === "lost") lostCount++;
      else expiredCount++;

      updates.push({
        ...trade,
        status: newStatus,
        evaluated_at: new Date().toISOString(),
      });
    }

    // 3. Update evaluated trades
    if (updates.length > 0) {
      const { error: updateError } = await supabase
        .from("recommendation_history")
        .upsert(updates, { onConflict: "id" });
      if (updateError) throw new Error(`Update failed: ${updateError.message}`);

      // 4. Recompute strategy performance.
      //
      // Paged explicitly: PostgREST caps an unbounded select at its max-rows
      // setting (1000 by default), so once the history outgrows one page an
      // unpaged read would silently compute the win rate from the oldest slice
      // of trades and drift further from the truth every day.
      const PAGE_SIZE = 1000;
      const allHistory: { strategy_id: string; status: string }[] = [];

      for (let page = 0; ; page++) {
        const { data, error: historyError } = await supabase
          .from("recommendation_history")
          .select("strategy_id, status")
          .in("status", ["won", "lost"]) // Ignore pending/expired for win rate
          .order("id", { ascending: true })
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

        if (historyError) throw new Error(`History fetch failed: ${historyError.message}`);
        if (!data || data.length === 0) break;

        allHistory.push(...data);
        if (data.length < PAGE_SIZE) break;
      }

      const performanceMap = new Map<string, { won: number; total: number }>();
      for (const trade of allHistory) {
        if (!performanceMap.has(trade.strategy_id)) {
          performanceMap.set(trade.strategy_id, { won: 0, total: 0 });
        }
        const stats = performanceMap.get(trade.strategy_id)!;
        stats.total++;
        if (trade.status === "won") stats.won++;
      }

      const performanceRows = Array.from(performanceMap.entries()).map(([strategyId, stats]) => ({
        strategy_id: strategyId,
        win_rate: stats.total > 0 ? parseFloat((stats.won / stats.total).toFixed(4)) : 0,
        total_trades: stats.total,
        updated_at: new Date().toISOString(),
      }));

      if (performanceRows.length > 0) {
        const { error: perfError } = await supabase
          .from("strategy_performance")
          .upsert(performanceRows, { onConflict: "strategy_id" });
        if (perfError) throw new Error(`Performance update failed: ${perfError.message}`);
      }
    }

    return NextResponse.json({
      ok: true,
      evaluated: updates.length,
      won: wonCount,
      lost: lostCount,
      expired: expiredCount,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error("[cron/evaluate] failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
