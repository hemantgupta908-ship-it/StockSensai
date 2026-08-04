import "server-only";

import type {
  Candle,
  CandleInterval,
  CandleRequest,
  Fundamentals,
  Instrument,
  MarketDataProvider,
  Quote,
} from "./types";
import { isNseCashMarketOpen } from "./mock-provider";
import { createLimiter, createRateLimiter, withRetry } from "./rate-limit";
import { SECTOR_STATS, SEED_BY_TICKER, SEED_INSTRUMENTS } from "./seed/instruments";

/**
 * Yahoo Finance provider — real NSE/BSE prices and fundamentals, no account.
 *
 * WHY THIS EXISTS: brokerage APIs (Angel One, Kite, Upstox) are execution APIs.
 * They carry prices but no fundamentals, which leaves all five long-term
 * strategies unable to run. Yahoo carries both, needs no credentials, and
 * covers NSE (`.NS`) and BSE (`.BO`).
 *
 * IMPORTANT CAVEATS — read before using this beyond personal research:
 *
 *  - These endpoints are **undocumented and unofficial**. Yahoo's terms of
 *    service restrict scraping and redistribution, and they have progressively
 *    locked endpoints down (the batch-quote endpoint is already dead). This is
 *    fine for a personal, educational tool; it is not a basis for a commercial
 *    product. For that, licence a real feed.
 *  - Prices are **delayed**, typically ~15 minutes for Indian exchanges. That
 *    is acceptable here because the app recomputes after the close, but it
 *    means the intraday strategies describe a session that has already moved.
 *  - There is no uptime guarantee and the response shape can change without
 *    notice. Everything below is defensive for that reason.
 */

const CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const SUMMARY_BASE = "https://query2.finance.yahoo.com/v10/finance/quoteSummary";
const CRUMB_URL = "https://query2.finance.yahoo.com/v1/test/getcrumb";

/**
 * Cookie sources, in priority order.
 *
 * `fc.yahoo.com` answers 404 but *does* issue the `A3` session cookie, and it
 * does so reliably. The finance.yahoo.com page returns 200 yet frequently sets
 * no cookies at all, so it is a fallback rather than the primary — seeding from
 * it alone makes the handshake fail intermittently.
 */
const COOKIE_SEED_URLS = [
  "https://fc.yahoo.com",
  "https://finance.yahoo.com/quote/RELIANCE.NS",
];

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

/** NIFTY 50. Must be URL-encoded — the caret is not safe in a path. */
const BENCHMARK_SYMBOL = "^NSEI";

/**
 * A full cold screen is roughly 150 requests (daily + intraday + summary +
 * dividends per instrument), so these settings largely determine first-load
 * time. Yahoo tolerates this comfortably; raise further at your own risk.
 */
const RATE_LIMIT_RPS = Number(process.env.YAHOO_RPS ?? 35);
const CONCURRENCY = Number(process.env.YAHOO_CONCURRENCY ?? 25);

/** Yahoo `range` values wide enough to satisfy each interval's bar count. */
const RANGE_FOR_INTERVAL: Record<CandleInterval, string> = {
  "1m": "5d",
  "5m": "1mo",
  "15m": "1mo",
  "30m": "1mo",
  "1h": "3mo",
  "1d": "2y",
};

const YAHOO_INTERVAL: Record<CandleInterval, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h",
  "1d": "1d",
};

// --------------------------------------------------------------- response types

interface YahooChartMeta {
  currency?: string;
  symbol?: string;
  exchangeName?: string;
  instrumentType?: string;
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  regularMarketTime?: number;
  gmtoffset?: number;
}

interface YahooChartResult {
  meta: YahooChartMeta;
  timestamp?: number[];
  indicators?: {
    quote?: {
      open?: (number | null)[];
      high?: (number | null)[];
      low?: (number | null)[];
      close?: (number | null)[];
      volume?: (number | null)[];
    }[];
  };
  events?: {
    dividends?: Record<string, { amount?: number; date?: number }>;
  };
}

