/**
 * Market data domain types.
 *
 * These are provider-agnostic on purpose — Angel One, Kite and Upstox all
 * return wildly different shapes, and everything above this layer (strategies,
 * recommendation engine, UI) is written against these types only.
 */

/** Indian exchanges only. Anything else is rejected at the data layer. */
export type Exchange = "NSE" | "BSE";

export const SUPPORTED_EXCHANGES: readonly Exchange[] = ["NSE", "BSE"] as const;

export function isIndianExchange(value: string): value is Exchange {
  return (SUPPORTED_EXCHANGES as readonly string[]).includes(value);
}

export interface Instrument {
  /** Trading symbol without series suffix, e.g. "RELIANCE". */
  ticker: string;
  name: string;
  exchange: Exchange;
  /** Indian ISIN — always starts with "INE"/"INF" for Indian issuers. */
  isin: string;
  sector: string;
  industry: string;
  /** Market capitalisation in ₹ crore. */
  marketCapCr: number;
  /** Index memberships, e.g. ["NIFTY 50", "NIFTY BANK"]. */
  indices: string[];
  /** Provider-specific instrument id (Angel One symboltoken, Kite instrument_token). */
  providerToken?: string;
}

/** A single OHLCV bar. `time` is epoch **seconds** (Lightweight Charts' native unit). */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Quote {
  ticker: string;
  exchange: Exchange;
  price: number;
  /** Absolute change vs previous close, in ₹. */
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  week52High: number;
  week52Low: number;
  /** ISO timestamp of the last update. */
  updatedAt: string;
}

/**
 * Fundamentals used by the long-term strategies. All ratios are trailing
 * twelve months unless the field name says otherwise.
 */
export interface Fundamentals {
  ticker: string;
  peRatio: number;
  pbRatio: number;
  /** Sector median P/E, used for relative-value comparisons. */
  sectorPe: number;
  sectorPb: number;
  /** Return on equity, percent. */
  roe: number;
  /** Return on capital employed, percent. */
  roce: number;
  debtToEquity: number;
  /** Dividend yield, percent. */
  dividendYield: number;
  /** Dividend per share for the last 6 financial years, oldest first. */
  dividendHistory: number[];
  /** Payout ratio, percent. */
  payoutRatio: number;
  /** 3-year revenue CAGR, percent. */
  revenueCagr3y: number;
  /** 3-year earnings CAGR, percent. */
  earningsCagr3y: number;
  /** Operating margin for the last 3 financial years, oldest first (percent). */
  operatingMarginTrend: number[];
  /** Net profit for the last 5 financial years in ₹ crore, oldest first. */
  profitHistory: number[];
  /** Promoter holding, percent. */
  promoterHolding: number;
  /** Promoter shares pledged, percent of promoter holding. */
  promoterPledge: number;
  /** Interest coverage ratio (EBIT / interest expense). */
  interestCoverage: number;
  /** Structural growth themes this business is exposed to. */
  themes: string[];
  earningsPerShare: number;
  bookValuePerShare: number;
}

export type CandleInterval = "1m" | "5m" | "15m" | "30m" | "1h" | "1d" | "1wk" | "1mo";

export interface CandleRequest {
  ticker: string;
  interval: CandleInterval;
  /** Number of bars to return, most recent last. */
  limit: number;
}

/**
 * The contract every market data source must satisfy.
 *
 * Implementations MUST return only NSE/BSE-listed Indian instruments; the
 * registry additionally filters results as a defence-in-depth measure.
 */
export interface MarketDataProvider {
  /** Stable identifier used in logs and the settings screen. */
  readonly name: string;
  /** False when the provider is a simulation, so the UI can badge it. */
  readonly isLive: boolean;

  listInstruments(): Promise<Instrument[]>;
  /**
   * Optional warm-up run once before a full-universe screen.
   *
   * For work that is only worth doing when every instrument is about to be
   * fetched anyway — computing real sector medians, for instance. Anything
   * expensive enough to belong here must *not* be triggered lazily by a
   * single-stock request: providers share one rate limiter, so a universe-sized
   * warm-up fired from a detail page puts hundreds of requests ahead of the one
   * the user is waiting on.
   */
  prepareUniverse?(): Promise<void>;
  getInstrument(ticker: string): Promise<Instrument | null>;

  getQuote(ticker: string): Promise<Quote | null>;
  getQuotes(tickers: string[]): Promise<Quote[]>;

  getCandles(request: CandleRequest): Promise<Candle[]>;

  getFundamentals(ticker: string): Promise<Fundamentals | null>;

  /** Daily candles for the benchmark index (NIFTY 50), for relative strength. */
  getBenchmarkCandles(limit: number): Promise<Candle[]>;

  /** Whether the NSE cash market is currently open (IST 09:15–15:30, Mon–Fri). */
  isMarketOpen(): boolean;
}

/** Bundle of everything the strategy engine needs about one stock. */
export interface StockDataBundle {
  instrument: Instrument;
  quote: Quote;
  daily: Candle[];
  weekly: Candle[];
  monthly: Candle[];
  intraday: Candle[];
  /**
   * Null when the active provider has no fundamentals feed (brokerage APIs
   * generally don't). Long-term strategies return no signal in that case
   * rather than guessing.
   */
  fundamentals: Fundamentals | null;
  benchmarkDaily: Candle[];
}
