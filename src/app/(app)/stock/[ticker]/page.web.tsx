import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { analyseStock } from "@/lib/engine/recommend";
import { toStockDetailPayload } from "@/lib/engine/stock-detail";
import { getInitialRiskTolerance } from "@/lib/request-context";
import { StockDetailView } from "@/components/stock/stock-detail-view";

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

  const tolerance = await getInitialRiskTolerance();

  const analysis = await analyseStock(ticker, tolerance);
  if (!analysis) notFound();

  return (
    <main className="pt-1">
      <StockDetailView {...toStockDetailPayload(analysis)} initialStrategyId={strategy} />
    </main>
  );
}
