import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, X } from "@phosphor-icons/react/dist/ssr";

import { ALL_STRATEGIES, getStrategy } from "@/lib/strategies";
import { TRADING_STYLE_LABELS } from "@/lib/strategies/types";
import { NavBar } from "@/components/ui/nav-bar";
import { Badge, RiskBadge } from "@/components/ui/badge";
import { CONTAINER_WIDTHS } from "@/components/ui/page-container";
import { DisclaimerNotice } from "@/components/disclaimer";
import { cn } from "@/lib/utils";

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Pre-renders every explainer page at build time — they are fully static. */
export function generateStaticParams() {
  return ALL_STRATEGIES.map((strategy) => ({ id: strategy.id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const strategy = getStrategy(id);
  if (!strategy) return { title: "Strategy not found" };
  return {
    title: strategy.name,
    description: strategy.explainer.summary,
  };
}

export default async function StrategyPage({ params }: PageProps) {
  const { id } = await params;
  const strategy = getStrategy(id);
  if (!strategy) notFound();

  const { explainer } = strategy;

  return (
    <>
      <NavBar title={strategy.name} showBack width="prose" />

      <main className={cn("mx-auto space-y-4 pt-1", CONTAINER_WIDTHS.prose)}>
        {/* Header */}
        <header className="rounded-card border border-separator/40 bg-bg-secondary p-4 shadow-card dark:border-white/[0.06] dark:shadow-card-dark">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="blue">{TRADING_STYLE_LABELS[strategy.style]}</Badge>
            <RiskBadge level={strategy.baseRisk} />
            <Badge tone="neutral">{strategy.holdPeriodLabel}</Badge>
          </div>
          <h1 className="mt-3 text-title2 font-bold tracking-tight text-label">{strategy.name}</h1>
          <p className="mt-2 text-subhead leading-relaxed text-label-secondary/75">
            {explainer.summary}
          </p>
        </header>

        {/* Origin */}
        <Section title="Where it comes from">
          <p className="text-footnote leading-relaxed text-label-secondary/75">
            {explainer.origin}
          </p>
        </Section>

        {/* How it works */}
        <Section title="How it works">
          <div className="space-y-3">
            {explainer.howItWorks.map((paragraph, index) => (
              <div key={index} className="flex gap-3">
                <span className="numeric mt-[3px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue/[0.14] text-caption2 font-bold text-blue">
                  {index + 1}
                </span>
                <p className="text-footnote leading-relaxed text-label-secondary/75">
                  {paragraph}
                </p>
              </div>
            ))}
          </div>
        </Section>

        {/* Conditions */}
        <Section title="What has to be true">
          <ul className="space-y-2">
            {explainer.signalConditions.map((condition) => (
              <li key={condition} className="flex items-start gap-2.5">
                <span className="mt-[3px] flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full bg-green/[0.16] text-green">
                  <Check size={10}  weight="duotone" />
                </span>
                <span className="text-footnote leading-relaxed text-label-secondary/75">
                  {condition}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-caption leading-snug text-label-secondary/50">
            Conditions marked required in a live signal must all hold or the strategy produces
            nothing. The rest contribute to the match score.
          </p>
        </Section>

        {/* Entry / exit */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Section title="Entry logic">
            <p className="text-footnote leading-relaxed text-label-secondary/75">
              {explainer.entryLogic}
            </p>
          </Section>
          <Section title="Exit logic">
            <p className="text-footnote leading-relaxed text-label-secondary/75">
              {explainer.exitLogic}
            </p>
          </Section>
        </div>

        {/* Works / fails */}
        <Section title="When it works">
          <ul className="space-y-2">
            {explainer.worksBestWhen.map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span className="mt-[3px] flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full bg-green/[0.16] text-green">
                  <Check size={10}  weight="duotone" />
                </span>
                <span className="text-footnote leading-relaxed text-label-secondary/75">{item}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="When it fails">
          <ul className="space-y-2">
            {explainer.failsWhen.map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span className="mt-[3px] flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full bg-red/[0.16] text-red">
                  <X size={10}  weight="duotone" />
                </span>
                <span className="text-footnote leading-relaxed text-label-secondary/75">{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-caption leading-snug text-label-secondary/50">
            Every strategy has conditions under which it loses money. A screen that never lists
            these is selling something.
          </p>
        </Section>

        {/* Indicators */}
        <Section title="Indicators used">
          <div className="flex flex-wrap gap-1.5">
            {explainer.indicators.map((indicator) => (
              <span
                key={indicator}
                className="rounded-full bg-fill/[0.10] px-2.5 py-1 text-caption font-medium text-label-secondary/70 dark:bg-white/[0.08]"
              >
                {indicator}
              </span>
            ))}
          </div>
        </Section>

        <DisclaimerNotice />
      </main>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-separator/40 bg-bg-secondary p-4 shadow-card dark:border-white/[0.06] dark:shadow-card-dark">
      <h2 className="mb-2.5 text-footnote font-semibold uppercase tracking-wide text-label-secondary/55">
        {title}
      </h2>
      {children}
    </section>
  );
}
