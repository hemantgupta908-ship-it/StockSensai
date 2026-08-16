/**
 * How many stocks each strategy admits, per risk tolerance.
 *
 * Answers the question a blank feed raises: is the screen correctly selective,
 * or is something structural rejecting setups that should have fired? A gate
 * that is working shows a rising count from conservative to aggressive. A
 * strategy that returns zero at *every* tolerance is not being strict — its
 * conditions are unsatisfiable against this universe, which is a bug in the
 * strategy rather than a verdict about the market.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/diagnose-screen-yield.ts
 *   MARKET_DATA_PROVIDER=yahoo npx tsx ... scripts/diagnose-screen-yield.ts
 */
process.env.MARKET_DATA_PROVIDER = process.env.MARKET_DATA_PROVIDER ?? "mock";

import type { RiskTolerance, TradingStyle } from "@/lib/strategies/types";

export {};

const TOLERANCES: RiskTolerance[] = ["conservative", "moderate", "aggressive"];

async function main() {
  const { getUniverseBundles } = await import("@/lib/market-data");
  const { ALL_STRATEGIES } = await import("@/lib/strategies");
  const { THRESHOLD_PRESETS } = await import("@/lib/strategies/types");

  const bundles = await getUniverseBundles();
  console.log(`universe: ${bundles.length} instruments\n`);

  const header = `${"strategy".padEnd(34)}${"style".padEnd(12)}` +
    TOLERANCES.map((t) => t.slice(0, 5).padStart(7)).join("");
  console.log(header);
  console.log("-".repeat(header.length));

  const dead: string[] = [];
  const byStyle = new Map<TradingStyle, number[]>();

  for (const strategy of ALL_STRATEGIES) {
    const counts = TOLERANCES.map((tolerance) => {
      const thresholds = THRESHOLD_PRESETS[tolerance];
      let fired = 0;
      for (const bundle of bundles) {
        try {
          const signal = strategy.evaluate({ bundle, thresholds });
          if (signal && signal.direction === "bullish") fired++;
        } catch {
          // A throwing strategy is its own bug; the engine already logs it.
        }
      }
      return fired;
    });

    console.log(
      strategy.id.padEnd(34) +
        strategy.style.padEnd(12) +
        counts.map((c) => String(c).padStart(7)).join(""),
    );

    if (counts.every((c) => c === 0)) dead.push(strategy.id);

    const running = byStyle.get(strategy.style) ?? [0, 0, 0];
    byStyle.set(
      strategy.style,
      running.map((v, i) => v + counts[i]),
    );
  }

  console.log("\nsignals per style (pre-dedupe, pre-cap):");
  for (const [style, counts] of byStyle) {
    console.log(`  ${style.padEnd(12)}${counts.map((c) => String(c).padStart(7)).join("")}`);
  }

  if (dead.length > 0) {
    console.log(
      `\n${dead.length} strategy(ies) admitted nothing at any tolerance — ` +
        `check their conditions rather than the market:`,
    );
    for (const id of dead) console.log(`  ${id}`);
  } else {
    console.log("\nEvery strategy admits at least one stock at some tolerance.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
