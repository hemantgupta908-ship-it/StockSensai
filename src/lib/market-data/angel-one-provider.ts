import "server-only";
import crypto from "node:crypto";

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
import { createRateLimiter, withRetry } from "./rate-limit";
import { SEED_BY_TICKER, SEED_INSTRUMENTS } from "./seed/instruments";

/**
 * Angel One SmartAPI provider.
 *
 * Activated only when `MARKET_DATA_PROVIDER=angelone` AND all four credentials
 * are present; otherwise construction throws and the caller should fall back to
 * the mock provider. Nothing here runs during a normal demo.
 *
 * Docs: https://smartapi.angelone.in/docs
 *
 * NOT WIRED TO LIVE CREDENTIALS. The request/response shapes below follow the
 * published SmartAPI contract but have not been exercised against the live
 * endpoint in this project — verify against a sandbox session before relying
 * on it, and expect to adjust the instrument-master mapping in particular.
 */

const BASE_URL = "https://apiconnect.angelone.in";
const SCRIP_MASTER_URL =
  "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json";

/** SmartAPI's interval vocabulary. */
const INTERVAL_MAP: Record<CandleInterval, string> = {
  "1m": "ONE_MINUTE",
  "5m": "FIVE_MINUTE",
  "15m": "FIFTEEN_MINUTE",
  "30m": "THIRTY_MINUTE",
  "1h": "ONE_HOUR",
  "1d": "ONE_DAY",
  "1wk": "ONE_DAY", // We fetch 1d and resample for 1wk
  "1mo": "ONE_DAY", // We fetch 1d and resample for 1mo
};

/** Approximate bars per calendar day, used to size the history window. */
const BARS_PER_DAY: Record<CandleInterval, number> = {
  "1m": 375,
  "5m": 75,
  "15m": 25,
  "30m": 13,
  "1h": 7,
  "1d": 1,
  "1wk": 0.2,
  "1mo": 0.047,
};

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

interface AngelSession {
  jwtToken: string;
  refreshToken: string;
  feedToken: string;
  expiresAt: number;
}

/**
 * Requests per second, per endpoint family.
 *
 * SmartAPI publishes separate limits for quote and historical endpoints and
 * revises them periodically — CHECK THE CURRENT DOCS before raising these. The
 * defaults below are conservative on purpose: being throttled costs a cooldown,
 * whereas being slightly slow costs nothing the caches don't absorb.
 */
const RATE_LIMITS = {
  quote: Number(process.env.ANGEL_ONE_QUOTE_RPS ?? 1),
  historical: Number(process.env.ANGEL_ONE_HISTORICAL_RPS ?? 2),
} as const;

