/**
 * Regenerate the screening universe from NSE's official Nifty 200 constituent list.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/build-universe.ts
 *
 * Source of truth is `data/ind_nifty200list.csv`, downloaded from
 * nsearchives.nseindia.com. It supplies the only four fields that must be
 * exactly right because they identify a real security or are shown as fact:
 * symbol, company name, NSE sector, and ISIN.
 *
 * Entries already hand-curated in the existing seed file are preserved verbatim
 * — their `sim` blocks were tuned so the demo produces a realistic spread of
 * setups, and regenerating them would throw that away. Only genuinely new
 * tickers get generated blocks.
 *
 * What is NOT invented here: market capitalisation. Curated entries keep their
 * researched figure; new entries get `marketCapCr: 0`, which the UI reads as
 * "unknown" and hides. A plausible-looking fabricated market cap shown next to
 * a real company name is the kind of number a user would reasonably believe.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  SEED_INSTRUMENTS,
  type FundamentalArchetype,
  type SeedInstrument,
  type TechnicalScenario,
} from "@/lib/market-data/seed/instruments";

export {};

const CSV_PATH = resolve("data/ind_nifty200list.csv");
const OUT_PATH = resolve("src/lib/market-data/seed/instruments.generated.ts");

/** NSE's own sector labels, mapped onto the names the app already uses. */
const SECTOR_ALIASES: Record<string, string> = {
  "Automobile and Auto Components": "Automobile",
  "Oil Gas & Consumable Fuels": "Oil, Gas & Consumable Fuels",
};

/**
 * Simulation profiles per sector.
 *
 * Every number below drives the *seeded demo* only — the live provider replaces
 * all of it with real data. They exist so a generated stock behaves like others
 * in its sector rather than like a uniform random walk.
 */
const SECTOR_SIM: Record<
  string,
  { vol: number; drift: number; pe: number; pb: number; roe: number; de: number; dy: number }
> = {
  "Information Technology": { vol: 0.26, drift: 0.11, pe: 27.5, pb: 8.2, roe: 24, de: 0.1, dy: 1.8 },
  "Financial Services": { vol: 0.28, drift: 0.13, pe: 17.8, pb: 2.6, roe: 16, de: 1.4, dy: 1.1 },
  "Oil, Gas & Consumable Fuels": { vol: 0.3, drift: 0.09, pe: 14.2, pb: 1.9, roe: 13, de: 0.6, dy: 2.4 },
  "Fast Moving Consumer Goods": { vol: 0.2, drift: 0.1, pe: 45, pb: 10.5, roe: 28, de: 0.15, dy: 1.9 },
  Automobile: { vol: 0.31, drift: 0.14, pe: 24, pb: 4.1, roe: 18, de: 0.5, dy: 1.2 },
  Healthcare: { vol: 0.27, drift: 0.12, pe: 31, pb: 4.6, roe: 17, de: 0.25, dy: 0.7 },
  "Metals & Mining": { vol: 0.36, drift: 0.07, pe: 12.5, pb: 1.7, roe: 12, de: 0.75, dy: 2.8 },
  Power: { vol: 0.29, drift: 0.11, pe: 16, pb: 2.2, roe: 13, de: 1.1, dy: 2.1 },
  "Capital Goods": { vol: 0.33, drift: 0.16, pe: 38, pb: 6.4, roe: 19, de: 0.35, dy: 0.6 },
  "Construction Materials": { vol: 0.28, drift: 0.1, pe: 35, pb: 4.2, roe: 14, de: 0.4, dy: 0.9 },
  Telecommunication: { vol: 0.3, drift: 0.12, pe: 42, pb: 7.8, roe: 11, de: 1.6, dy: 0.5 },
  "Consumer Durables": { vol: 0.29, drift: 0.13, pe: 52, pb: 12, roe: 21, de: 0.3, dy: 0.7 },
  Services: { vol: 0.3, drift: 0.12, pe: 26, pb: 3.8, roe: 17, de: 0.4, dy: 1 },
  "Consumer Services": { vol: 0.32, drift: 0.14, pe: 48, pb: 9, roe: 19, de: 0.45, dy: 0.5 },
  Realty: { vol: 0.38, drift: 0.12, pe: 34, pb: 3.6, roe: 12, de: 0.7, dy: 0.4 },
  Chemicals: { vol: 0.31, drift: 0.09, pe: 29, pb: 4, roe: 15, de: 0.4, dy: 0.8 },
  Construction: { vol: 0.32, drift: 0.13, pe: 27, pb: 3.4, roe: 15, de: 0.8, dy: 0.9 },
  Textiles: { vol: 0.34, drift: 0.08, pe: 22, pb: 2.6, roe: 12, de: 0.7, dy: 1 },
};

