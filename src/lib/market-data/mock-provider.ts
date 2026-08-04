import type {
  Candle,
  CandleInterval,
  CandleRequest,
  Fundamentals,
  Instrument,
  MarketDataProvider,
  Quote,
} from "./types";
import { SEED_BY_TICKER, SEED_INSTRUMENTS, type SeedInstrument } from "./seed/instruments";
import {
  generateBenchmarkCandles,
  generateDailyCandles,
  generateFundamentals,
  generateIntradayCandles,
  TRADING_DAYS,
} from "./seed/generate";

/**
 * Mock provider backed by deterministic seeded data.
 *
 * This is the default provider so the app is fully functional with no API keys.
 * Generation is memoised per process and keyed by the trading date, so the
 * series is stable within a day and refreshes when the market date rolls over.
 */

interface CachedSeries {
  daily: Candle[];
  intraday: Candle[];
  fundamentals: Fundamentals;
  quote: Quote;
}

const seriesCache = new Map<string, CachedSeries>();
let benchmarkCache: { key: string; candles: Candle[] } | null = null;

/** Cache key includes the session date so a new day produces fresh data. */
function cacheKey(ticker: string): string {
  return `${ticker}:${new Date().toISOString().slice(0, 10)}`;
}

function buildQuote(seed: SeedInstrument, daily: Candle[]): Quote {
  const last = daily[daily.length - 1];
  const prev = daily[daily.length - 2] ?? last;
  const window52w = daily.slice(-250);

  return {
    ticker: seed.ticker,
    exchange: seed.exchange,
    price: last.close,
    change: Number((last.close - prev.close).toFixed(2)),
    changePercent: Number((((last.close - prev.close) / prev.close) * 100).toFixed(2)),
    open: last.open,
    high: last.high,
    low: last.low,
    prevClose: prev.close,
    volume: last.volume,
    week52High: Number(Math.max(...window52w.map((c) => c.high)).toFixed(2)),
    week52Low: Number(Math.min(...window52w.map((c) => c.low)).toFixed(2)),
    updatedAt: new Date(last.time * 1000).toISOString(),
  };
}

function loadSeries(seed: SeedInstrument): CachedSeries {
  const key = cacheKey(seed.ticker);
  const hit = seriesCache.get(key);
  if (hit) return hit;

  const daily = generateDailyCandles(seed, TRADING_DAYS);
  const intraday = generateIntradayCandles(seed, daily, 3);
  const quote = buildQuote(seed, daily);
  const fundamentals = generateFundamentals(seed, quote.price);

  const series: CachedSeries = { daily, intraday, fundamentals, quote };

  // Keep the cache from growing without bound across date rollovers.
  if (seriesCache.size > SEED_INSTRUMENTS.length * 2) seriesCache.clear();
  seriesCache.set(key, series);
  return series;
}

/** Aggregate 5-minute bars up to a coarser interval. */
function resample(bars: Candle[], factor: number): Candle[] {
  if (factor <= 1) return bars;
  const out: Candle[] = [];
  for (let i = 0; i < bars.length; i += factor) {
    const chunk = bars.slice(i, i + factor);
    if (chunk.length === 0) continue;
    out.push({
      time: chunk[0].time,
      open: chunk[0].open,
      high: Math.max(...chunk.map((c) => c.high)),
      low: Math.min(...chunk.map((c) => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((sum, c) => sum + c.volume, 0),
    });
  }
  return out;
}

const INTERVAL_FACTOR: Record<Exclude<CandleInterval, "1d">, number> = {
  "1m": 1, // the generator's finest granularity is 5m; 1m returns the same bars
  "5m": 1,
  "15m": 3,
  "30m": 6,
  "1h": 12,
};

function getSeedOrDynamic(ticker: string): SeedInstrument {
  const sym = ticker.trim().toUpperCase();
  const hit = SEED_BY_TICKER.get(sym);
  if (hit) return hit;

  return {
    ticker: sym,
    name: `${sym} Ltd`,
    exchange: "NSE",
    isin: `INE${sym.slice(0, 3).padStart(3, "0")}01018`,
    sector: "Diversified",
    industry: "Indian Equities",
    marketCapCr: 45_000,
    indices: [],
    sim: {
      basePrice: 450,
      annualVol: 0.32,
      annualDrift: 0.18,
      avgVolume: 4_500_000,
      scenario: "ema-golden-cross",
      archetype: "quality-growth",
      pe: 22.5,
      pb: 3.4,
      roe: 18.0,
      debtToEquity: 0.3,
      dividendYield: 1.1,
      themes: ["Retail Consumption"],
    },
  };
}

export class MockMarketDataProvider implements MarketDataProvider {
  readonly name = "mock";
  readonly isLive = false;

  constructor() {
    for (const seed of SEED_INSTRUMENTS) {
      loadSeries(seed);
    }
  }

  async listInstruments(): Promise<Instrument[]> {
    return SEED_INSTRUMENTS.map(stripSim);
  }

  async getInstrument(ticker: string): Promise<Instrument | null> {
    const seed = getSeedOrDynamic(ticker);
    return stripSim(seed);
  }

  async getQuote(ticker: string): Promise<Quote | null> {
    const seed = SEED_BY_TICKER.get(ticker.toUpperCase());
    if (!seed) return null;
    return loadSeries(seed).quote;
  }

  async getQuotes(tickers: string[]): Promise<Quote[]> {
    return tickers.map((t) => {
      const seed = getSeedOrDynamic(t);
      return loadSeries(seed).quote;
    });
  }

  async getCandles(req: CandleRequest): Promise<Candle[]> {
    const seed = getSeedOrDynamic(req.ticker);
    const series = loadSeries(seed);

    if (req.interval === "1d") {
      return series.daily.slice(-req.limit);
    }

    const factor = INTERVAL_FACTOR[req.interval] ?? 1;
    const resampled = resample(series.intraday, factor);
    return resampled.slice(-req.limit);
  }

  async getFundamentals(ticker: string): Promise<Fundamentals | null> {
    const seed = getSeedOrDynamic(ticker);
    return loadSeries(seed).fundamentals;
  }

  async getBenchmarkCandles(limit: number): Promise<Candle[]> {
    const key = new Date().toISOString().slice(0, 10);
    if (!benchmarkCache || benchmarkCache.key !== key) {
      benchmarkCache = { key, candles: generateBenchmarkCandles(TRADING_DAYS) };
    }
    return benchmarkCache.candles.slice(-limit);
  }

  isMarketOpen(): boolean {
    return isNseCashMarketOpen();
  }
}

function stripSim(seed: SeedInstrument): Instrument {
  const { sim, ...instrument } = seed;
  void sim;
  return instrument;
}

/**
 * NSE cash market hours: 09:15–15:30 IST, Monday to Friday.
 * Trading holidays are not modelled — a live provider would supply them.
 */
export function isNseCashMarketOpen(now = new Date()): boolean {
  const istMinutes = getIstMinutesOfDay(now);
  const istDay = getIstDayOfWeek(now);
  if (istDay === 0 || istDay === 6) return false;
  return istMinutes >= 9 * 60 + 15 && istMinutes <= 15 * 60 + 30;
}

function getIstMinutesOfDay(date: Date): number {
  const istMs = date.getTime() + 5.5 * 60 * 60 * 1000;
  const ist = new Date(istMs);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

function getIstDayOfWeek(date: Date): number {
  const istMs = date.getTime() + 5.5 * 60 * 60 * 1000;
  return new Date(istMs).getUTCDay();
}
