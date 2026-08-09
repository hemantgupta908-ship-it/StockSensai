"use client";

/**
 * Settings for the budget environment only.
 *
 * The user asked for the two environments to be configured independently, so
 * nothing here touches the stock app's preferences — this reads and writes
 * `cashew.settings` exclusively.
 */

import { useRef, useState } from "react";
import { ArrowCounterClockwise, DownloadSimple, UploadSimple } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import type { BudgetDatabase } from "@/lib/budget/types";
import { CURRENCIES, DEFAULT_EXCHANGE_RATES, getCurrencyInfo } from "@/lib/budget/currency";
import { exportTransactionsCsv, importTransactionsCsv } from "@/lib/budget/csv";
import { useBudget } from "./budget-provider";
import {
  Card,
  ConfirmButton,
  Field,
  SegmentedTabs,
  Section,
  SelectInput,
  TextInput,
  Toggle,
} from "./budget-ui";

const ACCENTS = ["#007AFF", "#34C759", "#AF52DE", "#FF9500", "#FF2D55", "#30B0C7", "#5856D6"];

export function BudgetSettingsView() {
  const {
    settings,
    updateSettings,
    wallets,
    categories,
    transactions,
    allWallets,
    exportDatabase,
    replaceDatabase,
    resetDatabase,
    upsertTransactions,
    upsertCategory,
  } = useBudget();

  const fileInput = useRef<HTMLInputElement>(null);
  const csvInput = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  function download(filename: string, contents: string, type: string) {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleJsonImport(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as BudgetDatabase;
        if (!Array.isArray(parsed.transactions)) throw new Error("Not a budget backup");
        replaceDatabase(parsed);
        setImportMessage(`Restored ${parsed.transactions.length} transactions.`);
      } catch (e) {
        setImportMessage(`Could not read that file: ${(e as Error).message}`);
      }
    };
    reader.readAsText(file);
  }

  function handleCsvImport(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const result = importTransactionsCsv(String(reader.result), {
        categories,
        wallets,
        defaultWalletPk: settings.primaryWalletPk,
      });
      // Categories invented during the parse must land before the transactions
      // that reference them, or those rows render as uncategorised.
      for (const category of result.categories) upsertCategory(category);
      if (result.transactions.length > 0) upsertTransactions(result.transactions);
      setImportMessage(
        `Imported ${result.transactions.length} transactions` +
          (result.categories.length > 0 ? `, created ${result.categories.length} categor${result.categories.length === 1 ? "y" : "ies"}` : "") +
          "." +
          (result.skipped > 0 ? ` Skipped ${result.skipped} unreadable row(s).` : ""),
      );
    };
    reader.readAsText(file);
  }

  return (
    <>
      <Section title="Appearance">
        <Card>
          <Field label="Theme">
            <SegmentedTabs
              value={settings.theme}
              onChange={(theme) => updateSettings({ theme })}
              options={[
                { value: "system", label: "System" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
            />
          </Field>

          <Field label="Accent colour">
            <div className="flex flex-wrap gap-2">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => updateSettings({ accentColour: c })}
                  aria-label={`Accent ${c}`}
                  className={cn(
                    "h-8 w-8 rounded-full transition-transform",
                    settings.accentColour === c &&
                      "ring-2 ring-label ring-offset-2 ring-offset-bg-secondary",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </Field>

          <Toggle
            checked={settings.showDecimals}
            onChange={(showDecimals) => updateSettings({ showDecimals })}
            label="Show decimals"
            description="Display the minor units on every amount."
          />
          <Toggle
            checked={settings.hideAmounts}
            onChange={(hideAmounts) => updateSettings({ hideAmounts })}
            label="Hide amounts"
            description="Blur every figure until you hover or tap it."
          />
          <Toggle
            checked={settings.animatedBudgetBackground}
            onChange={(animatedBudgetBackground) => updateSettings({ animatedBudgetBackground })}
            label="Animated budget background"
          />
        </Card>
      </Section>

      <Section title="Money">
        <Card>
          <Field
            label="Primary account"
            hint="Its currency is used for every combined total in the app."
          >
            <SelectInput
              value={settings.primaryWalletPk}
              onChange={(e) => updateSettings({ primaryWalletPk: e.target.value })}
            >
              {wallets.map((w) => (
                <option key={w.walletPk} value={w.walletPk}>
                  {w.name} ({getCurrencyInfo(w.currency)?.code.toUpperCase()})
                </option>
              ))}
            </SelectInput>
          </Field>

          <Toggle
            checked={settings.accountLabel}
            onChange={(accountLabel) => updateSettings({ accountLabel })}
            label="Account label"
            description="Show the account name on every transaction."
          />
          <Toggle
            checked={settings.currencyLabel}
            onChange={(currencyLabel) => updateSettings({ currencyLabel })}
            label="Currency label"
            description="Show the currency alongside the account name."
          />
        </Card>
      </Section>

      <Section title="Exchange rates">
        <Card>
          <p className="mb-3 text-caption text-label-secondary/60">
            Units per 1 USD. These are indicative offline values — edit any rate to match the one
            you want used for cross-currency totals.
          </p>
          <div className="space-y-2">
            {[...new Set(wallets.map((w) => w.currency).filter(Boolean))].map((code) => {
              const current =
                settings.exchangeRates[code as string] ??
                DEFAULT_EXCHANGE_RATES[code as string] ??
                1;
              return (
                <label key={code} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-footnote text-label-secondary">
                    {getCurrencyInfo(code)?.name ?? code}
                  </span>
                  <TextInput
                    type="number"
                    step="any"
                    value={String(current)}
                    onChange={(e) =>
                      updateSettings({
                        exchangeRates: {
                          ...settings.exchangeRates,
                          [code as string]: Number(e.target.value) || 1,
                        },
                      })
                    }
                  />
                </label>
              );
            })}
          </div>
        </Card>
      </Section>

      <Section title="Adding transactions">
        <Card>
          <Toggle
            checked={settings.askForTransactionTitle}
            onChange={(askForTransactionTitle) => updateSettings({ askForTransactionTitle })}
            label="Ask for transaction title"
            description="When adding a transaction."
          />
          <Toggle
            checked={settings.autoAddTitles}
            onChange={(autoAddTitles) => updateSettings({ autoAddTitles })}
            label="Automatically add titles"
            description="Remember which category a transaction name belongs to."
          />
          <Toggle
            checked={settings.showBalanceTransferTab}
            onChange={(showBalanceTransferTab) => updateSettings({ showBalanceTransferTab })}
            label="Transfer balance tab"
            description="Show the transfer tab on the add-transaction sheet."
          />
          <Toggle
            checked={settings.autoPayUpcoming}
            onChange={(autoPayUpcoming) => updateSettings({ autoPayUpcoming })}
            label="Automatically pay upcoming"
            description="Past-due upcoming transactions get paid automatically."
          />
          <Toggle
            checked={settings.autoPaySubscriptions}
            onChange={(autoPaySubscriptions) => updateSettings({ autoPaySubscriptions })}
            label="Automatically pay subscriptions"
            description="Past-due subscriptions get paid automatically."
          />
        </Card>
      </Section>

      <Section title="Transactions list">
        <Card>
          <Toggle
            checked={settings.transactionsGroupedByDay}
            onChange={(transactionsGroupedByDay) => updateSettings({ transactionsGroupedByDay })}
            label="Group by day"
          />
          <Field label="Sort transactions">
            <SelectInput
              value={settings.sortTransactions}
              onChange={(e) =>
                updateSettings({
                  sortTransactions: e.target.value as typeof settings.sortTransactions,
                })
              }
            >
              <option value="date-newest">Date — newest first</option>
              <option value="date-oldest">Date — oldest first</option>
              <option value="amount-highest">Amount — highest first</option>
              <option value="amount-lowest">Amount — lowest first</option>
            </SelectInput>
          </Field>
        </Card>
      </Section>

      <Section title="Home page widgets">
        <Card>
          <Toggle
            checked={settings.showNetWorth}
            onChange={(showNetWorth) => updateSettings({ showNetWorth })}
            label="Net worth"
          />
          <Toggle
            checked={settings.showWalletSwitcher}
            onChange={(showWalletSwitcher) => updateSettings({ showWalletSwitcher })}
            label="Accounts"
          />
          <Toggle
            checked={settings.showAllSpendingSummary}
            onChange={(showAllSpendingSummary) => updateSettings({ showAllSpendingSummary })}
            label="Spending summary"
          />
          <Toggle
            checked={settings.showPinnedBudgets}
            onChange={(showPinnedBudgets) => updateSettings({ showPinnedBudgets })}
            label="Budgets"
          />
          <Toggle
            checked={settings.showObjectives}
            onChange={(showObjectives) => updateSettings({ showObjectives })}
            label="Goals"
          />
          <Toggle
            checked={settings.showUpcomingTransactions}
            onChange={(showUpcomingTransactions) => updateSettings({ showUpcomingTransactions })}
            label="Overdue & upcoming"
          />
          <Toggle
            checked={settings.showCreditDebt}
            onChange={(showCreditDebt) => updateSettings({ showCreditDebt })}
            label="Lent & borrowed"
          />
          <Toggle
            checked={settings.showPolicies}
            onChange={(showPolicies) => updateSettings({ showPolicies })}
            label="Policies"
          />
          <Toggle
            checked={settings.showLineGraph}
            onChange={(showLineGraph) => updateSettings({ showLineGraph })}
            label="Trend graph"
          />
          <Toggle
            checked={settings.showHeatmap}
            onChange={(showHeatmap) => updateSettings({ showHeatmap })}
            label="Daily spending heatmap"
          />
        </Card>
      </Section>

      <Section title="Backup & data">
        <Card className="space-y-2">
          <button
            type="button"
            onClick={() =>
              download(
                `budget-backup-${new Date().toISOString().slice(0, 10)}.json`,
                JSON.stringify(exportDatabase(), null, 2),
                "application/json",
              )
            }
            className="flex w-full items-center gap-3 rounded-ios bg-fill/10 px-3 py-2.5 text-left transition-colors hover:bg-fill/15"
          >
            <DownloadSimple size={17} className="text-label-secondary" />
            <span className="flex-1">
              <span className="block text-subhead text-label">Export backup (JSON)</span>
              <span className="block text-caption text-label-secondary/60">
                Everything: accounts, categories, budgets, goals and transactions.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              download(
                `transactions-${new Date().toISOString().slice(0, 10)}.csv`,
                exportTransactionsCsv(transactions, { categories, wallets, allWallets }),
                "text/csv",
              )
            }
            className="flex w-full items-center gap-3 rounded-ios bg-fill/10 px-3 py-2.5 text-left transition-colors hover:bg-fill/15"
          >
            <DownloadSimple size={17} className="text-label-secondary" />
            <span className="flex-1">
              <span className="block text-subhead text-label">Export transactions (CSV)</span>
              <span className="block text-caption text-label-secondary/60">
                For spreadsheets. {transactions.length} row(s).
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex w-full items-center gap-3 rounded-ios bg-fill/10 px-3 py-2.5 text-left transition-colors hover:bg-fill/15"
          >
            <UploadSimple size={17} className="text-label-secondary" />
            <span className="flex-1">
              <span className="block text-subhead text-label">Restore backup (JSON)</span>
              <span className="block text-caption text-label-secondary/60">
                Replaces everything currently stored.
              </span>
            </span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleJsonImport(file);
              e.target.value = "";
            }}
          />

          <button
            type="button"
            onClick={() => csvInput.current?.click()}
            className="flex w-full items-center gap-3 rounded-ios bg-fill/10 px-3 py-2.5 text-left transition-colors hover:bg-fill/15"
          >
            <UploadSimple size={17} className="text-label-secondary" />
            <span className="flex-1">
              <span className="block text-subhead text-label">Import transactions (CSV)</span>
              <span className="block text-caption text-label-secondary/60">
                Adds to what you already have. Unknown categories are created.
              </span>
            </span>
          </button>
          <input
            ref={csvInput}
            type="file"
            accept="text/csv,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleCsvImport(file);
              e.target.value = "";
            }}
          />

          {importMessage ? (
            <p className="rounded-ios bg-green/10 px-3 py-2 text-caption text-green">
              {importMessage}
            </p>
          ) : null}

          <div className="pt-1">
            <ConfirmButton
              idleLabel="Reset all budget data"
              confirmLabel="Tap again — this cannot be undone"
              onConfirm={() => {
                resetDatabase();
                setImportMessage("Budget data reset to defaults.");
              }}
            />
          </div>
        </Card>
      </Section>

      <Section title="Currencies">
        <Card>
          <p className="text-caption text-label-secondary/60">
            {CURRENCIES.length} currencies available when creating an account. Change an
            account&apos;s currency from the Accounts screen.
          </p>
        </Card>
      </Section>

      <p className="px-1 pb-4 text-caption text-label-secondary/50">
        <ArrowCounterClockwise size={11} className="mr-1 inline" />
        These settings apply to the budget environment only and are stored separately from
        StockSensei&apos;s preferences.
      </p>
    </>
  );
}
