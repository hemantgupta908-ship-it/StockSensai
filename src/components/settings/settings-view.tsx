"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  BookOpen,
  CaretRight,
  ChartLineUp,
  List,
  Palette,
  RocketLaunch,
  Scales,
  ShieldCheck,
  Sparkle,
  SquaresFour,
  TrendUp,
  Wallet,
} from "@phosphor-icons/react";

import { usePreferences } from "@/components/preferences-provider";
import {
  AppearanceSettingsSection,
  ProfileSettingsSection,
} from "@/components/budget/budget-settings-view";
import { StorageCard } from "@/components/settings/storage-card";
import { DataSourceCard } from "@/components/settings/data-source-card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { PageContainer } from "@/components/ui/page-container";
import { SectionLabel } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  FEED_VIEW_DESCRIPTIONS,
  RISK_DESCRIPTIONS,
} from "@/lib/preferences";
import { THRESHOLD_PRESETS } from "@/lib/strategies/types";

/**
 * The whole budget settings screen, which only the "Budget" tab shows and
 * which opens on "Markets". It is the largest thing this route can reach, so
 * loading it with the tab rather than with the page keeps the default view
 * from paying for it.
 */
const BudgetSettingsView = dynamic(
  () => import("@/components/budget/budget-settings-view").then((m) => m.BudgetSettingsView),
  {
    ssr: false,
    loading: () => <div className="h-96 w-full animate-pulse rounded-card bg-fill/5" />,
  },
);

/**
 * The feed exists on the web only, so the settings that shape it do too.
 *
 * Written inline rather than imported from `@/lib/mobile/config` on purpose:
 * Next substitutes a literal for `process.env.NEXT_PUBLIC_MOBILE` at build
 * time, so a module-local `const` folds and the minifier drops the dead branch
 * entirely. See the same note in `nav-items.ts`.
 *
 * Risk tolerance is deliberately *not* gated: the stock screen ships in the
 * APK, and its analysis is resolved against these thresholds.
 */
const WEB_ONLY = process.env.NEXT_PUBLIC_MOBILE !== "1";

