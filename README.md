# StockSensei

An Indian stock **screening and educational** app for NSE/BSE-listed companies. Pick a trading style — Swing, Short-Term or Long-Term — and see which stocks currently satisfy the conditions of fifteen rule-based strategies, with the actual numbers behind every verdict.

**StockSensei is not a brokerage.** It places no orders, holds no funds, and gives no personalised advice. See [`/disclaimer`](src/app/disclaimer/page.tsx).

---

## Quick start

```bash
npm install
npm run dev
```

That's it — no API keys, no database, no `.env` file. The app boots into **demo mode**: a seeded market-data provider serves deterministic OHLCV and fundamentals for 37 large- and mid-cap NSE names, and the watchlist and journal persist to browser storage. Every screen is fully functional.

Other commands:

```bash
npm run build          # production build
npm run typecheck      # tsc --noEmit
npx tsx scripts/smoke-strategies.ts    # fire all 15 strategies over the universe
```

---

## Architecture

```
src/
├── lib/
│   ├── market-data/          # provider abstraction — swap data sources here
│   │   ├── types.ts          # MarketDataProvider interface, domain types
│   │   ├── index.ts          # registry + NSE/BSE-only guard
│   │   ├── mock-provider.ts  # default: seeded simulation
│   │   ├── angel-one-provider.ts   # SmartAPI implementation (env-gated)
│   │   └── seed/             # instrument universe + OHLCV generator
│   ├── indicators/           # EMA, SMA, RSI, MACD, Bollinger, ATR, VWAP, pivots
│   ├── strategies/           # the 15 strategies as pure functions
│   │   ├── types.ts          # Strategy contract, risk-tolerance thresholds
│   │   ├── swing.ts          # 5 swing strategies
│   │   ├── short-term.ts     # 5 short-term strategies
│   │   └── long-term.ts      # 5 long-term strategies
│   ├── engine/               # signals → recommendations, caching
│   └── supabase/             # clients (browser / server / service-role)
├── components/
│   ├── ui/                   # design system: Card, SegmentedControl, TabBar,
│   │                         # RangeGauge, Sheet, PullToRefresh, …
│   ├── recommendations/      # feed + card
│   ├── stock/                # detail view, candlestick chart, fundamentals
│   ├── watchlist/  portfolio/  settings/  auth/
└── app/                      # App Router pages + API routes
```

### The provider abstraction

Everything above `lib/market-data` is written against the `MarketDataProvider` interface. Switching data sources is one environment variable:

```bash
MARKET_DATA_PROVIDER=mock        # default — seeded simulation
MARKET_DATA_PROVIDER=angelone    # Angel One SmartAPI
```

To add Kite Connect or Upstox, implement the interface in `src/lib/market-data/types.ts` and register it in `src/lib/market-data/index.ts`. No call site changes.

The registry wraps whatever provider is selected in a guard that drops any instrument that isn't NSE/BSE-listed with an Indian ISIN, so the "Indian equities only" constraint holds even if a live feed returns something unexpected.

### The strategy engine

Each strategy is a pure function `(StockDataBundle, Thresholds) → StrategySignal | null`. It returns a list of **conditions** — each with a label, a pass/fail verdict, and the actual numbers behind it — plus entry/target bands, a stop, an estimated hold and a confidence score.

Confidence is the weighted share of conditions met. Conditions marked `required` are hard gates: if one fails, the strategy produces nothing. Setups that don't clear the reward-to-risk floor are discarded too.

A few design decisions worth knowing about:

- **Indicators return `NaN` during warm-up**, never `0`. Treating an unwarmed moving average as zero is the classic way to manufacture phantom crossovers.
- **RSI uses Wilder's smoothing**, not a plain EMA — the 30/70 crossings land on different bars otherwise, and the crossing *is* the signal.
- **VWAP is session-anchored** and resets each day.
- **The reward-to-risk floor is style-aware** (`minRewardRiskFor`). An opening-range breakout risks the entire opening range by construction and compensates with frequency; holding it to a swing trade's ratio doesn't make it safer, it just silences it. Long-term theses face a wider bar.
- **Only bullish signals become recommendation cards.** Bearish signals are still computed and shown on the stock detail screen as caution flags — useful when deciding whether to buy — but never rendered with a "buy range".

