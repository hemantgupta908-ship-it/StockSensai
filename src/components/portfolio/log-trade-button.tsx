"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { NotePencil } from "@phosphor-icons/react";

import type { StrategySignal } from "@/lib/strategies/types";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/utils";
import { usePortfolio } from "./portfolio-provider";

/**
 * Logs a position the user actually took, capturing the recommendation that
 * was on screen at the time so the journal can compare plan against outcome.
 */
export function LogTradeButton({
  ticker,
  name,
  exchange,
  price,
  signal,
}: {
  ticker: string;
  name: string;
  exchange: string;
  price: number;
  signal: StrategySignal | null;
}) {
  const { add } = usePortfolio();
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [entryPrice, setEntryPrice] = useState(String(price));
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const quantityValue = Number(quantity);
  const priceValue = Number(entryPrice);
  const valid = quantityValue > 0 && priceValue > 0 && Boolean(entryDate);

  async function submit() {
    if (!valid) return;
    setSaving(true);
    try {
      await add({
        ticker,
        name,
        exchange,
        quantity: quantityValue,
        entryPrice: priceValue,
        entryDate,
        strategyId: signal?.strategyId ?? null,
        tradingStyle: signal?.style ?? null,
        recommendedBuyLow: signal?.entry.low ?? null,
        recommendedBuyHigh: signal?.entry.high ?? null,
        recommendedSellLow: signal?.target.low ?? null,
        recommendedSellHigh: signal?.target.high ?? null,
        recommendedStopLoss: signal?.stopLoss ?? null,
        exitPrice: null,
        exitDate: null,
        note: note.trim() || null,
      });
      setOpen(false);
      setQuantity("");
      setNote("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <motion.button
        whileTap={{ scale: 0.88 }}
        transition={{ type: "spring", stiffness: 600, damping: 24 }}
        onClick={() => setOpen(true)}
        aria-label={`Log a trade in ${ticker}`}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-fill/[0.10] text-label-secondary/60 dark:bg-white/[0.09]"
      >
        <NotePencil size={17} />
      </motion.button>

      <Sheet open={open} onClose={() => setOpen(false)} title={`Log ${ticker}`}>
        <div className="space-y-4">
          <p className="text-footnote leading-snug text-label-secondary/60">
            Record a position you actually took. StockSensei never places trades — this is a
            journal, so you can compare what the screen suggested against what you did.
          </p>

          <Field label="Quantity">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Number of shares"
              className={inputClass}
            />
          </Field>

          <Field label="Entry price (₹)">
            <input
              type="number"
              inputMode="decimal"
              step="0.05"
              min={0}
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Entry date">
            <input
              type="date"
              value={entryDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setEntryDate(e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Note (optional)">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Why you took it, what you're watching"
              className={`${inputClass} resize-none`}
            />
          </Field>

          {signal && (
            <div className="rounded-[12px] bg-fill/[0.06] px-3.5 py-3 dark:bg-white/[0.04]">
              <p className="text-caption font-semibold text-label-secondary/70">
                Saving the plan alongside it
              </p>
              <p className="numeric mt-1 text-caption leading-relaxed text-label-secondary/55">
                {signal.strategyId.replace(/^(swing|st|lt)-/, "").replace(/-/g, " ")} · buy{" "}
                {formatINR(signal.entry.low, { decimals: 0 })}–
                {formatINR(signal.entry.high, { decimals: 0 })} · target{" "}
                {formatINR(signal.target.low, { decimals: 0 })}–
                {formatINR(signal.target.high, { decimals: 0 })} · stop{" "}
                {formatINR(signal.stopLoss, { decimals: 0 })}
              </p>
            </div>
          )}

          {quantityValue > 0 && priceValue > 0 && (
            <p className="numeric text-footnote text-label-secondary/60">
              Position value:{" "}
              <span className="font-semibold text-label">
                {formatINR(quantityValue * priceValue)}
              </span>
            </p>
          )}

          <Button fullWidth size="lg" disabled={!valid || saving} onClick={() => void submit()}>
            {saving ? "Saving…" : "Add to journal"}
          </Button>
        </div>
      </Sheet>
    </>
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