const SETTINGS_TABS = [
  { id: "markets", label: "Markets", icon: ChartLineUp, badge: "25", badgeColor: "bg-accent/15 text-accent" },
  { id: "appearance", label: "Appearance", icon: Palette, badge: "14", badgeColor: "bg-fill/10 text-label-secondary" },
  { id: "budget", label: "Budget & Data", icon: Wallet, badge: "Vault", badgeColor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

export function SettingsView() {
  const { riskTolerance, setRiskTolerance, feedView, setFeedView } = usePreferences();
  const [activeTab, setActiveTab] = useState<SettingsTab>("markets");

  const thresholds = THRESHOLD_PRESETS[riskTolerance];

  return (
    <PageContainer width="wide" className="space-y-5 pb-16">
      {/* 1. Compact Apple-ID Profile Header */}
      <ProfileSettingsSection />

      {/* 2. Top Domain Navigation Tabs: Option 2 - Apple iOS 18 Glassmorphic */}
      <div className="flex items-center justify-center pt-1">
        <div className="w-full sm:max-w-xl flex items-center p-1.5 rounded-[18px] bg-fill/[0.08] dark:bg-white/[0.06] border border-separator/40 dark:border-white/10 backdrop-blur-xl shadow-xs relative">
          {SETTINGS_TABS.map(({ id, label, icon: Icon, badge, badgeColor }) => {
            const isActive = activeTab === id;
            return (
              <motion.button
                key={id}
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => setActiveTab(id)}
                className={cn(
                  "flex-1 relative flex items-center justify-center gap-1.5 sm:gap-2 py-2 px-2 sm:px-3 rounded-[14px] text-subhead font-semibold transition-all select-none z-10",
                  isActive
                    ? "text-label font-bold shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
                    : "text-label-secondary/70 hover:text-label",
                )}
              >
                {isActive ? (
                  <motion.div
                    layoutId="appleIosActiveTab"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    className="absolute inset-0 rounded-[14px] bg-bg dark:bg-[#222226] ring-1 ring-black/5 dark:ring-white/15 z-[-1]"
                  />
                ) : null}
                <Icon
                  size={16}
                  weight={isActive ? "bold" : "regular"}
                  className={cn("transition-colors shrink-0", isActive ? "text-accent" : "opacity-60")}
                />
                <span className="truncate">{label}</span>
                <span
                  className={cn(
                    "hidden sm:inline-block px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold leading-none shrink-0 transition-opacity",
                    isActive ? badgeColor : "bg-fill/10 text-label-secondary opacity-60",
                  )}
                >
                  {badge}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* 3. Tab Contents */}
      {activeTab === "markets" && (
        <div className="space-y-5">
          {/* Risk Tolerance & Screening Parameters */}
          <section className="space-y-2">
            <SectionLabel>Risk Tolerance & Screening</SectionLabel>
            <div className="rounded-2xl border border-separator/40 bg-bg-secondary p-4 shadow-card dark:border-white/[0.08] dark:shadow-card-dark space-y-4">
              <SegmentedControl
                options={[
                  {
                    value: "conservative",
                    label: "Conservative",
                    icon: <ShieldCheck size={16} weight="fill" />,
                    badge: "Strict",
                    badgeColor: "bg-blue-500/15 text-blue-500",
                  },
                  {
                    value: "moderate",
                    label: "Moderate",
                    icon: <Scales size={16} weight="fill" />,
                    badge: "Balanced",
                    badgeColor: "bg-emerald-500/15 text-emerald-500",
                  },
                  {
                    value: "aggressive",
                    label: "Aggressive",
                    icon: <RocketLaunch size={16} weight="fill" />,
                    badge: "Momentum",
                    badgeColor: "bg-amber-500/15 text-amber-500",
                  },
                ]}
                value={riskTolerance}
                onChange={setRiskTolerance}
              />

              <p className="text-footnote text-label-secondary/75 leading-relaxed">
                {RISK_DESCRIPTIONS[riskTolerance]}
              </p>

              {/* 4 Core Parameter Metric Tiles */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 border-t border-separator/30 dark:border-white/5">
                <MetricTile
                  label="Min Match Score"
                  value={`${thresholds.minConfidence}/100`}
                  icon={<Sparkle size={13} className="text-accent" />}
                />
                <MetricTile
                  label="Reward : Risk"
                  value={`${thresholds.minRewardRisk} : 1`}
                  icon={<Scales size={13} className="text-emerald-500" />}
                />
                <MetricTile
                  label="Volume Surge"
                  value={`${thresholds.volumeSurgeMultiple}x`}
                  icon={<TrendUp size={13} className="text-blue-500" />}
                />
                <MetricTile
                  label="Stop Distance"
                  value={`${thresholds.stopAtrMultiple}x ATR`}
                  icon={<ShieldCheck size={13} className="text-amber-500" />}
                />
              </div>
            </div>
          </section>

          {/* Ideas Layout Density — nothing to lay out where there is no feed. */}
          {WEB_ONLY ? (
          <section className="space-y-2">
            <SectionLabel>Feed Layout</SectionLabel>
            <div className="rounded-2xl border border-separator/40 bg-bg-secondary p-4 shadow-card dark:border-white/[0.08] dark:shadow-card-dark space-y-3">
              <SegmentedControl
                options={[
                  {
                    value: "card",
                    label: "Cards",
                    icon: <SquaresFour size={16} weight="fill" />,
                    badge: "Ladder",
                  },
                  {
                    value: "list",
                    label: "Compact",
                    icon: <List size={16} weight="bold" />,
                    badge: "Dense",
                  },
                ]}
                value={feedView}
                onChange={setFeedView}
              />
              <p className="text-footnote text-label-secondary/70 leading-relaxed">
                {FEED_VIEW_DESCRIPTIONS[feedView]}
              </p>
            </div>
          </section>
          ) : null}

          {/* Android only — renders nothing on the web. */}
          <DataSourceCard />

          <StorageCard />

          {/* Grouped iOS 18 Row Navigation Card */}
          <section className="space-y-2">
            <SectionLabel>Strategies & System</SectionLabel>
            <div className="rounded-2xl border border-separator/40 bg-bg-secondary overflow-hidden shadow-card dark:border-white/[0.08] dark:shadow-card-dark divide-y divide-separator/30 dark:divide-white/5">
              <Link
                href="/strategies"
                className="flex items-center justify-between p-3.5 hover:bg-fill/5 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
                    <BookOpen size={17} weight="fill" />
                  </div>
                  <div>
                    <p className="text-subhead font-semibold text-label">Trading Strategies & Rules</p>
                    <p className="text-caption2 text-label-secondary/60">25 active algorithmic screens</p>
                  </div>
                </div>
                <CaretRight size={15} className="text-label-secondary/50 group-hover:translate-x-0.5 transition-transform" />
              </Link>

              <Link
                href="/disclaimer"
                className="flex items-center justify-between p-3.5 hover:bg-fill/5 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-500">
                    <ShieldCheck size={17} weight="fill" />
                  </div>
                  <div>
                    <p className="text-subhead font-semibold text-label">SEBI Disclaimer & Risk Disclosures</p>
                    <p className="text-caption2 text-label-secondary/60">Educational non-advisory notice</p>
                  </div>
                </div>
                <CaretRight size={15} className="text-label-secondary/50 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </section>
        </div>
      )}

      {activeTab === "appearance" && <AppearanceSettingsSection />}

      {activeTab === "budget" && <BudgetSettingsView />}
    </PageContainer>
  );
}

function MetricTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="p-2.5 rounded-xl bg-fill/5 border border-separator/20 dark:border-white/5 space-y-0.5">
      <div className="flex items-center justify-between text-[11px] font-medium text-label-secondary/70">
        <span className="truncate">{label}</span>
        {icon}
      </div>
      <p className="text-subhead font-bold text-label font-mono">{value}</p>
    </div>
  );
}