interface RawNumber {
  raw?: number;
  fmt?: string;
}

interface YahooSummary {
  summaryDetail?: {
    trailingPE?: RawNumber;
    dividendYield?: RawNumber;
    payoutRatio?: RawNumber;
    marketCap?: RawNumber;
  };
  defaultKeyStatistics?: {
    priceToBook?: RawNumber;
    trailingEps?: RawNumber;
    bookValue?: RawNumber;
  };
  financialData?: {
    returnOnEquity?: RawNumber;
    debtToEquity?: RawNumber;
    revenueGrowth?: RawNumber;
    earningsGrowth?: RawNumber;
    ebitda?: RawNumber;
  };
  summaryProfile?: { sector?: string; industry?: string };
  incomeStatementHistory?: {
    incomeStatementHistory?: {
      endDate?: RawNumber;
      totalRevenue?: RawNumber;
      operatingIncome?: RawNumber;
      netIncome?: RawNumber;
      ebit?: RawNumber;
      interestExpense?: RawNumber;
    }[];
  };
  balanceSheetHistory?: {
    balanceSheetStatements?: {
      totalAssets?: RawNumber;
      totalCurrentLiabilities?: RawNumber;
      totalStockholderEquity?: RawNumber;
    }[];
  };
}

// ------------------------------------------------------------------- helpers

const num = (value: RawNumber | undefined): number =>
  typeof value?.raw === "number" && Number.isFinite(value.raw) ? value.raw : NaN;

/** Compound annual growth rate from an oldest-first series. */
function cagr(series: number[]): number {
  const clean = series.filter((v) => Number.isFinite(v) && v > 0);
  if (clean.length < 2) return NaN;
  const years = clean.length - 1;
  return (Math.pow(clean[clean.length - 1] / clean[0], 1 / years) - 1) * 100;
}

function median(values: number[]): number {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (clean.length === 0) return NaN;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

/**
 * Yahoo stamps a daily bar at the session's opening instant. The rest of the
 * app keys daily bars to midnight UTC of the IST session date, so normalise —
 * otherwise session grouping and chart rendering disagree by a few hours.
 */
function toSessionDate(epochSeconds: number): number {
  const ist = new Date((epochSeconds + 19800) * 1000);
  return Math.floor(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) / 1000,
  );
}

/**
 * Provider-specific symbol fixes.
 *
 * Corporate actions rename tickers and Yahoo follows its own timeline. Keeping
 * the map here rather than editing the curated universe means the demo data
 * keeps its familiar names while live lookups still resolve.
 *
 * - TATAMOTORS: the group demerged, and Yahoo now lists the passenger-vehicle
 *   entity as TMPV. The old symbol returns "may be delisted".
 */
const SYMBOL_OVERRIDES: Record<string, string> = {
  TATAMOTORS: "TMPV.NS",
};

/** NSE trades in `.NS`, BSE in `.BO`. */
function toYahooSymbol(ticker: string, exchange: string): string {
  return SYMBOL_OVERRIDES[ticker] ?? `${ticker}${exchange === "BSE" ? ".BO" : ".NS"}`;
}

// ------------------------------------------------------------------ provider

export class YahooMarketDataProvider implements MarketDataProvider {
  readonly name = "yahoo";
  readonly isLive = true;

  private readonly pace = createRateLimiter(RATE_LIMIT_RPS);
  private readonly limit = createLimiter(CONCURRENCY);

  private cookie: string | null = null;
  private crumb: string | null = null;
  private crumbPromise: Promise<void> | null = null;

