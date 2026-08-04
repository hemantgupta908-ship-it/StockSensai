import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ShieldAlert } from "lucide-react";

import { DISCLAIMER_FULL } from "@/components/disclaimer";

export const metadata: Metadata = {
  title: "Disclaimer",
  description:
    "StockPilot is an educational stock screener, not investment advice and not a brokerage.",
};

export default function DisclaimerPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <Link
        href="/home"
        className="mb-4 inline-flex items-center gap-0.5 text-body font-medium text-blue"
      >
        <ChevronLeft size={22} strokeWidth={2.4} />
        Back
      </Link>

      <div className="rounded-card border border-separator/40 bg-bg-secondary p-5 shadow-card dark:border-white/[0.06] dark:shadow-card-dark">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-amber/[0.16]">
            <ShieldAlert size={20} className="text-amber" strokeWidth={2.2} />
          </div>
          <h1 className="text-title2 font-bold tracking-tight text-label">
            Disclaimer &amp; risk disclosure
          </h1>
        </div>

        <p className="mt-4 text-subhead leading-relaxed text-label">{DISCLAIMER_FULL}</p>
      </div>

      <div className="mt-4 space-y-4">
        <Section title="What StockPilot is">
          <p>
            A screening and educational tool. It applies fifteen published, rule-based trading and
            investing strategies to price and fundamental data for companies listed on the NSE and
            BSE, and shows you which stocks currently meet each strategy&apos;s conditions — along
            with the specific numbers behind every verdict.
          </p>
        </Section>

        <Section title="What StockPilot is not">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-label">Not a broker.</strong> It cannot and does not place,
              route, modify or cancel orders. It never touches your money or your demat account.
            </li>
            <li>
              <strong className="text-label">Not an investment adviser.</strong> It is not
              registered with SEBI as an Investment Adviser or as a Research Analyst. Nothing here
              is tailored to your financial situation, goals, tax position or risk capacity,
              because the app knows none of those things.
            </li>
            <li>
              <strong className="text-label">Not a prediction.</strong> A high match score means a
              stock closely fits a strategy&apos;s historical template. It is not a probability
              that the trade will be profitable.
            </li>
          </ul>
        </Section>

        <Section title="About the numbers">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Buy and sell figures are always shown as <strong className="text-label">ranges</strong>,
              never a single price. A precise figure would imply an accuracy no screening model
              has.
            </li>
            <li>
              Stop-loss levels are where a strategy&apos;s premise is considered broken. They are
              not guarantees — gaps, circuit limits and illiquidity can all cause a fill well away
              from your intended level.
            </li>
            <li>
              Hold periods are typical durations for each strategy, not commitments or forecasts.
            </li>
            <li>
              Every strategy explainer includes a &ldquo;when it fails&rdquo; section. Please read
              it. Each of these approaches has market conditions in which it loses money reliably.
            </li>
          </ul>
        </Section>

        <Section title="Data">
          <p>
            Unless a live market data provider is configured, StockPilot runs on{" "}
            <strong className="text-label">seeded simulation data</strong> generated for
            demonstration. Feeds are labelled &ldquo;Demo data&rdquo; or &ldquo;Live data&rdquo; in
            the app so you always know which you are looking at. Simulated prices are not quotes
            and must never be relied on for any real decision. Even with a live provider connected,
            data may be delayed, incomplete or wrong.
          </p>
        </Section>

        <Section title="Before you act">
          <p>
            Do your own research. Read the company&apos;s filings. Consider your own financial
            circumstances and risk capacity, and consider consulting a{" "}
            <strong className="text-label">SEBI-registered investment adviser</strong>. Investments
            in securities are subject to market risks, including the permanent loss of capital.
            Past performance does not indicate future results.
          </p>
        </Section>
      </div>

      <p className="mt-6 text-center text-caption text-label-secondary/45">
        StockPilot · educational use only
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-separator/40 bg-bg-secondary p-5 shadow-card dark:border-white/[0.06] dark:shadow-card-dark">
      <h2 className="mb-2 text-headline font-semibold text-label">{title}</h2>
      <div className="space-y-2 text-footnote leading-relaxed text-label-secondary/75">
        {children}
      </div>
    </section>
  );
}