### Seeded data

The mock provider generates a geometric Brownian walk per instrument, shaped by a per-stock *scenario* (`ema-golden-cross`, `range-breakout`, `oversold-bounce`, `choppy`, …). Two details make it work:

1. Scenario drift is expressed in units of **daily volatility**, not annual drift. Annual drift per bar is ~0.05% against ~1.5% daily noise, so a drift-multiplier approach gets swamped and the intended patterns never appear.
2. After generating, the series is **verified against the pattern its scenario promises** and re-seeded if absent — a crossover has to land inside the window a strategy actually scans.

The strategies still run genuine indicator maths and still have to find the signal; this only guarantees there is one to find. Roughly a fifth of the universe is deliberately `choppy` so that not everything fires.

Two dev scripts help here:

```bash
npx tsx scripts/smoke-strategies.ts   # signal counts per strategy, per risk tolerance
npx tsx scripts/debug-scenarios.ts    # raw indicator readings per instrument
```

The first is the fastest way to check a change didn't silence a screen or make one fire on everything. The second prints the actual EMA/MACD/RSI/bandwidth/VWAP readings per stock, which is how you tell "the generator isn't producing the pattern" apart from "the strategy isn't detecting it".

---

## Optional: Supabase

Accounts, cross-device sync and the recommendations cache. Without it the app degrades to browser storage rather than breaking.

