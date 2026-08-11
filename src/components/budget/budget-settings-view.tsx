"use client";

/**
 * Settings for the budget environment only.
 *
 * The user asked for the two environments to be configured independently, so
 * nothing here touches the stock app's preferences — this reads and writes
 * `cashew.settings` exclusively.
 */

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowCounterClockwise, BookOpen, Check, DownloadSimple, Moon, ShieldCheck, SignIn, SignOut, SquaresFour, Sun, SunHorizon, UploadSimple, Wallet, Shapes, CaretRight } from "@phosphor-icons/react";
import { useSession } from "@/components/auth/session-provider";

import { cn } from "@/lib/utils";
import type { BudgetDatabase } from "@/lib/budget/types";
import { POLICY_TYPE_META } from "@/lib/budget/types";
import { CURRENCIES, DEFAULT_EXCHANGE_RATES, getCurrencyInfo } from "@/lib/budget/currency";
import { getPolicySavingsTotal, getPolicyStatus } from "@/lib/budget/credit";
import { AVATAR_OPTIONS } from "@/lib/budget/defaults";
import { exportTransactionsCsv, importTransactionsCsv } from "@/lib/budget/csv";
import { PRESET_AVATARS, USERPICS_PACKS, UserAvatar } from "./user-avatar";
import { useBudget } from "./budget-provider";
import { DashboardHeaderAction } from "./budget-dashboard";
import {
  Amount,
  Card,
  ConfirmButton,
  Field,
  SegmentedTabs,
  Section,
  SelectInput,
  TextInput,
  Toggle,
} from "./budget-ui";

const ACCENTS: { color: string; name: string }[] = [
  { color: "#007AFF", name: "iOS Blue" },
  { color: "#34C759", name: "Emerald Green" },
  { color: "#00A896", name: "Forest Teal" },
  { color: "#30B0C7", name: "Neon Cyan" },
  { color: "#3F51B5", name: "Deep Indigo" },
  { color: "#5856D6", name: "Violet Purple" },
  { color: "#AF52DE", name: "Lavender Pink" },
  { color: "#FF2D55", name: "Rose Magenta" },
  { color: "#FF3B30", name: "Crimson Red" },
  { color: "#FF6B6B", name: "Coral Orange" },
  { color: "#FF9500", name: "Sunset Amber" },
  { color: "#FFCC00", name: "Golden Yellow" },
  { color: "#8BC34A", name: "Lime Green" },
  { color: "#607D8B", name: "Slate Gray" },
  { color: "#424242", name: "Cool Charcoal" },
  { color: "#80CBC4", name: "Soft Mint" },
  { color: "#FFAB91", name: "Warm Peach" },
  { color: "#8D6E63", name: "Deep Mocha" },
];

