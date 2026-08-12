/**
 * Card-level geometry check, run through the real feed pipeline.
 *
 * `check-geometry*.ts` assert on every signal a strategy emits. This one goes
 * through `generateFeed` — the same function `/api/recommendations` serves —
 * so it checks the mapped card shape (`buyRange` / `sellRange` / `stopLoss`)
 * rather than the raw signal, and covers the ranking and dedupe step in
 * between. Note the feed dedupes by ticker and truncates, so it sees a subset
 * of all signals: it is the weaker of the two checks and complements rather
 * than replaces them.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/check-feed-geometry.ts
 */
// Must be set before anything imports `@/lib/env`, which reads it once at
// module-evaluation time. Static `import` statements are hoisted above plain
// assignments, so the engine is pulled in dynamically below instead.
// Defaults to the seeded provider so the check is deterministic and offline;
// set MARKET_DATA_PROVIDER=yahoo to run it against live data instead.
process.env.MARKET_DATA_PROVIDER = process.env.MARKET_DATA_PROVIDER ?? "mock";

import type { RiskTolerance } from "@/lib/strategies/types";

const tolerances: RiskTolerance[] = ["conservative", "moderate", "aggressive"];

async function main() {
  const { generateFeed } = await import("@/lib/engine/recommend");
  const { TRADING_STYLES } = await import("@/lib/strategies/types");

  let cards = 0;
  const violations: string[] = [];

  for (const style of TRADING_STYLES) {
    for (const tolerance of tolerances) {
      const feed = await generateFeed(style, tolerance);
      cards += feed.recommendations.length;

      console.log(
        `${style.padEnd(11)} ${tolerance.padEnd(13)} ` +
          `cards=${String(feed.recommendations.length).padStart(3)} ` +
          `source=${feed.dataSource} live=${feed.isLiveData} universe=${feed.universeSize}`,
      );

      for (const c of feed.recommendations) {
        const where = `${style}/${tolerance}/${c.ticker}/${c.strategyId}`;
        const bands =
          `buy ${c.buyRange.low}–${c.buyRange.high} | ` +
          `sell ${c.sellRange.low}–${c.sellRange.high} | stop ${c.stopLoss}`;

        // Only bullish setups become cards, so the assertions are the bullish
        // ones the brief called for.
        if (!(c.stopLoss < c.buyRange.low)) {
          violations.push(`${where}: stopLoss not below buyRange.low — ${bands}`);
        }
        if (!(c.sellRange.low > c.buyRange.high)) {
          violations.push(`${where}: sellRange.low not above buyRange.high — ${bands}`);
        }
        if (c.direction !== "bullish") {
          violations.push(`${where}: non-bullish signal rendered as a buy card — ${bands}`);
        }
      }
    }
  }

  console.log(`\nChecked ${cards} cards.`);
  if (violations.length > 0) {
    console.log(`\n${violations.length} VIOLATION(S):`);
    for (const v of violations) console.log(`  ${v}`);
    process.exit(1);
  }
  console.log("All cards satisfy: stopLoss < buyRange.low AND sellRange.low > buyRange.high.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
