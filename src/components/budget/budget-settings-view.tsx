"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useShallow } from "zustand/react/shallow";
import {
  ArrowCounterClockwise,
  BookOpen,
  CaretRight,
  Check,
  Coffee,
  DownloadSimple,
  Feather,
  Flower,
  Moon,
  MoonStars,
  Palette,
  Plant,
  Plus,
  Shapes,
  ShieldCheck,
  SignIn,
  SignOut,
  Snowflake,
  Sparkle,
  SquaresFour,
  Sun,
  SunDim,
  SunHorizon,
  Tag,
  TreeEvergreen,
  UploadSimple,
  Users,
  Wallet,
} from "@phosphor-icons/react";
import { useSession } from "@/components/auth/session-provider";

import { cn } from "@/lib/utils";
import type { BudgetDatabase } from "@/lib/budget/types";
import { POLICY_TYPE_META } from "@/lib/budget/types";
import { CURRENCIES, DEFAULT_EXCHANGE_RATES, getCurrencyInfo } from "@/lib/budget/currency";
import { getPolicySavingsTotal, getPolicyStatus } from "@/lib/budget/credit";
import { AVATAR_OPTIONS } from "@/lib/budget/defaults";
import { exportTransactionsCsv, importTransactionsCsv } from "@/lib/budget/csv";
import { PRESET_AVATARS, UserAvatar } from "./user-avatar";
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
import {
  ACCENT_PALETTES,
  type AccentPair,
  type ThemePreference,
  useTheme,
} from "@/components/theme-provider";