1. Create a project at [supabase.com](https://supabase.com).
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor. It creates `watchlist_items`, `portfolio_entries`, `user_preferences` and `cached_recommendations`, all with row-level security so a user can only reach their own rows.
3. Copy `.env.example` to `.env.local` and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>   # server-only, for the cron
```

Anything saved to browser storage before signing in is migrated into the account on first load rather than being discarded.

> The service-role key bypasses RLS entirely. It's only read in `getSupabaseAdminClient()`, in a module marked `server-only` so it cannot be imported into client code.

---

## Going live: Yahoo Finance (recommended first step)

Real NSE/BSE prices **and fundamentals**, no account, no keys:

```bash
MARKET_DATA_PROVIDER=yahoo
```

```bash
npm run smoke:yahoo     # fetch the live universe and run all 15 strategies over it
```

This is the only provider that covers everything the engine needs from one source. Verified working against live data: 37/37 instruments, 300 daily bars and 225 intraday bars each, plus P/E, P/B, RoE, D/E, payout ratio, 4 years of income statements and 6 years of dividend history.

**Read this before relying on it:**

- The endpoints are **undocumented and unofficial**. Yahoo's terms restrict scraping and redistribution, and they have been progressively locking things down — the batch-quote endpoint is already dead, and fundamentals now require a cookie+crumb handshake. Fine for personal and educational use; not a basis for a commercial product. Licence a real feed for that.
- Prices are **delayed ~15 minutes**. The app recomputes after the close so this rarely matters, but the intraday strategies are describing a session that has already moved on.
- **No shareholding data.** Promoter holding and pledging are Indian regulatory disclosures Yahoo doesn't carry, so the growth screen marks that condition unverified rather than assuming zero.
- **No D/E for banks.** Yahoo omits it, and it isn't the right leverage measure for a bank anyway. The leverage gate is required only when the figure exists, so banks aren't silently excluded from the value and quality screens.
- **Symbols drift with corporate actions.** `SYMBOL_OVERRIDES` in the provider handles renames — Tata Motors demerged and now lists as `TMPV`, for instance. Expect to add to that map over time.

Fewer strategies fire on live data than on the seeded set, and that is the correct result: the mock deliberately plants a pattern in most instruments, whereas a real trading day simply doesn't produce a 20/50 EMA crossover or a 1.5% opening gap in every stock.

## Going live: brokerage APIs

**Not wired up.** The implementation in `src/lib/market-data/angel-one-provider.ts` follows the published SmartAPI contract — login with TOTP, scrip-master download, quote and historical-candle endpoints — but has not been exercised against the live API. Verify against a sandbox session before relying on it.

```bash
MARKET_DATA_PROVIDER=angelone
ANGEL_ONE_API_KEY=
ANGEL_ONE_CLIENT_CODE=
ANGEL_ONE_PASSWORD=
ANGEL_ONE_TOTP_SECRET=

# Optional tuning — raise only after checking current published limits.
ANGEL_ONE_QUOTE_RPS=1
ANGEL_ONE_HISTORICAL_RPS=2
MARKET_DATA_CONCURRENCY=4
```

If credentials are missing or malformed the provider throws at construction and the registry falls back to the mock rather than taking the app down.

### Verify before switching over

```bash
curl localhost:3000/api/health/data-source
```

This exercises every method the engine depends on and reports what came back — instrument count, how many quotes resolved, candle depth, whether fundamentals exist. A provider can authenticate successfully and still return empty candles or the wrong exchange, and each failure breaks a different strategy in a way that's hard to diagnose from the UI.

### What real data changes

- **Request volume is the main constraint, not latency.** `getUniverseBundles` batches all quotes into one call, fetches the NIFTY benchmark once, and puts historical calls behind a concurrency limiter — roughly 80 sequenced requests per full screen instead of ~148 simultaneous ones. Brokerage APIs throttle hard; a naive fan-out is blocked immediately.
- **Fundamentals are missing.** SmartAPI is an execution API and carries no ratios, so `getFundamentals()` returns `null` and all five long-term strategies stand down rather than scoring on invented numbers. Long-term screens need a separate fundamentals source.
- **200+ daily bars are required** for the 200 EMA used by the thematic and quality-momentum screens. The health check flags a short history.
- **Trading holidays aren't modelled.** `isNseCashMarketOpen` only knows weekends and session hours.
- **Rate limits are per-endpoint and revised periodically** — check the current SmartAPI docs rather than trusting the defaults above.

The UI badges every feed as **Live data** or **Demo data** from `provider.isLive`, so it is never ambiguous which you are looking at.

---

## Optional: daily recompute

`GET /api/cron/recompute` regenerates every feed (3 styles × 3 risk tolerances) and writes them to `cached_recommendations`. [`vercel.json`](vercel.json) schedules it for 12:00 UTC on weekdays — after the 15:30 IST close.

Protect it with `CRON_SECRET`; Vercel Cron sends it as `Authorization: Bearer <secret>`. In production, requests without either the secret or Vercel's cron header are rejected.

---

## Deploying to Vercel

Import the repo, add whichever environment variables you're using, deploy. Nothing else is required — with no env vars at all it deploys straight into demo mode.

---

## Design notes

iOS-inspired throughout: SF Pro system font stack, 16–24px corner radii, `backdrop-filter` materials on the nav and tab bars, spring physics on every transition (no linear easing), and semantic colour tokens mirroring Apple's `systemBackground` / `label` families so light and dark are a single class swap on `<html>` rather than a `dark:` variant on every element. The theme is applied by an inline script before first paint to avoid a flash of light.

The **RangeGauge** is the component that earns its keep: stop-loss, buy band, target band and the live price on one scale. The *distances* are the information — how far the stop sits below the entry versus how far the target sits above it is the reward-to-risk shape, legible at a glance in a way three lines of text never are.

---

## Licence & disclosure

For education and research. Algorithmically generated screens, not investment advice. Not registered with SEBI as an Investment Adviser or Research Analyst. Investments in securities are subject to market risks; past performance does not indicate future results. Consult a SEBI-registered adviser before acting on anything here.
