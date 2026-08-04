/**
 * Diagnostic: for each seeded scenario, print the raw indicator readings the
 * corresponding strategy keys off, so it's obvious whether the generator is
 * producing the pattern or the strategy is failing to see it.
 *
 *   npx tsx scripts/debug-scenarios.ts
 */
import { SEED_INSTRUMENTS } from "@/lib/market-data/seed/instruments";
import {
  generateBenchmarkCandles,
  generateDailyCandles,
  generateIntradayCandles,
} from "@/lib/market-data/seed/generate";
import {
  atr,
  averageVolume,
  bollinger,
  bullishReversalCandle,
  closes,
  crossedAbove,
  crossedAboveLevel,
  ema,
  findPriceZones,
  groupBySession,
  last,
  macd,
  percentChange,
  rsi,
  sessionVwap,
  swingLows,
} from "@/lib/indicators";

const benchmark = generateBenchmarkCandles(320);
const benchReturn5 = percentChange(closes(benchmark), 5);
console.log(`NIFTY 5-session return: ${benchReturn5.toFixed(2)}%\n`);

for (const seed of SEED_INSTRUMENTS) {
  const daily = generateDailyCandles(seed, 320);
  const intraday = generateIntradayCandles(seed, daily, 3);
  const price = closes(daily);
  const ema20 = ema(price, 20);
  const ema50 = ema(price, 50);
  const rsi14 = rsi(price, 14);
  const { macd: macdLine, signal } = macd(price, 12, 26, 9);
  const { upper, bandwidth } = bollinger(price, 20, 2);
  const lastC = daily[daily.length - 1];
  const prevC = daily[daily.length - 2];

  const emaCross = crossedAbove(ema20, ema50, 5);
  const macdCross = crossedAbove(macdLine, signal, 4);
  const rsiCross = crossedAboveLevel(rsi14, 30, 3);

  // consolidation tightness over the 20 bars behind the last bar
  const base = daily.slice(-21, -1);
  const bHigh = Math.max(...base.map((c) => c.high));
  const bLow = Math.min(...base.map((c) => c.low));
  const tight = ((bHigh - bLow) / bLow) * 100;

  // support zones
  const win = daily.slice(-120);
  const zones = findPriceZones(win, swingLows(win, 3), (c) => c.low, 0.02).filter((z) => z.touches >= 3);
  const nearZone = zones.find((z) => Math.abs(lastC.close - z.level) / z.level <= 0.03);

  // bollinger squeeze
  const bwRecent = bandwidth.slice(-60).filter(Number.isFinite);
  const sorted = [...bwRecent].sort((a, b) => a - b);
  const cutoff = sorted[Math.floor(sorted.length * 0.2)];
  const bwSqueeze = Math.min(...bandwidth.slice(-6, -1).filter(Number.isFinite));

  const ret5 = percentChange(price, 5);
  const gapPct = ((lastC.open - prevC.close) / prevC.close) * 100;

  // intraday: ORB + VWAP
  const sessions = groupBySession(intraday);
  const session = sessions[sessions.length - 1] ?? [];
  let orbNote = "no session";
  let vwapNote = "no session";
  if (session.length > 10) {
    const or = session.slice(0, 3);
    const orHigh = Math.max(...or.map((c) => c.high));
    const orLow = Math.min(...or.map((c) => c.low));
    const rest = session.slice(3);
    const idx = rest.findIndex((c) => c.close > orHigh || c.close < orLow);
    if (idx >= 0) {
      const bar = rest[idx];
      const prior = session.slice(0, 3 + idx);
      const avgPrior = prior.reduce((s, c) => s + c.volume, 0) / prior.length;
      const trailing5 = session.slice(Math.max(0, 3 + idx - 5), 3 + idx);
      const avgTrail = trailing5.reduce((s, c) => s + c.volume, 0) / trailing5.length;
      const held = bar.close > orHigh ? lastC.close > orHigh : lastC.close < orLow;
      orbNote = `break@${idx} volVsAll=${(bar.volume / avgPrior).toFixed(2)} volVsTrail5=${(bar.volume / avgTrail).toFixed(2)} held=${held}`;
    } else {
      orbNote = "never closed outside OR";
    }
    const vw = sessionVwap(session);
    const above = session.filter((c, i) => Number.isFinite(vw[i]) && c.close > vw[i]).length;
    const sessVol = session.reduce((s, c) => s + c.volume, 0);
    vwapNote = `above=${((above / session.length) * 100).toFixed(0)}% relVol=${(sessVol / averageVolume(daily, 20)).toFixed(2)}`;
  }

  console.log(`${seed.ticker.padEnd(11)} ${seed.sim.scenario.padEnd(22)}`);
  console.log(
    `   emaX=${String(emaCross).padStart(2)} macdX=${String(macdCross).padStart(2)} rsiX=${String(rsiCross).padStart(2)} rsi=${last(rsi14).toFixed(0)} tight=${tight.toFixed(1)}% zone=${nearZone ? `${nearZone.touches}t` : "-"} revCandle=${bullishReversalCandle(daily) ?? "-"}`,
  );
  console.log(
    `   bwSqueeze=${(bwSqueeze * 100).toFixed(2)} cutoff=${(cutoff * 100).toFixed(2)} closeVsUpper=${(lastC.close > last(upper) ? "ABOVE" : "below")} gap=${gapPct.toFixed(2)}% ret5=${ret5.toFixed(1)}% spread=${(ret5 - benchReturn5).toFixed(1)}pp atr=${last(atr(daily, 14)).toFixed(1)}`,
  );
  console.log(`   ORB: ${orbNote}   VWAP: ${vwapNote}`);
}
