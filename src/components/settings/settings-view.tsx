"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, FileText, List, ShieldCheck, SquaresFour } from "@phosphor-icons/react";

import { usePreferences } from "@/components/preferences-provider";
import { AppearanceSettingsSection, BudgetSettingsView, ProfileSettingsSection } from "@/components/budget/budget-settings-view";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ListFooter, ListGroup, ListRow } from "@/components/ui/list";
import { SectionLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/page-container";
import {
  FEED_VIEW_DESCRIPTIONS,
  FEED_VIEW_LABELS,
  FEED_VIEWS,
  RISK_DESCRIPTIONS,
  RISK_LABELS,
  RISK_TOLERANCES,
} from "@/lib/preferences";
import { THRESHOLD_PRESETS } from "@/lib/strategies/types";

export function SettingsView() {
  const router = useRouter();
  const { riskTolerance, setRiskTolerance, feedView, setFeedView } = usePreferences();
  const [activeTab, setActiveTab] = useState<"markets" | "budget">("markets");

  const thresholds = THRESHOLD_PRESETS[riskTolerance];

  return (
    <PageContainer width="wide" className="space-y-6">
      <ProfileSettingsSection />
      <AppearanceSettingsSection />

      <div className="pt-1">
        <SegmentedControl
          options={[
            { value: "markets", label: "StockSensei" },
            { value: "budget", label: "BudgetSensei" },
          ]}
          value={activeTab}
          onChange={(val) => setActiveTab(val as "markets" | "budget")}
        />
      </div>

      {activeTab === "markets" ? (
        <div className="space-y-6">
          {/* Risk tolerance */}
          <section>
            <SectionLabel>Risk tolerance</SectionLabel>
            <div className="rounded-card border border-separator/40 bg-bg-secondary p-4 shadow-card dark:border-white/[0.06] dark:shadow-card-dark">
              <SegmentedControl
                options={RISK_TOLERANCES.map((value) => ({ value, label: RISK_LABELS[value] }))}
                value={riskTolerance}
                onChange={setRiskTolerance}
              />
              <p className="mt-3 text-footnote leading-relaxed text-label-secondary/65">
                {RISK_DESCRIPTIONS[riskTolerance]}
              </p>

              {/* Showing the actual numbers keeps this from being a mystery dial. */}
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-separator/40 pt-3 dark:border-white/[0.06]">
                <Threshold label="Minimum match score" value={`${thresholds.minConfidence}/100`} />
                <Threshold label="Minimum reward:risk" value={`${thresholds.minRewardRisk}:1`} />
                <Threshold
                  label="Volume confirmation"
                  value={`${thresholds.volumeSurgeMultiple}x average`}
                />
                <Threshold
                  label="Stop distance"
                  value={`${thresholds.stopAtrMultiple}x ATR`}
                />
                <Threshold label="RSI oversold / overbought" value={`${thresholds.rsiOversold} / ${thresholds.rsiOverbought}`} />
                <Threshold label="Minimum RoE (long-term)" value={`${thresholds.minRoe}%`} />
              </dl>
            </div>
            <ListFooter>
              This tunes the thresholds every strategy screens against. Conservative surfaces fewer,
              higher-conviction ideas; aggressive surfaces more and earlier. It changes what you see —
              it does not change how risky any individual stock actually is.
            </ListFooter>
          </section>

          {/* Strategies */}
          <section>
            <SectionLabel>Strategies</SectionLabel>
            <ListGroup>
              <ListRow
                icon={<BookOpen size={17} />}
                title="Strategies & Screen Rules"
                subtitle="Explore how all 25 screens work, from intraday to long-term"
                href="/strategies"
              />
            </ListGroup>
          </section>

          {/* Feed layout */}
          <section>
            <SectionLabel>Ideas layout</SectionLabel>
            <div className="rounded-card border border-separator/40 bg-bg-secondary p-4 shadow-card dark:border-white/[0.06] dark:shadow-card-dark">
              <SegmentedControl
                options={FEED_VIEWS.map((value) => ({ value, label: FEED_VIEW_LABELS[value] }))}
                value={feedView}
                onChange={setFeedView}
              />
              <div className="mt-3 flex items-start gap-2 text-footnote leading-relaxed text-label-secondary/65">
                {feedView === "card" ? (
                  <SquaresFour size={15} className="mt-0.5 shrink-0" />
                ) : (
                  <List size={15} className="mt-0.5 shrink-0" />
                )}
                {FEED_VIEW_DESCRIPTIONS[feedView]}
              </div>
            </div>
            <ListFooter>
              Both views show the same screened ideas and the same numbers — only the density
              changes. Cards draw the stop, buy zone and target to scale so the reward-to-risk shape
              is visible; the list trades that picture for more ideas on screen at once.
            </ListFooter>
          </section>
        </div>
      ) : (
        <BudgetSettingsView />
      )}

      {activeTab === "markets" ? (
        <>
          {/* Legal & Disclaimer */}
          <section className="pt-2">
            <SectionLabel>About</SectionLabel>
            <ListGroup>
              <ListRow
                icon={<ShieldCheck size={17} />}
                title="Disclaimer & risk disclosure"
                subtitle="What this app is, and what it isn't"
                href="/disclaimer"
              />
              <ListRow
                icon={<FileText size={17} />}
                title="How the strategies work"
                subtitle="All 25 screens explained"
                href="/strategies"
              />
            </ListGroup>
            <ListFooter>
              WealthSensei is a screening and educational tool covering NSE and BSE listed companies. It
              is not a broker, holds no client funds, places no orders, and is not registered with SEBI
              as an Investment Adviser or Research Analyst.
            </ListFooter>
          </section>

          <div className="pt-2">
            <Button
              variant="plain"
              size="sm"
              fullWidth
              onClick={() => router.push("/disclaimer")}
              className="text-label-secondary/50"
            >
              WealthSensei · educational use only
            </Button>
          </div>
        </>
      ) : null}
    </PageContainer>
  );
}

function Threshold({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption2 text-label-secondary/50">{label}</dt>
      <dd className="numeric mt-0.5 text-footnote font-semibold text-label">{value}</dd>
    </div>
  );
}