const THEME_OPTIONS: {
  value: ThemePreference;
  label: string;
  sublabel: string;
  Icon: any;
  bgClass: string;
}[] = [
  // Adaptive / System
  { value: "system", label: "System", sublabel: "Auto OS match", Icon: SunHorizon, bgClass: "bg-fill/10 text-label border border-separator/30" },
  
  // Trending Light Themes
  { value: "light", label: "Pure Light", sublabel: "Crisp white", Icon: Sun, bgClass: "bg-white text-slate-900 border border-slate-200 shadow-2xs" },
  { value: "nordic", label: "Nordic Frost", sublabel: "Glacier white", Icon: Snowflake, bgClass: "bg-[#F0F4F8] text-[#0F172A] border border-[#CBD5E1] shadow-2xs" },
  { value: "cream", label: "Ivory Cream", sublabel: "Warm linen", Icon: Feather, bgClass: "bg-[#FBF9F4] text-[#241E17] border border-[#E6DED2] shadow-2xs" },
  { value: "sepia", label: "Warm Sepia", sublabel: "Paper book", Icon: BookOpen, bgClass: "bg-[#F7F4EB] text-[#2C2620] border border-[#E5DFD0] shadow-2xs" },
  { value: "blush", label: "Rose Quartz", sublabel: "Cashmere pink", Icon: Flower, bgClass: "bg-[#FAF5F5] text-[#2D1F24] border border-[#E8D8D8] shadow-2xs" },
  { value: "sage", label: "Mint Dew", sublabel: "Organic matcha", Icon: Plant, bgClass: "bg-[#F2F7F4] text-[#13251C] border border-[#CBDAD0] shadow-2xs" },
  { value: "dune", label: "Solar Dune", sublabel: "Desert sand", Icon: SunDim, bgClass: "bg-[#FAF6ED] text-[#2B2317] border border-[#E4DAC8] shadow-2xs" },

  // Trending Luxury Dark Themes (Explicit text-white for 100% crystal clear contrast)
  { value: "dark", label: "Graphite Dark", sublabel: "Classic dark", Icon: Moon, bgClass: "bg-[#1C1C1E] text-white border border-white/20 shadow-xs" },
  { value: "oled", label: "OLED Black", sublabel: "Pure black", Icon: SquaresFour, bgClass: "bg-black text-white border border-white/30 shadow-xs" },
  { value: "midnight", label: "Midnight", sublabel: "Deep navy", Icon: MoonStars, bgClass: "bg-[#0B0F19] text-white border border-blue-500/50 shadow-xs" },
  { value: "forest", label: "Forest Pine", sublabel: "British racing", Icon: TreeEvergreen, bgClass: "bg-[#061510] text-white border border-emerald-500/50 shadow-xs" },
  { value: "mocha", label: "Mocha", sublabel: "Warm espresso", Icon: Coffee, bgClass: "bg-[#14100E] text-white border border-amber-500/50 shadow-xs" },
  { value: "velvet", label: "Cyber Velvet", sublabel: "Obsidian violet", Icon: Palette, bgClass: "bg-[#0F0A15] text-white border border-purple-500/50 shadow-xs" },
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
  } = useBudget(
    useShallow((s) => ({
      settings: s.settings,
      updateSettings: s.updateSettings,
      wallets: s.wallets,
      categories: s.categories,
      transactions: s.transactions,
      allWallets: s.allWallets,
      exportDatabase: s.exportDatabase,
      replaceDatabase: s.replaceDatabase,
      resetDatabase: s.resetDatabase,
      upsertTransactions: s.upsertTransactions,
      upsertCategory: s.upsertCategory,
    })),
  );

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
      for (const category of result.categories) upsertCategory(category);
      if (result.transactions.length > 0) upsertTransactions(result.transactions);
      setImportMessage(
        `Imported ${result.transactions.length} transactions` +
          (result.categories.length > 0
            ? `, created ${result.categories.length} categor${result.categories.length === 1 ? "y" : "ies"}`
            : "") +
          "." +
          (result.skipped > 0 ? ` Skipped ${result.skipped} unreadable row(s).` : ""),
      );
    };
    reader.readAsText(file);
  }

  return (
    <>
      <Section title="Organise">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card
            href="/budget/accounts"
            className="flex items-center justify-between gap-4 p-4 hover:border-accent/40 border border-transparent"
          >
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

          <Card
            href="/budget/categories"
            className="flex items-center justify-between gap-4 p-4 hover:border-accent/40 border border-transparent"
          >
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

          <Card
            href="/budget/associated-titles"
            className="flex items-center justify-between gap-4 p-4 hover:border-accent/40 border border-transparent"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fill/10 text-label-secondary">
                <Tag size={20} weight="fill" />
              </div>
              <div>
                <p className="font-semibold text-label">Associated Titles</p>
                <p className="text-caption2 text-label-secondary mt-0.5">
                  Autocomplete category from name
                </p>
              </div>
            </div>
            <CaretRight size={16} className="text-label-secondary opacity-50 shrink-0" />
          </Card>

          <Card
            href="/budget/bill-splitter"
            className="flex items-center justify-between gap-4 p-4 hover:border-accent/40 border border-transparent"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fill/10 text-label-secondary">
                <Users size={20} weight="fill" />
              </div>
              <div>
                <p className="font-semibold text-label">Bill Splitter</p>
                <p className="text-caption2 text-label-secondary mt-0.5">
                  Split a bill amongst people
                </p>
              </div>
            </div>
            <CaretRight size={16} className="text-label-secondary opacity-50 shrink-0" />
          </Card>
        </div>
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
            Units per 1 USD. These are indicative offline values — edit any rate to match the one you
            want used for cross-currency totals.
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
            onChange={(showUpcomingTransactions) =>
              updateSettings({ showUpcomingTransactions })
            }
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
            onChange={(showRecentTransactions) =>
              updateSettings({ showRecentTransactions })
            }
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
            {CURRENCIES.length} currencies available when creating an account. Change an account&apos;s
            currency from the Accounts screen.
          </p>
        </Card>
      </Section>

      <p className="px-1 pb-4 text-caption text-label-secondary/50">
        <ArrowCounterClockwise size={11} className="mr-1 inline" />
        These settings apply to the budget environment only and are stored separately from
        WealthSensei&apos;s preferences.
      </p>
    </>
  );
}