/** SmartAPI caps how many tokens a single quote request may carry. */
const MAX_TOKENS_PER_QUOTE_REQUEST = 50;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export class AngelOneMarketDataProvider implements MarketDataProvider {
  readonly name = "angelone";
  readonly isLive = true;

  private session: AngelSession | null = null;
  private instrumentCache: Instrument[] | null = null;
  /** Separate pacers so a burst of candle requests can't starve quotes. */
  private readonly quoteLimiter = createRateLimiter(RATE_LIMITS.quote);
  private readonly historicalLimiter = createRateLimiter(RATE_LIMITS.historical);
  private readonly apiKey: string;
  private readonly clientCode: string;
  private readonly password: string;
  private readonly totpSecret: string;

  constructor() {
    this.apiKey = process.env.ANGEL_ONE_API_KEY ?? "";
    this.clientCode = process.env.ANGEL_ONE_CLIENT_CODE ?? "";
    this.password = process.env.ANGEL_ONE_PASSWORD ?? "";
    this.totpSecret = process.env.ANGEL_ONE_TOTP_SECRET ?? "";

    if (!this.apiKey || !this.clientCode || !this.password || !this.totpSecret) {
      throw new Error(
        "Angel One provider selected but credentials are incomplete. Set ANGEL_ONE_API_KEY, " +
          "ANGEL_ONE_CLIENT_CODE, ANGEL_ONE_PASSWORD and ANGEL_ONE_TOTP_SECRET, or set " +
          "MARKET_DATA_PROVIDER=mock.",
      );
    }
  }

  // ------------------------------------------------------------------ auth

  private async ensureSession(): Promise<AngelSession> {
    if (this.session && Date.now() < this.session.expiresAt) return this.session;

    const response = await fetch(
      `${BASE_URL}/rest/auth/angelbroking/user/v1/loginByPassword`,
      {
        method: "POST",
        headers: this.baseHeaders(),
        body: JSON.stringify({
          clientcode: this.clientCode,
          password: this.password,
          totp: generateTotp(this.totpSecret),
        }),
      },
    );

    const payload = await response.json();
    if (!response.ok || !payload?.status || !payload?.data?.jwtToken) {
      throw new Error(`Angel One login failed: ${payload?.message ?? response.statusText}`);
    }

    this.session = {
      jwtToken: payload.data.jwtToken,
      refreshToken: payload.data.refreshToken,
      feedToken: payload.data.feedToken,
      // SmartAPI tokens last a trading day; refresh conservatively after 6 hours.
      expiresAt: Date.now() + 6 * 60 * 60 * 1000,
    };
    return this.session;
  }

  /**
   * SmartAPI rejects requests without its full client-identification header
   * set. The IP/MAC values are informational and may be placeholders.
   */
  private baseHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-UserType": "USER",
      "X-SourceID": "WEB",
      "X-ClientLocalIP": "127.0.0.1",
      "X-ClientPublicIP": "127.0.0.1",
      "X-MACAddress": "00:00:00:00:00:00",
      "X-PrivateKey": this.apiKey,
    };
  }

  private async authedHeaders(): Promise<Record<string, string>> {
    const session = await this.ensureSession();
    return { ...this.baseHeaders(), Authorization: `Bearer ${session.jwtToken}` };
  }

  /**
   * All API traffic goes through here: paced by the relevant limiter, then
   * retried with backoff on throttle/transient failures.
   */
  private async post<T>(
    path: string,
    body: unknown,
    kind: keyof typeof RATE_LIMITS = "quote",
  ): Promise<T> {
    const pace = kind === "historical" ? this.historicalLimiter : this.quoteLimiter;

    return withRetry(
      () =>
        pace(async () => {
          const response = await fetch(`${BASE_URL}${path}`, {
            method: "POST",
            headers: await this.authedHeaders(),
            body: JSON.stringify(body),
            cache: "no-store",
          });

          const payload = await response.json().catch(() => null);

          if (response.status === 429) {
            throw new Error(`Angel One ${path} rate limited (429)`);
          }
          if (response.status === 401 || response.status === 403) {
            // Force a fresh login on the next call — the token has expired or
            // been invalidated by a login elsewhere.
            this.session = null;
            throw new Error(
              `Angel One ${path} unauthorised (${response.status}): ${payload?.message ?? response.statusText}`,
            );
          }
          if (!response.ok || payload?.status === false) {
            throw new Error(
              `Angel One ${path} failed (${response.status}): ${payload?.message ?? response.statusText}`,
            );
          }
          return payload.data as T;
        }),
      { label: path },
    );
  }

  // ----------------------------------------------------------- instruments

  /**
   * The scrip master is a ~30 MB JSON file covering every tradable contract.
   * We filter it down to NSE/BSE cash-segment equities that are in our curated
   * universe, which keeps the working set small and enforces the Indian-only
   * constraint at the source.
   */
  async listInstruments(): Promise<Instrument[]> {
    if (this.instrumentCache) return this.instrumentCache;

    // Cache the scrip master for a day — it's a large file that changes at
    // most once per session. `next` is a Next.js extension to RequestInit.
    const response = await fetch(SCRIP_MASTER_URL, {
      next: { revalidate: 86400 },
    } as RequestInit & { next: { revalidate: number } });
    if (!response.ok) throw new Error("Failed to download Angel One scrip master");
    const rows = (await response.json()) as AngelScripRow[];

    const wanted = new Set(SEED_INSTRUMENTS.map((i) => i.ticker));
    const bySymbol = new Map<string, AngelScripRow>();

    for (const row of rows) {
      if (row.exch_seg !== "NSE" && row.exch_seg !== "BSE") continue;
      // Cash-segment equities carry the "-EQ" series suffix.
      if (!row.symbol?.endsWith("-EQ")) continue;
      const ticker = row.symbol.replace(/-EQ$/, "");
      if (!wanted.has(ticker)) continue;
      if (!bySymbol.has(ticker)) bySymbol.set(ticker, row);
    }

    // Metadata (sector, market cap, index membership) is not in the scrip
    // master, so it is merged from the curated universe definition.
    this.instrumentCache = SEED_INSTRUMENTS.flatMap((seed) => {
      const row = bySymbol.get(seed.ticker);
      if (!row) return [];
      const { sim, ...rest } = seed;
      void sim;
      return [
        {
          ...rest,
          exchange: row.exch_seg as "NSE" | "BSE",
          providerToken: row.token,
        },
      ];
    });

    return this.instrumentCache;
  }

  async getInstrument(ticker: string): Promise<Instrument | null> {
    const all = await this.listInstruments();
    return all.find((i) => i.ticker === ticker.toUpperCase()) ?? null;
  }

  private async tokenFor(ticker: string): Promise<{ token: string; exchange: string } | null> {
    const instrument = await this.getInstrument(ticker);
    if (!instrument?.providerToken) return null;
    return { token: instrument.providerToken, exchange: instrument.exchange };
  }

  // ---------------------------------------------------------------- quotes

  async getQuote(ticker: string): Promise<Quote | null> {
    const quotes = await this.getQuotes([ticker]);
    return quotes[0] ?? null;
  }

  async getQuotes(tickers: string[]): Promise<Quote[]> {
    const resolved = await Promise.all(tickers.map((t) => this.tokenFor(t)));
    const byExchange: Record<string, string[]> = {};
    resolved.forEach((r) => {
      if (!r) return;
      (byExchange[r.exchange] ??= []).push(r.token);
    });
    if (Object.keys(byExchange).length === 0) return [];

    // SmartAPI caps tokens per request, so split into batches. Still vastly
    // fewer calls than one request per symbol.
    const batches: Record<string, string[]>[] = [];
    for (const [exchange, tokens] of Object.entries(byExchange)) {
      for (const group of chunk(tokens, MAX_TOKENS_PER_QUOTE_REQUEST)) {
        batches.push({ [exchange]: group });
      }
    }

    const responses = await Promise.all(
      batches.map((exchangeTokens) =>
        this.post<{ fetched: AngelQuoteRow[] }>(
          "/rest/secure/angelbroking/market/v1/quote/",
          { mode: "FULL", exchangeTokens },
          "quote",
        ),
      ),
    );

    const data = { fetched: responses.flatMap((r) => r?.fetched ?? []) };

    const instruments = await this.listInstruments();
    const byToken = new Map(instruments.map((i) => [i.providerToken, i]));

    return (data.fetched ?? []).flatMap((row) => {
      const instrument = byToken.get(row.symbolToken);
      if (!instrument) return [];
      const prevClose = Number(row.close);
      const price = Number(row.ltp);
      return [
        {
          ticker: instrument.ticker,
          exchange: instrument.exchange,
          price,
          change: Number((price - prevClose).toFixed(2)),
          changePercent: Number((((price - prevClose) / prevClose) * 100).toFixed(2)),
          open: Number(row.open),
          high: Number(row.high),
          low: Number(row.low),
          prevClose,
          volume: Number(row.tradeVolume ?? 0),
          week52High: Number(row["52WeekHigh"] ?? 0),
          week52Low: Number(row["52WeekLow"] ?? 0),
          updatedAt: new Date().toISOString(),
        },
      ];
    });
  }

  // --------------------------------------------------------------- candles

  async getCandles(request: CandleRequest): Promise<Candle[]> {
    const resolved = await this.tokenFor(request.ticker);
    if (!resolved) return [];

    const isWeekly = request.interval === "1wk";
    const isMonthly = request.interval === "1mo";
    const nativeInterval: CandleInterval = (isWeekly || isMonthly) ? "1d" : request.interval;

    const to = new Date();
    // Pad generously for weekends and trading holidays.
    const calendarDays = Math.ceil((request.limit / BARS_PER_DAY[request.interval]) * 1.6) + 5;
    const from = new Date(to.getTime() - calendarDays * 24 * 60 * 60 * 1000);

    const data = await this.post<{ data: AngelCandleRow[] } | AngelCandleRow[]>(
      "/rest/secure/angelbroking/historical/v1/getCandleData",
      {
        exchange: resolved.exchange,
        symboltoken: resolved.token,
        interval: INTERVAL_MAP[nativeInterval],
        fromdate: formatIstDateTime(from, "09:15"),
        todate: formatIstDateTime(to, "15:30"),
      },
      "historical",
    );

    const rows = Array.isArray(data) ? data : (data?.data ?? []);
    let bars = rows
      .map((row) => ({
        time: Math.floor(new Date(row[0]).getTime() / 1000),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
      }));

    if (isWeekly) bars = resample(bars, 5);
    if (isMonthly) bars = resample(bars, 21);

    return bars.slice(-request.limit);
  }

  async getBenchmarkCandles(limit: number): Promise<Candle[]> {
    // NIFTY 50 index token on the NSE segment.
    const to = new Date();
    const from = new Date(to.getTime() - (limit * 1.6 + 10) * 24 * 60 * 60 * 1000);
    const data = await this.post<{ data: AngelCandleRow[] } | AngelCandleRow[]>(
      "/rest/secure/angelbroking/historical/v1/getCandleData",
      {
        exchange: "NSE",
        symboltoken: "99926000",
        interval: "ONE_DAY",
        fromdate: formatIstDateTime(from, "09:15"),
        todate: formatIstDateTime(to, "15:30"),
      },
      "historical",
    );
    const rows = Array.isArray(data) ? data : (data?.data ?? []);
    return rows
      .map((row) => ({
        time: Math.floor(new Date(row[0]).getTime() / 1000),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
      }))
      .slice(-limit);
  }

  /**
   * SmartAPI is an execution/market-data API — it carries no fundamentals.
   * Returning null makes the long-term strategies stand down rather than
   * silently scoring on stale or invented ratios. To enable long-term
   * recommendations on live data, plug a fundamentals feed in here.
   */
  async getFundamentals(ticker: string): Promise<Fundamentals | null> {
    void SEED_BY_TICKER.get(ticker.toUpperCase());
    return null;
  }

  isMarketOpen(): boolean {
    return isNseCashMarketOpen();
  }
}

// ------------------------------------------------------------------ helpers

interface AngelScripRow {
  token: string;
  symbol: string;
  name: string;
  exch_seg: string;
  instrumenttype?: string;
}

interface AngelQuoteRow {
  symbolToken: string;
  ltp: number | string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  tradeVolume?: number | string;
  "52WeekHigh"?: number | string;
  "52WeekLow"?: number | string;
}

/** [timestamp, open, high, low, close, volume] */
type AngelCandleRow = [string, number, number, number, number, number];

/** SmartAPI expects "YYYY-MM-DD HH:mm" in IST. */
function formatIstDateTime(date: Date, time: string): string {
  const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d} ${time}`;
}

/**
 * RFC 6238 TOTP (SHA-1, 6 digits, 30s step) from a base32 secret.
 * Angel One requires a fresh TOTP on every login.
 */
export function generateTotp(base32Secret: string, at = Date.now()): string {
  const key = base32Decode(base32Secret);
  const counter = Math.floor(at / 1000 / 30);

  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto.createHmac("sha1", key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(code % 1_000_000).padStart(6, "0");
}

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index === -1) throw new Error("Invalid base32 character in TOTP secret");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
