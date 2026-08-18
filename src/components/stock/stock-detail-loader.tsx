"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { WarningCircle } from "@phosphor-icons/react";

import { apiFetch } from "@/lib/mobile/api";
import type { StockDetailPayload } from "@/lib/engine/stock-detail";
import { usePreferences } from "@/components/preferences-provider";
import { NavBar } from "@/components/ui/nav-bar";
import { StockDetailView } from "./stock-detail-view";

/**
 * Client-side counterpart to the server-rendered stock page.
 *
 * The web build resolves the analysis during SSR and ships finished HTML. There
 * is no server behind the Android build's WebView, so the same analysis is
 * fetched here — from a configured deployment when there is one, and otherwise
 * computed on-device by the engine worker. `apiFetch` decides which, and both
 * answer with the identical `StockDetailPayload`, so `StockDetailView` below is
 * the very same component the web app renders.
 */

/**
 * The `key` is the request the result belongs to.
 *
 * Carrying it lets the loading state be *derived* rather than assigned: a
 * result whose key no longer matches the current ticker and tolerance is stale
 * by definition, so it renders as loading without an effect having to reset it
 * first. That reset was a synchronous `setState` inside an effect, which costs
 * an extra render pass on every navigation between stocks.
 */
type State = { key: string } & (
  | { status: "loading" }
  | { status: "ready"; payload: StockDetailPayload }
  | { status: "missing" }
  | { status: "error"; message: string }
);

export function StockDetailLoader() {
  const params = useParams<{ ticker: string }>();
  const searchParams = useSearchParams();
  const { riskTolerance, hydrated } = usePreferences();

  const ticker = (params?.ticker ?? "").toUpperCase();
  const initialStrategyId = searchParams.get("strategy") ?? undefined;

  const requestKey = `${ticker}:${riskTolerance}`;
  const [result, setResult] = useState<State>({ key: "", status: "loading" });
  // Anything belonging to an earlier request is stale, so it reads as loading.
  const state: State = result.key === requestKey ? result : { key: requestKey, status: "loading" };

  useEffect(() => {
    // Waiting for hydration avoids screening once at the default tolerance and
    // again at the stored one — on-device that is a wasted multi-second run.
    if (!ticker || !hydrated) return;

    let cancelled = false;

    apiFetch(`/api/stock/${encodeURIComponent(ticker)}?tolerance=${riskTolerance}`)
      .then(async (response) => {
        if (response.status === 404) {
          if (!cancelled) setResult({ key: requestKey, status: "missing" });
          return;
        }
        if (!response.ok) throw new Error(`Request failed (${response.status})`);

        const payload = (await response.json()) as StockDetailPayload;
        if (!cancelled) setResult({ key: requestKey, status: "ready", payload });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setResult({
          key: requestKey,
          status: "error",
          message: error instanceof Error ? error.message : "Something went wrong",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [ticker, riskTolerance, hydrated, requestKey]);

  if (state.status === "ready") {
    return (
      <main className="pt-1">
        <StockDetailView {...state.payload} initialStrategyId={initialStrategyId} />
      </main>
    );
  }

  return (
    <>
      <NavBar title={ticker} showBack width="fluid" />
      <main className="pt-1">
        {state.status === "loading" ? (
          <StockDetailSkeleton />
        ) : (
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-16 text-center">
            <WarningCircle size={32} weight="duotone" className="text-label-secondary/40" />
            <p className="text-subhead font-semibold text-label">
              {state.status === "missing" ? "Stock not found" : "Couldn't load this stock"}
            </p>
            <p className="text-footnote leading-relaxed text-label-secondary/70">
              {state.status === "missing"
                ? `${ticker} isn't in the NSE/BSE universe this app screens.`
                : state.message}
            </p>
          </div>
        )}
      </main>
    </>
  );
}

function StockDetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4">
      <div className="h-16 animate-pulse rounded-card bg-fill/[0.08]" />
      <div className="h-[320px] animate-pulse rounded-card bg-fill/[0.08]" />
      <div className="h-32 animate-pulse rounded-card bg-fill/[0.08]" />
      <div className="h-32 animate-pulse rounded-card bg-fill/[0.08]" />
    </div>
  );
}
