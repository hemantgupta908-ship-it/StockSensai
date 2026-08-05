"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  TRADING_STYLES,
  TRADING_STYLE_CAPTIONS,
  TRADING_STYLE_LABELS,
} from "@/lib/strategies/types";
import { formatINR } from "@/lib/utils";
import { usePortfolio } from "./portfolio-provider";

interface AddPositionSheetProps {
  open: boolean;
  onClose: () => void;
}

export function AddPositionSheet({ open, onClose }: AddPositionSheetProps) {
  const { add } = usePortfolio();
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [exchange, setExchange] = useState("NSE");
  const [quantity, setQuantity] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [tradingStyle, setTradingStyle] = useState<string>("swing");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const cleanTicker = ticker.trim().toUpperCase();
  const quantityValue = Number(quantity);
  const priceValue = Number(entryPrice);
  const valid = cleanTicker.length > 0 && quantityValue > 0 && priceValue > 0 && Boolean(entryDate);

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
          <div className="col-span-2">
            <Field label="Symbol / Ticker *">
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                placeholder="e.g. RELIANCE, TCS"
                className={inputClass}
              />
            </Field>
          </div>
          <div>
            <Field label="Exchange">
              <select
                value={exchange}
                onChange={(e) => setExchange(e.target.value)}
                className={inputClass}
              >
                <option value="NSE">NSE</option>
                <option value="BSE">BSE</option>
              </select>
            </Field>
          </div>
        </div>

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
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Shares count"
              className={inputClass}
            />
          </Field>

          <Field label="Buy Price (₹) *">
            <input
              type="number"
              inputMode="decimal"
              step="0.05"
              min={0}
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
              placeholder="0.00"
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Buy Date *">
            <input
              type="date"
              value={entryDate}
              max={new Date().toISOString().slice(0, 10)}
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
                <option key={style} value={style}>
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
  "w-full rounded-[12px] border border-separator/50 bg-bg px-3.5 py-2.5 text-body text-label placeholder:text-label-quaternary/35 focus:border-blue focus:outline-none dark:border-white/[0.10] dark:bg-white/[0.05]";

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