  /** Chart responses cached per symbol+interval for the current session date. */
  private chartCache = new Map<string, { day: string; result: YahooChartResult }>();
  private fundamentalsCache = new Map<string, { day: string; value: Fundamentals | null }>();
  /** Sector medians computed from the universe, primed once per day. */
  private sectorMedians: { day: string; stats: Map<string, { pe: number; pb: number }> } | null =
    null;
  private primingPromise: Promise<void> | null = null;

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  // ------------------------------------------------------------ transport

  private async fetchJson<T>(url: string, useCrumb: boolean): Promise<T | null> {
    return withRetry(
      () =>
        this.limit(() =>
          this.pace(async () => {
            const headers: Record<string, string> = {
              "User-Agent": USER_AGENT,
              Accept: "application/json",
            };
            if (useCrumb && this.cookie) headers.Cookie = this.cookie;

            const response = await fetch(url, { headers, cache: "no-store" });

            if (response.status === 401 || response.status === 403) {
              // Crumb expired or was never valid — force a fresh handshake.
              this.crumb = null;
              this.cookie = null;
              throw new Error(`Yahoo returned ${response.status} (crumb/cookie rejected)`);
            }
            if (response.status === 429) throw new Error("Yahoo rate limited (429)");
            if (!response.ok) throw new Error(`Yahoo returned ${response.status}`);

            return (await response.json()) as T;
          }),
        ),
      { label: url.split("?")[0], attempts: 3 },
    ).catch((error) => {
      // Include the symbol — a bare status code is useless when 37 instruments
      // are in flight and only one of them is failing.
      console.error(
        `[yahoo] ${decodeURIComponent(url.split("?")[0].split("/").pop() ?? "")}: ${(error as Error).message}`,
      );
      return null;
    });
  }

  /**
   * Yahoo gates `quoteSummary` behind a cookie + crumb pair. Price endpoints
   * don't need it, so this is only performed lazily when fundamentals are asked
   * for.
   */
  private async ensureCrumb(): Promise<void> {
    if (this.crumb && this.cookie) return;
    this.crumbPromise ??= (async () => {
      try {
        const jar = new Map<string, string>();

        for (const seedUrl of COOKIE_SEED_URLS) {
          try {
            const seed = await fetch(seedUrl, {
              headers: {
                "User-Agent": USER_AGENT,
                Accept: "text/html,application/xhtml+xml",
                "Accept-Language": "en-US,en;q=0.9",
              },
              redirect: "follow",
            });
            // A non-2xx status is fine — fc.yahoo.com 404s and still sets A3.
            for (const line of seed.headers.getSetCookie?.() ?? []) {
              const [pair] = line.split(";");
              const index = pair.indexOf("=");
              if (index > 0) jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
            }
          } catch {
            // Try the next source.
          }
          if (jar.size > 0) break;
        }

        if (jar.size === 0) throw new Error("no cookies returned from any seed URL");
        this.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

        const crumbResponse = await fetch(CRUMB_URL, {
          headers: { "User-Agent": USER_AGENT, Cookie: this.cookie, Accept: "*/*" },
        });
        const crumb = (await crumbResponse.text()).trim();
        if (!crumbResponse.ok || !crumb || crumb.length > 40 || crumb.includes("<")) {
          throw new Error(`unexpected crumb response: ${crumb.slice(0, 40)}`);
        }
        this.crumb = crumb;
      } catch (error) {
        console.error(
          `[yahoo] crumb handshake failed — fundamentals unavailable: ${(error as Error).message}`,
        );
        this.crumb = null;
        this.cookie = null;
      } finally {
        this.crumbPromise = null;
      }
    })();
    return this.crumbPromise;
  }

  // --------------------------------------------------------------- charts

