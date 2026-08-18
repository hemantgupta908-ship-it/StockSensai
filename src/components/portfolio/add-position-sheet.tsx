"use client";

import { useState, useEffect } from "react";
import { Sheet } from "@/components/ui/sheet";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import {
  TRADING_STYLES,
  TRADING_STYLE_CAPTIONS,
  TRADING_STYLE_LABELS,
} from "@/lib/strategies/types";
import { formatINR, todayISO } from "@/lib/utils";
import { SEED_INSTRUMENTS } from "@/lib/market-data/seed/instruments";
import { apiFetch } from "@/lib/mobile/api";
import { usePortfolio } from "./portfolio-provider";

interface AddPositionSheetProps {
  open: boolean;
  onClose: () => void;
  initialTicker?: string;
}

export function AddPositionSheet({ open, onClose, initialTicker }: AddPositionSheetProps) {
  const { add } = usePortfolio();
  const [ticker, setTicker] = useState(initialTicker || "");
  const [name, setName] = useState("");
  const [exchange, setExchange] = useState("NSE");
  const [quantity, setQuantity] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [entryDate, setEntryDate] = useState(() => todayISO());
  const [tradingStyle, setTradingStyle] = useState<string>("swing");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);
  const [pricePending, setPricePending] = useState(false);

  /**
   * Fill the price box from the live quote endpoint.
   *
   * Deliberately not `sim.basePrice` off the seed instrument, which is the
   * starting point of the *simulation* and has no relationship to the market
   * whenever a real provider is connected. Prefilling it and captioning it
   * "market price" writes a fabricated fill into a journal whose entire purpose
   * is comparing planned trades against what actually happened. If the quote
   * cannot be fetched the box is left empty for the user to type — an empty
   * field asks a question, a wrong number answers one.
   */
  async function fillLivePrice(symbol: string) {
    setPricePending(true);
    try {
      const res = await apiFetch(`/api/quotes?tickers=${encodeURIComponent(symbol)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { quotes?: { ticker: string; price: number }[] };
      const quote = data.quotes?.find((q) => q.ticker === symbol);
      if (quote && Number.isFinite(quote.price)) {
        setEntryPrice(quote.price.toFixed(2));
        setAutoFilled(true);
      }
    } catch {
      // Leave the field blank — the user types the fill they actually got.
    } finally {
      setPricePending(false);
    }
  }

  useEffect(() => {
    if (open && initialTicker) {
      setTicker(initialTicker);
      const match = SEED_INSTRUMENTS.find(
        (inst) => inst.ticker.toLowerCase() === initialTicker.toLowerCase()
      );
      if (match) {
        setName(match.name);
        setExchange(match.exchange);
        void fillLivePrice(match.ticker);
      }
    } else if (!open) {
      setTicker("");
      setName("");
      setQuantity("");
      setEntryPrice("");
      setNote("");
      setAutoFilled(false);
    }
  }, [open, initialTicker]);

  const cleanTicker = ticker.trim().toUpperCase();
  const quantityValue = Number(quantity);
  const priceValue = Number(entryPrice);
  const valid = cleanTicker.length > 0 && quantityValue > 0 && priceValue > 0 && Boolean(entryDate);

  // Search matching stocks for autocomplete
  const suggestions = ticker.trim().length >= 1
    ? SEED_INSTRUMENTS.filter(
        (inst) =>
          inst.ticker.toLowerCase().includes(ticker.trim().toLowerCase()) ||
          inst.name.toLowerCase().includes(ticker.trim().toLowerCase())
      ).slice(0, 6)
    : [];

  function selectStock(item: (typeof SEED_INSTRUMENTS)[0]) {
    setTicker(item.ticker);
    setName(item.name);
    setExchange(item.exchange);
    setShowSuggestions(false);
    void fillLivePrice(item.ticker);
  }

  async function submit() {
    if (!valid) return;
    setSaving(true);
    try {
      await add({
        ticker: cleanTicker,
        name: name.trim() || cleanTicker,
        exchange: exchange.toUpperCase(),
        quantity: quantityValue,
        entryPrice: priceValue,
        entryDate,
        strategyId: null,
        tradingStyle,
        recommendedBuyLow: null,
        recommendedBuyHigh: null,
        recommendedSellLow: null,
        recommendedSellHigh: null,
        recommendedStopLoss: null,
        exitPrice: null,
        exitDate: null,
        note: note.trim() || null,
      });

      // Reset
      setTicker("");
      setName("");
      setQuantity("");
      setEntryPrice("");
      setNote("");
      setAutoFilled(false);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add Position to Journal">
      <div className="space-y-4">
        <p className="text-footnote leading-snug text-label-secondary/60">
          Directly log a trade position into your portfolio journal to track real-time P&L and plan execution.
        </p>

        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2 relative">
            <Field label="Symbol / Ticker *">
              <input
                type="text"
                value={ticker}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                onChange={(e) => {
                  setTicker(e.target.value);
                  setShowSuggestions(true);
                  setAutoFilled(false);
                }}
                placeholder="e.g. RELIANCE, SBIN"
                className={inputClass}
              />
            </Field>

            {/* Stock Autocomplete Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-separator/50 bg-bg-elevated p-1 shadow-lg dark:border-white/10 dark:bg-slate-900">
                {suggestions.map((item) => (
                  <button
                    key={item.ticker}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectStock(item);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-fill/[0.08] dark:hover:bg-white/[0.08]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-label text-subhead">{item.ticker}</span>
                        <span className="rounded bg-fill/15 px-1.5 py-0.5 text-[10px] font-bold text-label-secondary">
                          {item.exchange}
                        </span>
                      </div>
                      <p className="truncate text-caption2 text-label-secondary/70">{item.name}</p>
                    </div>
                    {/* No price here: the only figure available at this point is
                        the simulation's base price, and showing it in a picker
                        reads as a live quote. The real one is fetched on select. */}
                    <span className="text-caption2 text-label-secondary/45">
                      {item.sector}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <Field label="Exchange">
              <select
                value={exchange}
                onChange={(e) => setExchange(e.target.value)}
                className={inputClass}
              >
                <option value="NSE" className="bg-bg text-label dark:bg-[#1C1C1E]">NSE</option>
                <option value="BSE" className="bg-bg text-label dark:bg-[#1C1C1E]">BSE</option>
              </select>
            </Field>
          </div>
        </div>

        {pricePending && (
          <p className="text-[11px] font-semibold text-label-secondary/60">
            Fetching latest price…
          </p>
        )}
        {!pricePending && autoFilled && (
          <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <span>✨ Auto-filled company details &amp; latest quoted price</span>
          </p>
        )}

        <Field label="Company Name (Optional)">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Reliance Industries Ltd"
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity *">
            <AmountInput
              value={quantity}
              onChange={setQuantity}
              keypadLabel="Quantity"
              placeholder="Shares count"
            />
          </Field>

          <Field label="Buy Price (₹) *">
            <AmountInput
              value={entryPrice}
              onChange={setEntryPrice}
              keypadLabel="Buy price"
              placeholder="0.00"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Buy Date *">
            <input
              type="date"
              value={entryDate}
              max={todayISO()}
              onChange={(e) => setEntryDate(e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Strategy Style">
            <select
              value={tradingStyle}
              onChange={(e) => setTradingStyle(e.target.value)}
              className={inputClass}
            >
              {TRADING_STYLES.map((style) => (
                <option key={style} value={style} className="bg-bg text-label dark:bg-[#1C1C1E]">
                  {TRADING_STYLE_LABELS[style]} ({TRADING_STYLE_CAPTIONS[style]})
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Notes / Thesis (Optional)">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Entry reason, stop loss idea, target..."
            className={`${inputClass} resize-none`}
          />
        </Field>

        {quantityValue > 0 && priceValue > 0 && (
          <div className="rounded-[12px] bg-fill/[0.06] p-3 dark:bg-white/[0.04]">
            <p className="text-caption text-label-secondary/60">Total Cost Baseline</p>
            <p className="numeric mt-0.5 text-subhead font-bold text-label">
              {formatINR(quantityValue * priceValue)}
            </p>
          </div>
        )}

        <Button fullWidth size="lg" disabled={!valid || saving} onClick={() => void submit()}>
          {saving ? "Saving Position..." : "Save Position"}
        </Button>
      </div>
    </Sheet>
  );
}

const inputClass =
  "w-full rounded-[12px] border border-separator/50 bg-bg px-3.5 py-2.5 text-body text-label placeholder:text-label-quaternary/35 focus:border-accent focus:outline-none dark:border-white/[0.10] dark:bg-white/[0.05]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-footnote font-medium text-label-secondary/70">
        {label}
      </span>
      {children}
    </label>
  );
}