function SavingsSettingsSection() {
  const { policies, transactions, allWallets, settings, updateSettings } = useBudget(
    useShallow((s) => ({
      policies: s.policies,
      transactions: s.transactions,
      allWallets: s.allWallets,
      settings: s.settings,
      updateSettings: s.updateSettings,
    })),
  );
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
                    included ? "border-accent/40 bg-accent/10" : "border-separator/40 hover:bg-fill/10",
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
                    {included ? <Check size={16} className="text-accent" /> : null}
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

export function ProfileSettingsSection() {
  const { settings, updateSettings } = useBudget(
    useShallow((s) => ({ settings: s.settings, updateSettings: s.updateSettings })),
  );
  const { user, signOut } = useSession();

  return (
    <Section title="Account">
      <Card className="space-y-4 p-4 border border-separator/40 dark:border-white/10 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <UserAvatar
              avatarVal={settings.userAvatar}
              email={user?.email}
              className="h-12 w-12 text-xl shadow-md ring-2 ring-accent/30 shrink-0"
            />
            <div className="min-w-0">
              <h3 className="truncate text-subhead font-bold text-label">
                {user?.email?.split("@")[0] || "Hemant Gupta"}
              </h3>
              <p className="truncate text-caption text-label-secondary/75">
                {user?.email || "hemantgupta908@gmail.com"}
              </p>
            </div>
          </div>

          {user ? (
            <button
              type="button"
              onClick={() => signOut()}
              aria-label="Sign Out"
              title="Sign Out"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red/10 hover:bg-red/20 text-red font-semibold text-caption transition-all active:scale-95 border border-red/20 shrink-0"
            >
              <SignOut size={15} weight="bold" />
              <span>Sign Out</span>
            </button>
          ) : (
            <Link
              href="/login"
              aria-label="Sign In"
              title="Sign In"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-accent text-accent-fg font-semibold text-caption shadow-sm hover:opacity-95 transition-all active:scale-95 shrink-0"
            >
              <SignIn size={15} weight="bold" />
              <span>Sign In</span>
            </Link>
          )}
        </div>

        <Field
          label={
            <span className="flex items-center justify-between w-full">
              <span>Choose Profile Icon</span>
              <span className="text-[11px] font-semibold text-accent opacity-90">
                {PRESET_AVATARS.find((a) => a.id === (settings.userAvatar || "initial"))?.label || "Letter Initial"}
              </span>
            </span>
          }
        >
          <div className="flex gap-2.5 overflow-x-auto py-1 px-1 no-scrollbar scroll-smooth overscroll-x-contain touch-pan-x items-center [scrollbar-width:none] [-webkit-overflow-scrolling:touch]">
            {PRESET_AVATARS.map((avatar) => {
              const isSelected =
                settings.userAvatar === avatar.id ||
                ((!settings.userAvatar || settings.userAvatar === "initial") &&
                  avatar.id === "initial");
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
                    "group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all shadow-2xs select-none p-0.5 border-2",
                    isSelected
                      ? "border-accent scale-105 ring-2 ring-accent/30 z-10"
                      : "border-transparent opacity-75 hover:opacity-100 hover:scale-105",
                  )}
                >
                  <UserAvatar
                    avatarVal={avatar.id}
                    email={user?.email}
                    className="h-full w-full text-sm"
                  />
                </button>
              );
            })}
          </div>
        </Field>
      </Card>
    </Section>
  );
}

