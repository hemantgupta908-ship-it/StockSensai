/**
 * Central place to read environment configuration.
 *
 * The app is designed to be fully demoable with *zero* configuration: when
 * Supabase env vars are absent we fall back to a local (browser-storage) store
 * and skip auth entirely. That keeps `npm run dev` working out of the box.
 */

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** True when Supabase credentials look usable (both present and non-placeholder). */
export const isSupabaseConfigured =
  supabaseUrl.startsWith("http") && supabaseAnonKey.length > 20;

/**
 * Which market data provider to construct. `mock` is the default so the app
 * never silently depends on live brokerage credentials.
 */
export type ProviderName = "mock" | "yahoo" | "angelone";

const PROVIDER_NAMES: ProviderName[] = ["mock", "yahoo", "angelone"];

export const marketDataProviderName: ProviderName = PROVIDER_NAMES.includes(
  process.env.MARKET_DATA_PROVIDER as ProviderName,
)
  ? (process.env.MARKET_DATA_PROVIDER as ProviderName)
  : "mock";

/** Shared secret used to protect the daily recompute cron endpoint. */
export const cronSecret = process.env.CRON_SECRET ?? "";