const DEFAULT_SIM = { vol: 0.3, drift: 0.11, pe: 25, pb: 4, roe: 15, de: 0.5, dy: 1 };

/**
 * Spread of technical scenarios assigned to generated names.
 *
 * Weighted so roughly a fifth land on `choppy` and `downtrend`, matching the
 * curated set's intent that not every stock in the demo produces a signal.
 */
const SCENARIOS: TechnicalScenario[] = [
  "ema-golden-cross",
  "oversold-bounce",
  "range-breakout",
  "support-bounce",
  "macd-bull-cross",
  "strong-uptrend",
  "bb-squeeze-breakout",
  "gap-up-continuation",
  "overbought-fade",
  "choppy",
  "downtrend",
  "choppy",
];

const ARCHETYPES: FundamentalArchetype[] = [
  "quality-growth",
  "deep-value",
  "dividend-payer",
  "high-growth",
  "thematic-growth",
  "cyclical",
  "expensive-quality",
  "leveraged",
];

/** Deterministic hash, so re-running produces an identical file. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Deterministic value in [min, max) derived from a ticker and a field name. */
function vary(ticker: string, field: string, min: number, max: number): number {
  const h = hash(`${ticker}:${field}`);
  return min + ((h % 1000) / 1000) * (max - min);
}

function round(value: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

interface CsvRow {
  name: string;
  sector: string;
  ticker: string;
  isin: string;
}

function parseCsv(): CsvRow[] {
  const text = readFileSync(CSV_PATH, "utf8").replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: CsvRow[] = [];

  for (const line of lines.slice(1)) {
    // Company names contain commas inside quotes in some NSE exports.
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === "," && !inQuotes) {
        cells.push(current);
        current = "";
      } else current += ch;
    }
    cells.push(current);

    const [name, sector, ticker, series, isin] = cells.map((c) => c.trim());
    if (!ticker || !isin || series !== "EQ") continue;
    rows.push({ name, sector: SECTOR_ALIASES[sector] ?? sector, ticker, isin });
  }
  return rows;
}

function generateSim(row: CsvRow): SeedInstrument["sim"] {
  const profile = SECTOR_SIM[row.sector] ?? DEFAULT_SIM;
  const t = row.ticker;

  return {
    basePrice: round(vary(t, "price", 120, 3200), 2),
    annualVol: round(profile.vol * vary(t, "vol", 0.75, 1.3), 3),
    annualDrift: round(profile.drift * vary(t, "drift", -0.6, 1.9), 3),
    avgVolume: Math.round(vary(t, "vol.qty", 200_000, 6_000_000)),
    scenario: SCENARIOS[hash(`${t}:scenario`) % SCENARIOS.length],
    archetype: ARCHETYPES[hash(`${t}:archetype`) % ARCHETYPES.length],
    pe: round(profile.pe * vary(t, "pe", 0.55, 1.7), 1),
    pb: round(profile.pb * vary(t, "pb", 0.5, 1.7), 2),
    roe: round(profile.roe * vary(t, "roe", 0.55, 1.5), 1),
    debtToEquity: round(profile.de * vary(t, "de", 0.3, 1.9), 2),
    dividendYield: round(profile.dy * vary(t, "dy", 0.2, 1.8), 2),
    themes: [],
    // Simulation-only stand-in for the real market cap this app does not know.
    // Never shown in the UI; used purely to derive believable demo profits.
    marketCapCr: Math.round(vary(t, "mcap", 12_000, 320_000) / 500) * 500,
  };
}

function serialiseSim(sim: SeedInstrument["sim"], indent: string): string {
  const themes =
    sim.themes.length > 0
      ? `[${sim.themes.map((t) => JSON.stringify(t)).join(", ")}]`
      : "[]";
  const lines = [
    `basePrice: ${sim.basePrice}`,
    `annualVol: ${sim.annualVol}`,
    `annualDrift: ${sim.annualDrift}`,
    `avgVolume: ${sim.avgVolume}`,
    `scenario: ${JSON.stringify(sim.scenario)}`,
    `archetype: ${JSON.stringify(sim.archetype)}`,
    `pe: ${sim.pe}`,
    `pb: ${sim.pb}`,
    `roe: ${sim.roe}`,
    `debtToEquity: ${sim.debtToEquity}`,
    `dividendYield: ${sim.dividendYield}`,
    `themes: ${themes}`,
  ];
  if (sim.marketCapCr !== undefined) lines.push(`marketCapCr: ${sim.marketCapCr}`);
  return lines.map((l) => `${indent}${l},`).join("\n");
}