  private async getChart(
    symbol: string,
    interval: CandleInterval,
  ): Promise<YahooChartResult | null> {
    const key = `${symbol}:${interval}`;
    const day = this.today();
    const hit = this.chartCache.get(key);
    if (hit && hit.day === day) return hit.result;

    const url =
      `${CHART_BASE}/${encodeURIComponent(symbol)}` +
      `?range=${RANGE_FOR_INTERVAL[interval]}&interval=${YAHOO_INTERVAL[interval]}` +
      `&events=div%2Csplit&includePrePost=false`;

    const payload = await this.fetchJson<{
      chart?: { result?: YahooChartResult[]; error?: { description?: string } | null };
    }>(url, false);

    const result = payload?.chart?.result?.[0] ?? null;
    if (!result) {
      const message = payload?.chart?.error?.description;
      if (message) console.warn(`[yahoo] ${symbol} chart error: ${message}`);
      return null;
    }

    this.chartCache.set(key, { day, result });
    return result;
  }

  /** Convert a chart response into candles, dropping Yahoo's null-padded bars. */
  private static toCandles(result: YahooChartResult, interval: CandleInterval): Candle[] {
    const stamps = result.timestamp ?? [];
    const q = result.indicators?.quote?.[0];
    if (!q) return [];

    const candles: Candle[] = [];
    for (let i = 0; i < stamps.length; i++) {
      const open = q.open?.[i];
      const high = q.high?.[i];
      const low = q.low?.[i];
      const close = q.close?.[i];
      // Yahoo pads gaps with nulls; a bar missing any leg is unusable.
      if (
        open == null ||
        high == null ||
        low == null ||
        close == null ||
        !Number.isFinite(open) ||
        !Number.isFinite(close)
      ) {
        continue;
      }
      candles.push({
        time: interval === "1d" ? toSessionDate(stamps[i]) : stamps[i],
        open: Number(open.toFixed(2)),
        high: Number(high.toFixed(2)),
        low: Number(low.toFixed(2)),
        close: Number(close.toFixed(2)),
        volume: Number(q.volume?.[i] ?? 0),
      });
    }
    return candles;
  }

  // ---------------------------------------------------------- instruments

  /**
   * The curated universe defines *which* stocks are screened; Yahoo supplies
   * their data. Sector, index membership and market cap stay with the curated
   * list because Yahoo's sector taxonomy is US-centric and its index membership
   * for Indian names is unreliable.
   */
  async listInstruments(): Promise<Instrument[]> {
    return SEED_INSTRUMENTS.map(({ sim, ...instrument }) => {
      void sim;
      return { ...instrument, providerToken: toYahooSymbol(instrument.ticker, instrument.exchange) };
    });
  }

  async getInstrument(ticker: string): Promise<Instrument | null> {
    const seed = SEED_BY_TICKER.get(ticker.toUpperCase());
    if (!seed) return null;
    const { sim, ...instrument } = seed;
    void sim;
    return { ...instrument, providerToken: toYahooSymbol(instrument.ticker, instrument.exchange) };
  }

  // --------------------------------------------------------------- quotes

  /**
   * Quotes come from the daily chart's `meta` block rather than a quote
   * endpoint — Yahoo's batch-quote API now rejects unauthenticated clients, and
   * the engine already needs the daily chart for candles, so this is free.
   */
  async getQuote(ticker: string): Promise<Quote | null> {
    const instrument = await this.getInstrument(ticker);
    if (!instrument) return null;

    const symbol = toYahooSymbol(instrument.ticker, instrument.exchange);
    const result = await this.getChart(symbol, "1d");
    if (!result) return null;

    const meta = result.meta;
    const candles = YahooMarketDataProvider.toCandles(result, "1d");
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];

    const price = meta.regularMarketPrice ?? last?.close;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? prev?.close ?? price;
    if (!Number.isFinite(price) || !Number.isFinite(prevClose) || !price) return null;

