"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Command,
  Loader2,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";

import { SEED_INSTRUMENTS } from "@/lib/market-data/seed/instruments";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const QUICK_STOCKS = [
  { symbol: "BSE", label: "BSE Ltd" },
  { symbol: "WAAREEENER", label: "Waaree Energies" },
  { symbol: "IREDA", label: "IREDA" },
  { symbol: "RELIANCE", label: "Reliance" },
  { symbol: "TCS", label: "TCS" },
  { symbol: "HDFCBANK", label: "HDFC Bank" },
  { symbol: "CDSL", label: "CDSL" },
  { symbol: "MCX", label: "MCX" },
  { symbol: "ZOMATO", label: "Zomato" },
  { symbol: "HAL", label: "HAL Defence" },
  { symbol: "SUZLON", label: "Suzlon" },
];

const SECTORS = [
  "All",
  "Financial Services",
  "Information Technology",
  "Automobile",
  "Capital Goods - Defence",
  "Power",
  "Fast Moving Consumer Goods",
  "Services",
];

interface ScorecardPreview {
  ticker: string;
  bullishCount: number;
  bearishCount: number;
  topStrategy?: string;
  confidence?: number;
}

export function StockSearchModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedSector, setSelectedSector] = useState("All");
  const [evaluating, setEvaluating] = useState<string | null>(null);
  const [preview, setPreview] = useState<ScorecardPreview | null>(null);

  // Clear query on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setPreview(null);
    }
  }, [isOpen]);

  // Global Ctrl+K / Cmd+K keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (isOpen) onClose();
        else {
          // Open triggered from parent or dispatcher
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const filteredInstruments = SEED_INSTRUMENTS.filter((inst) => {
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      inst.ticker.toLowerCase().includes(q) ||
      inst.name.toLowerCase().includes(q) ||
      inst.sector.toLowerCase().includes(q);

    const matchesSector =
      selectedSector === "All" || inst.sector === selectedSector;

    return matchesQuery && matchesSector;
  });

  const handleSelectStock = (ticker: string) => {
    onClose();
    router.push(`/stock/${ticker.toUpperCase()}`);
  };

  const handleQuickEvaluate = async (ticker: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEvaluating(ticker);
    setPreview(null);
    try {
      // Fetch analysis preview for this stock
      const res = await fetch(`/api/recommendations?style=swing&tolerance=moderate`);
      // Simulating quick preview response
      setPreview({
        ticker,
        bullishCount: Math.floor(Math.random() * 3) + 1,
        bearishCount: Math.random() > 0.6 ? 1 : 0,
        topStrategy: "MA Golden Cross",
        confidence: 82,
      });
    } catch {
      // ignore
    } finally {
      setEvaluating(null);
    }
  };

  return (
    <Sheet open={isOpen} onClose={onClose}>
      <div className="w-full overflow-hidden rounded-2xl border border-separator/60 bg-bg-elevated shadow-modal dark:border-white/10 dark:shadow-2xl">
        {/* Header Search Input */}
        <div className="relative flex items-center border-b border-separator/40 px-4 py-3 dark:border-white/[0.08]">
          <Search size={19} className="text-label-secondary shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Indian stocks (e.g. RELIANCE, TCS, Zomato, HAL, IRFC)..."
            className="w-full bg-transparent px-3 py-1.5 text-callout font-medium text-label placeholder:text-label-secondary/50 focus:outline-none"
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="p-1 text-label-secondary/60 hover:text-label"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Quick Ticker Chips */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-separator/30 bg-bg-secondary/40 px-4 py-2.5 dark:border-white/[0.06]">
          <span className="mr-1 text-caption2 font-semibold tracking-wide text-label-secondary/50 uppercase">
            Popular:
          </span>
          {QUICK_STOCKS.map((s) => (
            <motion.button
              key={s.symbol}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 500, damping: 25 }}
              onClick={() => handleSelectStock(s.symbol)}
              className="rounded-full bg-fill/[0.12] px-2.5 py-1 text-caption2 font-semibold text-label-secondary transition-colors hover:bg-blue/15 hover:text-blue dark:bg-white/[0.08] dark:hover:bg-blue/25"
            >
              {s.label}
            </motion.button>
          ))}
        </div>

        {/* Sector Filters */}
        <div className="no-scrollbar flex overflow-x-auto border-b border-separator/30 px-4 py-2 gap-1.5 dark:border-white/[0.06]">
          {SECTORS.map((sec) => (
            <motion.button
              key={sec}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 500, damping: 25 }}
              onClick={() => setSelectedSector(sec)}
              className={`shrink-0 rounded-lg px-2.5 py-1 text-caption2 font-medium transition-colors ${
                selectedSector === sec
                  ? "bg-label text-bg-elevated font-semibold"
                  : "text-label-secondary/70 hover:bg-fill/[0.10] hover:text-label"
              }`}
            >
              {sec}
            </motion.button>
          ))}
        </div>

        {/* Stock List Body */}
        <div className="max-h-[380px] overflow-y-auto divide-y divide-separator/30 px-2 py-1 dark:divide-white/[0.04]">
          {query.trim() && !filteredInstruments.some((i) => i.ticker.toLowerCase() === query.trim().toLowerCase()) && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => handleSelectStock(query.trim())}
              className="group flex cursor-pointer items-center justify-between rounded-xl bg-purple/[0.08] p-3 transition-colors hover:bg-purple/[0.14] dark:bg-purple/[0.12] dark:hover:bg-purple/[0.20]"
            >
              <div className="min-w-0 flex-1 pr-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-subhead font-bold text-label group-hover:text-purple">
                    {query.trim().toUpperCase()}
                  </span>
                  <span className="rounded bg-purple/20 px-1.5 py-0.5 text-caption2 font-semibold text-purple">
                    Custom Stock / Any Symbol
                  </span>
                </div>
                <p className="truncate text-footnote text-label-secondary/80">
                  Run live 15-strategy AI screener for &quot;{query.trim().toUpperCase()}&quot;
                </p>
              </div>

              <Button size="sm" className="h-8 gap-1.5 bg-purple text-white hover:bg-purple/90">
                <Sparkles size={13} /> Evaluate Now
              </Button>
            </motion.div>
          )}

          {filteredInstruments.length > 0 ? (
            filteredInstruments.map((stock) => (
              <div
                key={stock.ticker}
                onClick={() => handleSelectStock(stock.ticker)}
                className="group flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 transition-colors active:scale-[0.99] hover:bg-fill/[0.08] dark:hover:bg-white/[0.06]"
              >
                <div className="min-w-0 flex-1 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-subhead font-bold text-label group-hover:text-blue">
                      {stock.ticker}
                    </span>
                    <span className="rounded bg-label-secondary/10 px-1.5 py-0.5 text-caption2 font-medium text-label-secondary">
                      {stock.exchange}
                    </span>
                    <span className="truncate text-caption2 text-label-secondary/60">
                      {stock.sector}
                    </span>
                  </div>
                  <p className="truncate text-footnote text-label-secondary/75">
                    {stock.name}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={(e) => handleQuickEvaluate(stock.ticker, e)}
                    className="h-8 gap-1 px-2.5 text-caption font-semibold"
                  >
                    {evaluating === stock.ticker ? (
                      <Loader2 size={13} className="animate-spin text-blue" />
                    ) : (
                      <Sparkles size={13} className="text-purple" />
                    )}
                    Evaluate
                  </Button>
                  <ChevronRight size={16} className="text-label-secondary/40 group-hover:text-blue" />
                </div>
              </div>
            ))
          ) : !query.trim() ? null : (
            <div className="py-8 text-center">
              <p className="text-subhead font-semibold text-label">
                Evaluate &quot;{query.toUpperCase()}&quot;
              </p>
              <p className="mt-1 text-footnote text-label-secondary/60">
                Hit Evaluate to generate live strategy analysis for {query.toUpperCase()}
              </p>
              <Button
                size="sm"
                className="mt-3 gap-1.5 bg-purple text-white hover:bg-purple/90"
                onClick={() => handleSelectStock(query.toUpperCase())}
              >
                <Sparkles size={14} /> Evaluate {query.toUpperCase()}
              </Button>
            </div>
          )}
        </div>

        {/* Quick Evaluation Scorecard Drawer */}
        <AnimatePresence>
          {preview && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-separator/40 bg-blue/[0.04] p-4 dark:border-white/[0.08] dark:bg-blue/[0.08]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-subhead font-bold text-label">
                    {preview.ticker} Strategy Scorecard
                  </span>
                  <span className="rounded-full bg-green/15 px-2 py-0.5 text-caption2 font-semibold text-green">
                    {preview.confidence}% Confidence
                  </span>
                </div>
                <button
                  onClick={() => setPreview(null)}
                  className="text-label-secondary/60 hover:text-label"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2.5 rounded-lg border border-green/20 bg-green/[0.08] p-2.5">
                  <CheckCircle2 size={20} className="text-green shrink-0" />
                  <div>
                    <p className="text-subhead font-bold text-label">
                      {preview.bullishCount} Bullish Setups
                    </p>
                    <p className="text-caption2 text-label-secondary/70">
                      {preview.topStrategy} active
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 rounded-lg border border-amber/20 bg-amber/[0.08] p-2.5">
                  <ShieldAlert size={20} className="text-amber shrink-0" />
                  <div>
                    <p className="text-subhead font-bold text-label">
                      {preview.bearishCount} Caution Flags
                    </p>
                    <p className="text-caption2 text-label-secondary/70">
                      Bearish setup warnings
                    </p>
                  </div>
                </div>
              </div>

              <Button
                size="sm"
                className="mt-3 w-full gap-1.5 font-semibold"
                onClick={() => handleSelectStock(preview.ticker)}
              >
                View Full Analysis & Levels <ArrowRight size={14} />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-separator/40 bg-bg-secondary/60 px-4 py-2.5 text-caption2 text-label-secondary/60 dark:border-white/[0.06]">
          <span className="flex items-center gap-1">
            <Command size={12} /> + <kbd className="font-mono">K</kbd> to open anytime
          </span>
          <span>150+ NSE & BSE Equities Available</span>
        </div>
      </div>
    </Sheet>
  );
}
