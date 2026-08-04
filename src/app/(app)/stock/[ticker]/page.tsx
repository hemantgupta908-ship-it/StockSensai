import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { analyseStock } from "@/lib/engine/recommend";
import { parseRiskTolerance, RISK_COOKIE } from "@/lib/preferences";
import { StockDetailView } from "@/components/stock/stock-detail-view";

/** Bars sent to the client for charting — about 8 months of daily history. */
const CHART_BARS = 170;

interface PageProps {
  params: Promise<{ ticker: string }>;
  searchParams: Promise<{ strategy?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { ticker } = await params;
  const symbol = ticker.toUpperCase();
  return {
    title: symbol,
    description: `Strategy signals, price levels and fundamentals for ${symbol} on NSE/BSE.`,
  };
}

export default async function StockPage({ params, searchParams }: PageProps) {
  const { ticker } = await params;
  const { strategy } = await searchParams;

  const cookieStore = await cookies();
  const tolerance = parseRiskTolerance(cookieStore.get(RISK_COOKIE)?.value);

  const analysis = await analyseStock(ticker, tolerance);
  if (!analysis) notFound();

  const { bundle, bullishSignals, bearishSignals } = analysis;

  return (
    <main className="pt-1">
      <StockDetailView
        instrument={bundle.instrument}
        quote={bundle.quote}
        candles={bundle.daily.slice(-CHART_BARS)}
        fundamentals={bundle.fundamentals}
        bullishSignals={bullishSignals}
        bearishSignals={bearishSignals}
        initialStrategyId={strategy}
      />
    </main>
  );
}