    return {
      ticker: instrument.ticker,
      exchange: instrument.exchange,
      price: Number(price.toFixed(2)),
      change: Number((price - prevClose).toFixed(2)),
      changePercent: Number((((price - prevClose) / prevClose) * 100).toFixed(2)),
      open: last?.open ?? price,
      high: meta.regularMarketDayHigh ?? last?.high ?? price,
      low: meta.regularMarketDayLow ?? last?.low ?? price,
      prevClose: Number(prevClose.toFixed(2)),
      volume: meta.regularMarketVolume ?? last?.volume ?? 0,
      week52High: meta.fiftyTwoWeekHigh ?? Math.max(...candles.slice(-250).map((c) => c.high)),
      week52Low: meta.fiftyTwoWeekLow ?? Math.min(...candles.slice(-250).map((c) => c.low)),
      updatedAt: new Date((meta.regularMarketTime ?? Date.now() / 1000) * 1000).toISOString(),
    };
  }

  async getQuotes(tickers: string[]): Promise<Quote[]> {
    const quotes = await Promise.all(tickers.map((t) => this.getQuote(t)));
    return quotes.filter((q): q is Quote => q !== null);
  }

  // -------------------------------------------------------------- candles

  async getCandles(request: CandleRequest): Promise<Candle[]> {
    const instrument = await this.getInstrument(request.ticker);
    if (!instrument) return [];
    const symbol = toYahooSymbol(instrument.ticker, instrument.exchange);
    const result = await this.getChart(symbol, request.interval);
    if (!result) return [];
    return YahooMarketDataProvider.toCandles(result, request.interval).slice(-request.limit);
  }

  async getBenchmarkCandles(limit: number): Promise<Candle[]> {
    const result = await this.getChart(BENCHMARK_SYMBOL, "1d");
    if (!result) return [];
    return YahooMarketDataProvider.toCandles(result, "1d").slice(-limit);
  }

  // --------------------------------------------------------- fundamentals

  /**
   * Fetch fundamentals for the whole universe once, then compute real sector
   * medians from it. Comparing a stock's P/E against its actual peer group is
   * the entire premise of the value screen, so the medians have to come from
   * the same data as the ratios, not a hardcoded table.
   */
  private async primeSectorMedians(): Promise<void> {
    const day = this.today();
    if (this.sectorMedians?.day === day) return;

    this.primingPromise ??= (async () => {
      try {
        const instruments = await this.listInstruments();
        const rows = await Promise.all(
          instruments.map(async (instrument) => ({
            sector: instrument.sector,
            summary: await this.fetchSummary(instrument.ticker),
          })),
        );

        const bySector = new Map<string, { pe: number[]; pb: number[] }>();
        for (const { sector, summary } of rows) {
          if (!summary) continue;
          const bucket = bySector.get(sector) ?? { pe: [], pb: [] };
          bucket.pe.push(num(summary.summaryDetail?.trailingPE));
          bucket.pb.push(num(summary.defaultKeyStatistics?.priceToBook));
          bySector.set(sector, bucket);
        }

        const stats = new Map<string, { pe: number; pb: number }>();
        for (const [sector, bucket] of bySector) {
          // Below three peers a median says nothing; fall back to the table.
          if (bucket.pe.filter(Number.isFinite).length < 3) continue;
          stats.set(sector, { pe: median(bucket.pe), pb: median(bucket.pb) });
        }

        this.sectorMedians = { day, stats };
      } finally {
        this.primingPromise = null;
      }
    })();

    return this.primingPromise;
  }

  private summaryCache = new Map<string, { day: string; value: YahooSummary | null }>();

  private async fetchSummary(ticker: string): Promise<YahooSummary | null> {
    const day = this.today();
    const hit = this.summaryCache.get(ticker);
    if (hit && hit.day === day) return hit.value;

    await this.ensureCrumb();
    if (!this.crumb) return null;

    const instrument = await this.getInstrument(ticker);
    if (!instrument) return null;
    const symbol = toYahooSymbol(instrument.ticker, instrument.exchange);

    const modules = [
      "summaryDetail",
      "defaultKeyStatistics",
      "financialData",
      "summaryProfile",
      "incomeStatementHistory",
      "balanceSheetHistory",
    ].join(",");

    const url =
      `${SUMMARY_BASE}/${encodeURIComponent(symbol)}` +
      `?modules=${modules}&crumb=${encodeURIComponent(this.crumb)}`;

    const payload = await this.fetchJson<{
      quoteSummary?: { result?: YahooSummary[]; error?: unknown };
    }>(url, true);

    const value = payload?.quoteSummary?.result?.[0] ?? null;
    this.summaryCache.set(ticker, { day, value });
    return value;
  }

  async getFundamentals(ticker: string): Promise<Fundamentals | null> {
    const symbol = ticker.toUpperCase();
    const day = this.today();
    const cached = this.fundamentalsCache.get(symbol);
    if (cached && cached.day === day) return cached.value;

    const seed = SEED_BY_TICKER.get(symbol);
    if (!seed) return null;

    void this.primeSectorMedians();
    const summary = await this.fetchSummary(symbol);
    if (!summary) {
      this.fundamentalsCache.set(symbol, { day, value: null });
      return null;
    }

    const quote = await this.getQuote(symbol);
    const price = quote?.price ?? NaN;

    // Income statement is newest-first from Yahoo; the engine wants oldest-first.
    const income = (summary.incomeStatementHistory?.incomeStatementHistory ?? [])
      .slice()
      .reverse();
    const balance = (summary.balanceSheetHistory?.balanceSheetStatements ?? []).slice().reverse();

    const revenues = income.map((y) => num(y.totalRevenue));
    const netIncomes = income.map((y) => num(y.netIncome));
    const operatingIncomes = income.map((y) => num(y.operatingIncome));

    const operatingMarginTrend = income
      .map((y, i) =>
        Number.isFinite(operatingIncomes[i]) && revenues[i] > 0
          ? Number(((operatingIncomes[i] / revenues[i]) * 100).toFixed(1))
          : NaN,
      )
      .filter(Number.isFinite)
      .slice(-3);

    // ₹ crore, matching the rest of the app's convention.
    const profitHistory = netIncomes
      .filter(Number.isFinite)
      .map((v) => Number((v / 1e7).toFixed(0)));

    const latest = income[income.length - 1];
    const latestBalance = balance[balance.length - 1];

    const ebit = num(latest?.ebit);
    const interestExpense = Math.abs(num(latest?.interestExpense));
    const interestCoverage =
      Number.isFinite(ebit) && interestExpense > 0 ? ebit / interestExpense : 40;

    const eps = num(summary.defaultKeyStatistics?.trailingEps);
    const bookValue = num(summary.defaultKeyStatistics?.bookValue);

    // Yahoo reports RoE as a fraction and D/E as a percentage. Both need
    // converting, and getting either wrong silently inverts a screen.
    const roeRaw = num(summary.financialData?.returnOnEquity);
    const roe = Number.isFinite(roeRaw)
      ? roeRaw * 100
      : Number.isFinite(eps) && bookValue > 0
        ? (eps / bookValue) * 100
        : NaN;

    const debtToEquityRaw = num(summary.financialData?.debtToEquity);
    const debtToEquity = Number.isFinite(debtToEquityRaw) ? debtToEquityRaw / 100 : NaN;

    // RoCE ≈ EBIT / (total assets − current liabilities).
    const totalAssets = num(latestBalance?.totalAssets);
    const currentLiabilities = num(latestBalance?.totalCurrentLiabilities);
    const capitalEmployed = totalAssets - currentLiabilities;
    const roce =
      Number.isFinite(ebit) && capitalEmployed > 0
        ? (ebit / capitalEmployed) * 100
        : Number.isFinite(roe) && Number.isFinite(debtToEquity)
          ? roe / (1 + 0.42 * debtToEquity)
          : NaN;

    const dividendYield = num(summary.summaryDetail?.dividendYield) * 100;
    const payoutRatio = num(summary.summaryDetail?.payoutRatio) * 100;
    const dividendHistory = await this.getDividendHistory(symbol);

    const fallbackSector = SECTOR_STATS[seed.sector] ?? { pe: 25, pb: 4 };
    const sectorStat = this.sectorMedians?.stats.get(seed.sector) ?? fallbackSector;

    const revenueCagr3y = cagr(revenues);
    const earningsCagr3y = cagr(netIncomes);

    const value: Fundamentals = {
      ticker: symbol,
      peRatio: num(summary.summaryDetail?.trailingPE),
      pbRatio: num(summary.defaultKeyStatistics?.priceToBook),
      sectorPe: Number.isFinite(sectorStat.pe) ? sectorStat.pe : fallbackSector.pe,
      sectorPb: Number.isFinite(sectorStat.pb) ? sectorStat.pb : fallbackSector.pb,
      roe,
      roce,
      debtToEquity,
      dividendYield: Number.isFinite(dividendYield) ? dividendYield : 0,
      dividendHistory,
      payoutRatio: Number.isFinite(payoutRatio) ? payoutRatio : 0,
      revenueCagr3y: Number.isFinite(revenueCagr3y)
        ? revenueCagr3y
        : num(summary.financialData?.revenueGrowth) * 100,
      earningsCagr3y: Number.isFinite(earningsCagr3y)
        ? earningsCagr3y
        : num(summary.financialData?.earningsGrowth) * 100,
      operatingMarginTrend:
        operatingMarginTrend.length === 3 ? operatingMarginTrend : [NaN, NaN, NaN],
      profitHistory,
      // Shareholding-pattern data is an Indian regulatory disclosure that Yahoo
      // does not carry. NaN means "unknown" — the growth screen treats it as
      // unverified rather than assuming zero pledging, which would be a lie.
      promoterHolding: NaN,
      promoterPledge: NaN,
      interestCoverage,
      // Themes are an editorial classification of our own, not market data.
      themes: seed.sim.themes,
      earningsPerShare: Number.isFinite(eps) ? eps : NaN,
      bookValuePerShare: Number.isFinite(bookValue)
        ? bookValue
        : Number.isFinite(price) && Number.isFinite(num(summary.defaultKeyStatistics?.priceToBook))
          ? price / num(summary.defaultKeyStatistics?.priceToBook)
          : NaN,
    };

    this.fundamentalsCache.set(symbol, { day, value });
    return value;
  }

  /**
   * Dividend per share by financial year, oldest first, from the chart
   * endpoint's dividend events. Indian companies commonly pay more than once a
   * year, so payouts are summed per FY (April–March) rather than taken raw.
   */
  private async getDividendHistory(ticker: string): Promise<number[]> {
    const instrument = await this.getInstrument(ticker);
    if (!instrument) return [];
    const symbol = toYahooSymbol(instrument.ticker, instrument.exchange);

    const url =
      `${CHART_BASE}/${encodeURIComponent(symbol)}?range=10y&interval=1d&events=div`;
    const payload = await this.fetchJson<{ chart?: { result?: YahooChartResult[] } }>(url, false);
    const dividends = payload?.chart?.result?.[0]?.events?.dividends;
    if (!dividends) return [];

    const byFinancialYear = new Map<number, number>();
    for (const entry of Object.values(dividends)) {
      const amount = entry?.amount;
      const date = entry?.date;
      if (!amount || !date) continue;
      const ist = new Date((date + 19800) * 1000);
      // Indian FY runs April–March; a March payout belongs to the prior FY.
      const fy = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
      byFinancialYear.set(fy, (byFinancialYear.get(fy) ?? 0) + amount);
    }

    return [...byFinancialYear.entries()]
      .sort((a, b) => a[0] - b[0])
      .slice(-6)
      .map(([, total]) => Number(total.toFixed(2)));
  }

  isMarketOpen(): boolean {
    return isNseCashMarketOpen();
  }
}