const THEME_OPTIONS: {
  value: "system" | "light" | "dark" | "oled" | "sepia";
  label: string;
  sublabel: string;
  Icon: any;
  bgClass: string;
}[] = [
  { value: "system", label: "System", sublabel: "Auto OS match", Icon: SunHorizon, bgClass: "bg-fill/10 text-label" },
  { value: "light", label: "Light", sublabel: "Crisp white", Icon: Sun, bgClass: "bg-white text-slate-900 border border-slate-200" },
  { value: "dark", label: "Dark", sublabel: "Muted dark", Icon: Moon, bgClass: "bg-[#1C1C1E] text-white border border-white/10" },
  { value: "oled", label: "OLED Black", sublabel: "Pitch black", Icon: SquaresFour, bgClass: "bg-black text-white border border-white/20" },
  { value: "sepia", label: "Warm Sepia", sublabel: "Eye comfort", Icon: BookOpen, bgClass: "bg-[#F7F4EB] text-[#2C2620] border border-[#E5DFD0]" },
];

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
  const { user, signOut } = useSession();

  const fileInput = useRef<HTMLInputElement>(null);
  const csvInput = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [selectedPackId, setSelectedPackId] = useState<string>("all");

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

  const selectedAccent = ACCENTS.find((a) => a.color === settings.accentColour) ?? ACCENTS[0];

  return (
    <>
      <Section title="Organise">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card href="/budget/accounts" className="flex items-center justify-between gap-4 p-4 hover:border-accent/40 border border-transparent">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fill/10 text-label-secondary">
                <Wallet size={20} weight="fill" />
              </div>
              <div>
                <p className="font-semibold text-label">Accounts</p>
                <p className="text-caption2 text-label-secondary mt-0.5">Where your money sits</p>
              </div>
            </div>
            <CaretRight size={16} className="text-label-secondary opacity-50 shrink-0" />
          </Card>
          
          <Card href="/budget/categories" className="flex items-center justify-between gap-4 p-4 hover:border-accent/40 border border-transparent">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fill/10 text-label-secondary">
                <Shapes size={20} weight="fill" />
              </div>
              <div>
                <p className="font-semibold text-label">Categories</p>
                <p className="text-caption2 text-label-secondary mt-0.5">How spending is grouped</p>
              </div>
            </div>
            <CaretRight size={16} className="text-label-secondary opacity-50 shrink-0" />
          </Card>
        </div>
      </Section>

      <Section title="Profile">
        <Card className="space-y-5 p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <UserAvatar
                avatarVal={settings.userAvatar}
                email={user?.email}
                className="h-16 w-16 text-2xl shadow-md ring-2 ring-fill/15"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-base sm:text-lg font-bold text-label">
                    {user?.email?.split("@")[0] || "Local Profile"}
                  </h3>
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">
                    <ShieldCheck size={14} weight="fill" />
                    {user ? "Signed in" : "Offline / Local"}
                  </span>
                </div>
                <p className="truncate text-footnote sm:text-subhead text-label-secondary/80 mt-1">
                  {user?.email || "All data stored safely in local browser memory"}
                </p>
              </div>
            </div>
            {user ? (
              <button
                type="button"
                onClick={() => signOut()}
                aria-label="Log Out"
                title="Log Out"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-red text-white shadow-md hover:bg-red/90 active:scale-95 transition-all shrink-0"
              >
                <SignOut size={20} weight="bold" />
              </button>
            ) : (
              <Link
                href="/login"
                aria-label="Sign In"
                title="Sign In"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-green text-white shadow-md hover:bg-green/90 active:scale-95 transition-all shrink-0"
              >
                <SignIn size={20} weight="bold" />
              </Link>
            )}
          </div>

          <Field label="Choose Avatar Pack">
            {/* Userpics Pack Filter Tabs */}
            <div className="flex gap-1 overflow-x-auto pb-1 pt-0.5 no-scrollbar snap-x">
              <button
                type="button"
                onClick={() => setSelectedPackId("all")}
                className={cn(
                  "px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all shrink-0 select-none",
                  selectedPackId === "all"
                    ? "bg-accent text-white shadow-sm"
                    : "bg-fill/10 text-label-secondary hover:bg-fill/20"
                )}
              >
                All Packs
              </button>
              {USERPICS_PACKS.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => setSelectedPackId(pack.id)}
                  className={cn(
                    "px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all shrink-0 select-none",
                    selectedPackId === pack.id
                      ? "bg-accent text-white shadow-sm"
                      : "bg-fill/10 text-label-secondary hover:bg-fill/20"
                  )}
                >
                  {pack.name}
                </button>
              ))}
            </div>

            {/* Avatar Swatches in selected pack */}
            <div className="flex gap-3.5 overflow-x-auto py-3.5 -my-2.5 px-2.5 no-scrollbar snap-x">
              {(selectedPackId === "all"
                ? PRESET_AVATARS
                : USERPICS_PACKS.find((p) => p.id === selectedPackId)?.avatars ?? PRESET_AVATARS
              ).map((avatar) => {
                const isSelected =
                  settings.userAvatar === avatar.id ||
                  settings.userAvatar === avatar.url ||
                  ((!settings.userAvatar || settings.userAvatar === "initial") && avatar.id === "initial");
                return (
                  <button
                    key={avatar.id}
                    type="button"
                    onClick={() =>
                      updateSettings({
                        userAvatar: avatar.id,
                      })
                    }
                    title={avatar.label}
                    className={cn(
                      "group relative flex h-12 w-12 shrink-0 snap-start items-center justify-center rounded-full transition-all shadow-sm select-none p-0.5",
                      isSelected
                        ? "ring-2 ring-accent ring-offset-2 ring-offset-bg-secondary scale-110 z-10"
                        : "opacity-75 hover:opacity-100 hover:scale-105"
                    )}
                  >
                    <UserAvatar
                      avatarVal={avatar.url || avatar.id}
                      email={user?.email}
                      className="h-full w-full text-base"
                    />
                  </button>
                );
              })}
            </div>
          </Field>
        </Card>
      </Section>

      <Section title="Appearance">
        <Card className="space-y-5">
          <Field label="Theme Mode">
            <div className="flex gap-2.5 overflow-x-auto pb-1 pt-1 no-scrollbar snap-x -mx-1 px-1">
              {THEME_OPTIONS.map(({ value, label, sublabel, Icon, bgClass }) => {
                const isActive = settings.theme === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => updateSettings({ theme: value })}
                    className={cn(
                      "flex flex-col items-center justify-center p-2.5 rounded-xl transition-all text-center relative overflow-hidden select-none shrink-0 w-[115px] h-[72px] snap-start",
                      bgClass,
                      isActive
                        ? "ring-2 ring-accent ring-offset-2 ring-offset-bg-secondary scale-[1.02] shadow-sm font-semibold opacity-100"
                        : "opacity-65 hover:opacity-95 hover:scale-[1.01]"
                    )}
                  >
                    <div className="flex items-center justify-center h-6 w-6 rounded-md bg-fill/10 mb-1 shrink-0">
                      <Icon size={15} />
                    </div>
                    <p className="text-caption font-semibold leading-none">{label}</p>
                    <p className="text-[9px] opacity-60 leading-tight mt-0.5 truncate max-w-full px-1">{sublabel}</p>
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label={`Accent colour — ${selectedAccent.name}`}>
            <div className="flex gap-3 overflow-x-auto pb-1.5 pt-1.5 no-scrollbar snap-x -mx-1 px-1">
              {ACCENTS.map(({ color, name }) => {
                const isActive = settings.accentColour === color;
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => updateSettings({ accentColour: color })}
                    aria-label={`Accent ${name}`}
                    title={name}
                    className={cn(
                      "group relative h-9 w-9 shrink-0 snap-start rounded-full transition-all flex items-center justify-center shadow-sm",
                      isActive
                        ? "ring-2 ring-label ring-offset-2 ring-offset-bg-secondary scale-110"
                        : "hover:scale-110 active:scale-95 opacity-90 hover:opacity-100"
                    )}
                    style={{ backgroundColor: color }}
                  >
                    {isActive ? (
                      <Check size={14} weight="bold" className="text-white drop-shadow-sm" />
                    ) : null}
                  </button>
                );
              })}
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
          <div className="pt-2 border-t border-separator/30 dark:border-white/10">
            <DashboardHeaderAction />
          </div>
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

      <SavingsSettingsSection />

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
            checked={settings.showPieChart ?? true}
            onChange={(showPieChart) => updateSettings({ showPieChart })}
            label="Category breakdown"
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
          <Toggle
            checked={settings.showRecentTransactions ?? true}
            onChange={(showRecentTransactions) => updateSettings({ showRecentTransactions })}
            label="Recent transactions"
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