export function AppearanceSettingsSection() {
  const { settings, updateSettings } = useBudget(
    useShallow((s) => ({ settings: s.settings, updateSettings: s.updateSettings })),
  );
  const {
    preference: theme,
    setPreference: setTheme,
    resolved,
    accent,
    resolvedAccent,
    activePair,
    setAccent,
  } = useTheme();

  return (
    <Section title="Appearance">
      <Card className="space-y-4 p-4">
        {/* Theme Selector */}
        <Field
          label={
            <span className="flex items-center justify-between w-full">
              <span>Theme Mode</span>
              <span className="text-[11px] font-semibold text-accent opacity-90">
                {THEME_OPTIONS.find((o) => o.value === theme)?.label || "System"} ({resolved} mode)
              </span>
            </span>
          }
        >
          <div className="flex gap-2.5 overflow-x-auto py-2 px-1 no-scrollbar scroll-smooth overscroll-x-contain touch-pan-x items-center [scrollbar-width:none] [-webkit-overflow-scrolling:touch]">
            {THEME_OPTIONS.map(({ value, label, Icon, bgClass }) => {
              const isActive = theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  className={cn(
                    "flex flex-col items-center justify-center py-2 px-3 rounded-xl transition-all text-center relative overflow-hidden select-none shrink-0 w-[105px] h-[60px] border",
                    bgClass,
                    isActive
                      ? "border-accent ring-2 ring-accent/40 shadow-sm scale-[1.03] z-10 font-bold"
                      : "hover:scale-[1.02] hover:shadow-xs",
                  )}
                >
                  <div className="flex items-center gap-1 mb-0.5">
                    <Icon size={15} weight={isActive ? "fill" : "bold"} className="shrink-0" />
                    {isActive ? (
                      <span className="flex h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                    ) : null}
                  </div>
                  <p className="text-[11px] font-bold leading-tight truncate w-full tracking-tight text-inherit">
                    {label}
                  </p>
                </button>
              );
            })}
          </div>
        </Field>

        {/* Adaptive Paired Accent Selector */}
        <Field
          label={
            <span className="flex items-center justify-between w-full">
              <span>Accent Colour — <span className="font-semibold text-label">{activePair.name}</span></span>
              <span className="text-[11px] font-mono font-normal opacity-60">
                {resolved === "dark" ? `Dark: ${activePair.dark}` : `Light: ${activePair.light}`}
              </span>
            </span>
          }
        >
          <div className="flex gap-2.5 overflow-x-auto py-2 px-1 no-scrollbar scroll-smooth overscroll-x-contain touch-pan-x items-center [scrollbar-width:none] [-webkit-overflow-scrolling:touch]">
            {ACCENT_PALETTES.map((pair) => {
              const isSelected = activePair.id === pair.id;
              const displayColor = resolved === "dark" ? pair.dark : pair.light;
              return (
                <button
                  key={pair.id}
                  type="button"
                  onClick={() => setAccent(pair.id)}
                  aria-label={`Accent ${pair.name}`}
                  title={`${pair.name} (Light: ${pair.light} | Dark: ${pair.dark})`}
                  className={cn(
                    "group relative h-9 w-16 shrink-0 rounded-xl transition-all flex items-center justify-center shadow-xs border-2 select-none",
                    isSelected
                      ? "border-label dark:border-white scale-105 shadow-md ring-2 ring-accent/30 z-10"
                      : "border-transparent opacity-80 hover:opacity-100 hover:scale-105",
                  )}
                  style={{ backgroundColor: displayColor }}
                >
                  {isSelected ? (
                    <Check size={15} weight="bold" className="text-accent-fg drop-shadow-sm" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </Field>

        {/* Live Interactive Accent & Theme Preview Card */}
        <div className="rounded-xl border border-separator/40 bg-fill/5 p-3.5 space-y-2.5 dark:border-white/10">
          <div className="flex items-center justify-between text-caption2 uppercase tracking-wide text-label-secondary/70 font-semibold">
            <span className="flex items-center gap-1.5">
              <Sparkle size={13} className="text-accent" /> Live Accent Preview
            </span>
            <span className="font-mono lowercase text-[10px] bg-fill/10 px-2 py-0.5 rounded-full text-label-secondary">
              {resolved} mode
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            {/* Primary Action Button Preview */}
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-fg shadow-sm transition-transform active:scale-95"
            >
              <span>Primary Button</span>
            </button>

            {/* Ghost / Pill Preview */}
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/35 bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">
              <span>+14.2% Growth</span>
            </span>

            {/* Selected Tab Preview */}
            <span className="inline-flex items-center rounded-lg bg-accent/20 px-2.5 py-1 text-xs font-bold text-accent">
              Active Tab
            </span>

            {/* Mini FAB button preview */}
            <div className="ml-auto relative flex items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-accent/40 blur-sm animate-pulse" />
              <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-fg shadow-sm">
                <Plus size={16} weight="bold" />
              </div>
            </div>
          </div>
        </div>

        {/* Toggles */}
        <div className="space-y-2 pt-2 border-t border-separator/30 dark:border-white/10">
          <Toggle
            checked={settings.showDecimals}
            onChange={(showDecimals) => updateSettings({ showDecimals })}
            label="Show decimals"
            description="Display minor units on amounts"
          />
          <Toggle
            checked={settings.hideAmounts}
            onChange={(hideAmounts) => updateSettings({ hideAmounts })}
            label="Hide amounts"
            description="Blur figures until hovered or tapped"
          />
          <Toggle
            checked={settings.animatedBudgetBackground}
            onChange={(animatedBudgetBackground) =>
              updateSettings({ animatedBudgetBackground })
            }
            label="Animated budget background"
          />
        </div>

        <div className="pt-2 border-t border-separator/30 dark:border-white/10">
          <DashboardHeaderAction />
        </div>
      </Card>
    </Section>
  );
}
