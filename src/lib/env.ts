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

/**
 * Sentry ingest endpoint. Absent by default, and absence is a supported state:
 * the SDK initialises to a no-op without it, so a fresh clone still boots with
 * no configuration and reports nothing anywhere.
 */
export const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";

export const isSentryConfigured = sentryDsn.startsWith("http");

/** Whether the sign-in screen offers Google. */
export const isGoogleAuthEnabled = process.env.NEXT_PUBLIC_OAUTH_GOOGLE === "1";

/**
 * The Google OAuth client ID, as used by the browser.
 *
 * Distinct from the copy pasted into the Supabase dashboard, even though it is
 * the same string: Supabase uses it to *authenticate* the user, while the
 * browser needs it to mint Drive access tokens for the account's own storage.
 * Without it, Google sign-in still works — those users simply have nowhere of
 * their own to sync to, and stay on this device.
 */
export const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

/**
 * Whether a Google user's data can be kept in their own Drive.
 *
 * Both halves are required. The client ID alone is useless if nobody can sign
 * in with Google, and Google sign-in without a client ID is just an alternative
 * password.
 */
export const isDriveStorageEnabled = isGoogleAuthEnabled && googleClientId.length > 20;