/**
 * Controls for the Savings card.
 *
 * The per-policy list exists because "savings" is not true of every policy: a
 * term insurance premium buys cover and returns nothing, so counting it as
 * money you hold would overstate your position. Exclusions are stored, so a
 * policy added later counts without needing to be found in here first.
 */
function SavingsSettingsSection() {
  const { policies, transactions, allWallets, settings, updateSettings } = useBudget();
  const active = policies.filter((p) => !p.archived);
  const excluded = settings.savingsExcludedPolicyPks ?? [];

  const total = getPolicySavingsTotal(allWallets, policies, transactions, excluded);

  function toggle(policyPk: string, include: boolean) {
    updateSettings({
      savingsExcludedPolicyPks: include
        ? excluded.filter((pk) => pk !== policyPk)
        : [...new Set([...excluded, policyPk])],
    });
  }

  if (active.length === 0) return null;

  return (
    <Section title="Savings">
      <Card>
        <Toggle
          checked={settings.showSavingsCard ?? true}
          onChange={(showSavingsCard) => updateSettings({ showSavingsCard })}
          label="Show savings card"
          description="A card beside your accounts showing what policies have accumulated."
        />
        <Toggle
          checked={settings.includeSavingsInNetWorth ?? true}
          onChange={(includeSavingsInNetWorth) => updateSettings({ includeSavingsInNetWorth })}
          label="Count savings in net worth"
        />

        <div className="mt-3 border-t border-separator/40 pt-3">
          <div className="mb-2 flex items-baseline justify-between px-1">
            <p className="text-footnote font-medium text-label-secondary">Include these policies</p>
            <Amount value={total} className="text-footnote font-semibold text-label" />
          </div>
          <div className="space-y-1.5">
            {active.map((p) => {
              const included = !excluded.includes(p.policyPk);
              const paid = getPolicyStatus(p, transactions).totalPaid;
              return (
                <button
                  key={p.policyPk}
                  type="button"
                  onClick={() => toggle(p.policyPk, !included)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-ios border px-3 py-2 text-left transition-colors",
                    included ? "border-green/40 bg-green/10" : "border-separator/40 hover:bg-fill/10",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-subhead text-label">
                      {p.name || "Untitled policy"}
                    </span>
                    <span className="block text-caption text-label-secondary/60">
                      {POLICY_TYPE_META[p.type].label}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Amount value={paid} className="text-caption text-label-secondary/70" />
                    {included ? <Check size={16} className="text-green" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>
    </Section>
  );
}
