"use client";
import { useShallow } from "zustand/react/shallow";

import { useMemo, useRef, useState } from "react";
import { CheckCircle, DownloadSimple, Trash, UploadSimple, X } from "@phosphor-icons/react";
import * as XLSX from "xlsx";

import { cn } from "@/lib/utils";
import { useBudget, useCategoryLookup } from "./budget-provider";
import { createTransaction, matchAssociatedTitle } from "@/lib/budget/factory";
import type { Transaction } from "@/lib/budget/types";
import { formatCurrencyAmount } from "@/lib/budget/currency";

interface PendingTransaction {
  id: string; // Temporary ID for React keys
  dateStr: string;
  description: string;
  amount: number; // Positive for income, negative for expense
  categoryFk: string;
  walletFk: string;
}

export function ImportPreviewModal({
  open,
  onClose,
  defaultWalletFk,
}: {
  open: boolean;
  onClose: () => void;
  defaultWalletFk: string;
}) {
  const { categories, wallets, associatedTitles, upsertTransactions, settings  } = useBudget(useShallow((s) => ({ categories: s.categories, wallets: s.wallets, associatedTitles: s.associatedTitles, upsertTransactions: s.upsertTransactions, settings: s.settings })));
  const { byPk, main, subsByParent } = useCategoryLookup();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"upload" | "preview" | "success">("upload");
  const [pending, setPending] = useState<PendingTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  const currentWallet = wallets.find(w => w.walletPk === defaultWalletFk) ?? wallets[0];

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Date (DD/MM/YYYY)", "Description", "Debit", "Credit"]
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");
    XLSX.writeFile(wb, "Transactions_Template.xlsx");
  };

  const parseDate = (dateStr: string | number): string => {
    if (typeof dateStr === "number") {
      // Excel serial date
      const date = new Date(Math.round((dateStr - 25569) * 86400 * 1000));
      return date.toISOString();
    }
    
    if (typeof dateStr !== "string") return new Date().toISOString();
    
    // Parse DD/MM/YYYY
    const parts = dateStr.trim().split(/[-/]/);
    if (parts.length === 3) {
      const [d, m, y] = parts;
      const parsed = new Date(Number(y), Number(m) - 1, Number(d));
      if (!isNaN(parsed.getTime())) return parsed.toISOString();
    }
    return new Date().toISOString();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const wb = XLSX.read(data, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        
        // Skip header
        const dataRows = rows.slice(1).filter(r => r.length > 0);
        
        const parsed: PendingTransaction[] = dataRows.map((row, idx) => {
          const dateStr = row[0] ?? "";
          const desc = String(row[1] ?? "");
          const debit = parseFloat(String(row[2]).replace(/[^0-9.-]/g, "")) || 0;
          const credit = parseFloat(String(row[3]).replace(/[^0-9.-]/g, "")) || 0;
          
          let amount = 0;
          if (credit > 0) amount = credit;
          else if (debit > 0) amount = -debit;

          // Try to match category
          const matched = matchAssociatedTitle(desc, associatedTitles);
          let catFk = "1"; // Default to general or something
          if (matched) {
            catFk = matched.categoryFk;
          } else {
            // Very simple fallback: try matching substring against category names directly
            const lowerDesc = desc.toLowerCase();
            const guess = categories.find(c => lowerDesc.includes(c.name.toLowerCase()));
            if (guess) catFk = guess.categoryPk;
            else catFk = categories[0]?.categoryPk ?? "1";
          }

          return {
            id: `temp-${idx}`,
            dateStr: parseDate(dateStr),
            description: desc,
            amount,
            categoryFk: catFk,
            walletFk: defaultWalletFk,
          };
        });

        if (parsed.length === 0) {
          setError("No data found in the file. Did you fill out the template?");
          return;
        }

        setPending(parsed);
        setStep("preview");
      } catch (err) {
        setError("Failed to parse the file. Please ensure it is a valid Excel file matching the template.");
        console.error(err);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = ""; // reset input
  };

  const handleUpdatePending = (id: string, updates: Partial<PendingTransaction>) => {
    setPending(curr => curr.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const handleRemovePending = (id: string) => {
    setPending(curr => curr.filter(p => p.id !== id));
    if (pending.length === 1) setStep("upload");
  };

  const handleSave = () => {
    const newTransactions: Transaction[] = pending.map(p => {
      const isIncome = p.amount >= 0;
      return createTransaction({
        name: p.description,
        amount: isIncome ? p.amount : -Math.abs(p.amount), // Ensure expense is negative
        income: isIncome,
        categoryFk: p.categoryFk,
        walletFk: p.walletFk,
        dateCreated: p.dateStr,
        methodAdded: 2, // MethodAdded.csv
        paid: true,
      });
    });

    upsertTransactions(newTransactions);
    setStep("success");
    setTimeout(() => {
      closeAndReset();
    }, 1500);
  };

  const closeAndReset = () => {
    onClose();
    setTimeout(() => {
      setStep("upload");
      setPending([]);
      setError(null);
    }, 300);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" 
        onClick={closeAndReset}
      />

      {/* Modal */}
      <div className="relative flex w-full max-w-4xl max-h-[90dvh] flex-col overflow-hidden rounded-2xl bg-bg-elevated shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-separator/40 px-6 py-4">
          <h2 className="text-title3 font-bold text-label">
            {step === "upload" ? "Import Transactions" : step === "preview" ? "Review & Map" : "Success"}
          </h2>
          <button
            onClick={closeAndReset}
            className="rounded-full p-2 text-label-secondary/70 transition-colors hover:bg-fill/5 hover:text-label"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === "upload" && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-accent/10 text-accent">
                <UploadSimple size={32} />
              </div>
              <h3 className="mb-2 text-title2 font-bold text-label">Upload Excel File</h3>
              <p className="mb-8 max-w-sm text-subhead text-label-secondary/70">
                Download the template, fill it with your historical transactions, and upload it back here.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
                <button
                  onClick={handleDownloadTemplate}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-fill/5 px-4 py-3.5 text-subhead font-semibold text-label transition-colors hover:bg-fill/10 active:scale-[0.98]"
                >
                  <DownloadSimple size={18} />
                  Download Template
                </button>
                
                <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3.5 text-subhead font-semibold text-accent-fg transition-colors hover:bg-accent/90 active:scale-[0.98]">
                  <UploadSimple size={18} />
                  Upload File
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                  />
                </label>
              </div>

              {error && (
                <div className="mt-6 rounded-lg bg-red/10 px-4 py-3 text-sm text-red">
                  {error}
                </div>
              )}
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-separator/40 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-bg-secondary text-label-secondary/60">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Date</th>
                        <th className="px-4 py-3 font-semibold">Description</th>
                        <th className="px-4 py-3 font-semibold text-right">Amount</th>
                        <th className="px-4 py-3 font-semibold">Category</th>
                        <th className="px-4 py-3 font-semibold">Account</th>
                        <th className="px-4 py-3 font-semibold"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-separator/30">
                      {pending.map((p) => {
                        const dateObj = new Date(p.dateStr);
                        return (
                          <tr key={p.id} className="hover:bg-fill/[0.02]">
                            <td className="whitespace-nowrap px-4 py-3 text-label">
                              {dateObj.toLocaleDateString("en-GB", { day: '2-digit', month: 'short', year: 'numeric' })}
                            </td>
                            <td className="px-4 py-3 text-label font-medium max-w-[200px] truncate">
                              {p.description}
                            </td>
                            <td className={cn(
                              "whitespace-nowrap px-4 py-3 text-right font-semibold",
                              p.amount >= 0 ? "text-green" : "text-label"
                            )}>
                              {formatCurrencyAmount(Math.abs(p.amount), currentWallet?.currency)}
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={p.categoryFk}
                                onChange={(e) => handleUpdatePending(p.id, { categoryFk: e.target.value })}
                                className="w-full rounded-md border border-separator/50 bg-bg-elevated px-2 py-1 text-sm outline-none focus:border-accent"
                              >
                                {main.map((cat) => (
                                  <optgroup key={cat.categoryPk} label={cat.name}>
                                    <option value={cat.categoryPk}>{cat.name}</option>
                                    {(subsByParent.get(cat.categoryPk) ?? []).map((sub) => (
                                      <option key={sub.categoryPk} value={sub.categoryPk}>
                                        ↳ {sub.name}
                                      </option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={p.walletFk}
                                onChange={(e) => handleUpdatePending(p.id, { walletFk: e.target.value })}
                                className="w-full rounded-md border border-separator/50 bg-bg-elevated px-2 py-1 text-sm outline-none focus:border-accent"
                              >
                                {wallets.map(w => (
                                  <option key={w.walletPk} value={w.walletPk}>
                                    {w.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => handleRemovePending(p.id)}
                                className="rounded p-1 text-label-secondary/50 hover:bg-red/10 hover:text-red transition-colors"
                              >
                                <Trash size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {step === "success" && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle size={48} className="mb-4 text-green" />
              <h3 className="text-title3 font-bold text-label">Imported Successfully!</h3>
              <p className="mt-2 text-label-secondary/70">Your transactions have been added.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === "preview" && (
          <div className="flex items-center justify-between border-t border-separator/40 bg-bg-secondary px-6 py-4">
            <p className="text-sm font-medium text-label-secondary/70">
              {pending.length} transaction{pending.length === 1 ? '' : 's'} ready
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setStep("upload")}
                className="rounded-xl px-5 py-2.5 text-sm font-semibold text-label-secondary hover:bg-fill/10 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSave}
                className="rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-accent-fg hover:bg-accent/90 active:scale-[0.98] transition-all shadow-sm"
              >
                Save Transactions
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