function serialise(instrument: SeedInstrument): string {
  const i = "    ";
  const parts = [
    `  {`,
    `${i}ticker: ${JSON.stringify(instrument.ticker)},`,
    `${i}name: ${JSON.stringify(instrument.name)},`,
    `${i}exchange: ${JSON.stringify(instrument.exchange)},`,
    `${i}isin: ${JSON.stringify(instrument.isin)},`,
    `${i}sector: ${JSON.stringify(instrument.sector)},`,
    `${i}industry: ${JSON.stringify(instrument.industry)},`,
    `${i}marketCapCr: ${instrument.marketCapCr},`,
    `${i}indices: [${instrument.indices.map((x) => JSON.stringify(x)).join(", ")}],`,
  ];
  if (instrument.providerToken) {
    parts.push(`${i}providerToken: ${JSON.stringify(instrument.providerToken)},`);
  }
  parts.push(`${i}sim: {`, serialiseSim(instrument.sim, `${i}  `), `${i}},`, `  },`);
  return parts.join("\n");
}

function main() {
  const rows = parseCsv();
  const existing = new Map(SEED_INSTRUMENTS.map((i) => [i.ticker, i]));

  const universe: SeedInstrument[] = [];
  let preserved = 0;
  let added = 0;

  for (const row of rows) {
    const curated = existing.get(row.ticker);

    if (curated) {
      preserved++;
      universe.push({
        ...curated,
        // NSE is authoritative for these; the curated copy can drift.
        name: curated.name,
        isin: row.isin,
        indices: curated.indices.includes(NIFTY200)
          ? curated.indices
          : [...curated.indices, NIFTY200],
      });
      continue;
    }

    added++;
    universe.push({
      ticker: row.ticker,
      name: row.name,
      exchange: "NSE",
      isin: row.isin,
      sector: row.sector,
      // NSE's constituent file publishes only the macro sector. Repeating it
      // here is honest about what is known; a guessed sub-industry would show
      // up in the portfolio's sector breakdown as though it were researched.
      industry: row.sector,
      marketCapCr: 0,
      indices: [NIFTY200],
      sim: generateSim(row),
    });
  }

  // Curated names that have since dropped out of the Nifty 200 keep their slot:
  // a user may hold one, and losing it would blank their journal's metadata.
  const inUniverse = new Set(universe.map((i) => i.ticker));
  let retained = 0;
  for (const curated of SEED_INSTRUMENTS) {
    if (inUniverse.has(curated.ticker)) continue;
    retained++;
    universe.push(curated);
  }

  universe.sort((a, b) => a.ticker.localeCompare(b.ticker));

  const body = universe.map(serialise).join("\n");
  const header = `// GENERATED FILE — do not edit by hand.
//
// Rebuild with:
//   npx tsx --tsconfig scripts/tsconfig.json scripts/build-universe.ts
//
// Source: data/ind_nifty200list.csv (NSE official Nifty 200 constituents).
// Ticker, name, sector and ISIN come from that file. Entries carrying a
// non-zero marketCapCr were hand-researched; a zero means "not known", and the
// UI hides the figure rather than showing a guess.
//
// Everything under \`sim\` is simulation input for the seeded demo provider and
// is replaced wholesale by the live provider. It is not market data.

import type { SeedInstrument } from "./instruments";

export const NIFTY200_UNIVERSE: SeedInstrument[] = [
${body}
];
`;

  writeFileSync(OUT_PATH, header, "utf8");

  console.log(`Nifty 200 constituents parsed : ${rows.length}`);
  console.log(`  curated entries preserved   : ${preserved}`);
  console.log(`  new entries generated       : ${added}`);
  console.log(`  off-index names retained    : ${retained}`);
  console.log(`  total universe              : ${universe.length}`);
  console.log(`\nwrote ${OUT_PATH}`);
}

const NIFTY200 = "NIFTY 200";

main();
