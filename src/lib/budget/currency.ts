/**
 * Currency handling, ported from Cashew's `currencyFunctions.dart`.
 *
 * Every account carries its own currency; totals are normalised to the *primary*
 * account's currency before being summed. Cashew ships a static rate table and
 * refreshes it from the network when available — here the table is the offline
 * fallback and users can override any rate by hand, keeping the app fully
 * functional with no backend.
 */

import type { TransactionWallet } from "./types";

export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
  /** Conventional display precision; JPY and friends use 0. */
  decimals: number;
}

/** Currencies offered in the picker. INR leads — it is this app's default. */
export const CURRENCIES: CurrencyInfo[] = [
  { code: "inr", symbol: "₹", name: "Indian Rupee", decimals: 2 },
  { code: "usd", symbol: "$", name: "US Dollar", decimals: 2 },
  { code: "eur", symbol: "€", name: "Euro", decimals: 2 },
  { code: "gbp", symbol: "£", name: "British Pound", decimals: 2 },
  { code: "jpy", symbol: "¥", name: "Japanese Yen", decimals: 0 },
  { code: "cny", symbol: "¥", name: "Chinese Yuan", decimals: 2 },
  { code: "aud", symbol: "A$", name: "Australian Dollar", decimals: 2 },
  { code: "cad", symbol: "C$", name: "Canadian Dollar", decimals: 2 },
  { code: "chf", symbol: "Fr", name: "Swiss Franc", decimals: 2 },
  { code: "sgd", symbol: "S$", name: "Singapore Dollar", decimals: 2 },
  { code: "aed", symbol: "د.إ", name: "UAE Dirham", decimals: 2 },
  { code: "hkd", symbol: "HK$", name: "Hong Kong Dollar", decimals: 2 },
  { code: "nzd", symbol: "NZ$", name: "New Zealand Dollar", decimals: 2 },
  { code: "sek", symbol: "kr", name: "Swedish Krona", decimals: 2 },
  { code: "nok", symbol: "kr", name: "Norwegian Krone", decimals: 2 },
  { code: "dkk", symbol: "kr", name: "Danish Krone", decimals: 2 },
  { code: "zar", symbol: "R", name: "South African Rand", decimals: 2 },
  { code: "brl", symbol: "R$", name: "Brazilian Real", decimals: 2 },
  { code: "mxn", symbol: "Mex$", name: "Mexican Peso", decimals: 2 },
  { code: "rub", symbol: "₽", name: "Russian Ruble", decimals: 2 },
  { code: "krw", symbol: "₩", name: "South Korean Won", decimals: 0 },
  { code: "idr", symbol: "Rp", name: "Indonesian Rupiah", decimals: 2 },
  { code: "myr", symbol: "RM", name: "Malaysian Ringgit", decimals: 2 },
  { code: "thb", symbol: "฿", name: "Thai Baht", decimals: 2 },
  { code: "php", symbol: "₱", name: "Philippine Peso", decimals: 2 },
  { code: "vnd", symbol: "₫", name: "Vietnamese Dong", decimals: 0 },
  { code: "pkr", symbol: "₨", name: "Pakistani Rupee", decimals: 2 },
  { code: "bdt", symbol: "৳", name: "Bangladeshi Taka", decimals: 2 },
  { code: "lkr", symbol: "Rs", name: "Sri Lankan Rupee", decimals: 2 },
  { code: "npr", symbol: "Rs", name: "Nepalese Rupee", decimals: 2 },
  { code: "try", symbol: "₺", name: "Turkish Lira", decimals: 2 },
  { code: "pln", symbol: "zł", name: "Polish Zloty", decimals: 2 },
  { code: "ils", symbol: "₪", name: "Israeli Shekel", decimals: 2 },
  { code: "sar", symbol: "﷼", name: "Saudi Riyal", decimals: 2 },
  { code: "ngn", symbol: "₦", name: "Nigerian Naira", decimals: 2 },
  { code: "kes", symbol: "KSh", name: "Kenyan Shilling", decimals: 2 },
  { code: "ars", symbol: "AR$", name: "Argentine Peso", decimals: 2 },
  { code: "clp", symbol: "CLP$", name: "Chilean Peso", decimals: 0 },
  { code: "cop", symbol: "COL$", name: "Colombian Peso", decimals: 2 },
  { code: "egp", symbol: "E£", name: "Egyptian Pound", decimals: 2 },
  { code: "czk", symbol: "Kč", name: "Czech Koruna", decimals: 2 },
  { code: "huf", symbol: "Ft", name: "Hungarian Forint", decimals: 2 },
  { code: "ron", symbol: "lei", name: "Romanian Leu", decimals: 2 },
  { code: "uah", symbol: "₴", name: "Ukrainian Hryvnia", decimals: 2 },
  { code: "btc", symbol: "₿", name: "Bitcoin", decimals: 8 },
];

const CURRENCY_BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export function getCurrencyInfo(code: string | null | undefined): CurrencyInfo | null {
  if (!code) return null;
  return CURRENCY_BY_CODE.get(code.toLowerCase()) ?? null;
}

/**
 * Units of each currency per 1 USD. Offline fallback only — indicative rates,
 * refreshed by the user from the exchange-rates screen.
 */
export const DEFAULT_EXCHANGE_RATES: Record<string, number> = {
  usd: 1,
  inr: 83.3,
  eur: 0.92,
  gbp: 0.79,
  jpy: 151.2,
  cny: 7.23,
  aud: 1.52,
  cad: 1.36,
  chf: 0.9,
  sgd: 1.34,
  aed: 3.67,
  hkd: 7.82,
  nzd: 1.64,
  sek: 10.6,
  nok: 10.7,
  dkk: 6.87,
  zar: 18.8,
  brl: 5.0,
  mxn: 16.7,
  rub: 92.5,
  krw: 1338,
  idr: 15700,
  myr: 4.72,
  thb: 36.2,
  php: 56.1,
  vnd: 24800,
  pkr: 278,
  bdt: 110,
  lkr: 305,
  npr: 133,
  try: 32.2,
  pln: 3.96,
  ils: 3.68,
  sar: 3.75,
  ngn: 1350,
  kes: 131,
  ars: 860,
  clp: 960,
  cop: 3900,
  egp: 47.6,
  czk: 23.3,
  huf: 360,
  ron: 4.58,
  uah: 39.0,
  btc: 0.000015,
};

/**
 * All accounts plus the resolved primary currency — Cashew's `AllWallets`,
 * threaded through every total so conversion is never skipped by accident.
 */
export interface AllWallets {
  list: TransactionWallet[];
  indexedByPk: Record<string, TransactionWallet>;
  primaryCurrency: string | null;
  exchangeRates: Record<string, number>;
}

export function buildAllWallets(
  wallets: TransactionWallet[],
  primaryWalletPk: string,
  exchangeRates: Record<string, number> = DEFAULT_EXCHANGE_RATES,
): AllWallets {
  const indexedByPk: Record<string, TransactionWallet> = {};
  for (const w of wallets) indexedByPk[w.walletPk] = w;
  const primary = indexedByPk[primaryWalletPk] ?? wallets[0] ?? null;
  return {
    list: wallets,
    indexedByPk,
    primaryCurrency: primary?.currency ?? null,
    exchangeRates,
  };
}

/**
 * Multiplier converting an amount held in `currency` into the primary currency.
 *
 * Cashew returns 1 when either side is unknown rather than dropping the amount
 * — an un-converted total is a smaller lie than a silently missing one.
 */
export function amountRatioToPrimaryCurrency(
  allWallets: AllWallets,
  currency: string | null | undefined,
): number {
  const from = currency?.toLowerCase();
  const to = allWallets.primaryCurrency?.toLowerCase();
  if (!from || !to) return 1;
  if (from === to) return 1;

  const fromRate = allWallets.exchangeRates[from];
  const toRate = allWallets.exchangeRates[to];
  if (!fromRate || !toRate) return 1;

  // Rates are "units per USD", so cross-rate via USD.
  return toRate / fromRate;
}

/** Same as above, keyed by account rather than currency code. */
export function amountRatioToPrimaryCurrencyGivenPk(
  allWallets: AllWallets,
  walletPk: string | null | undefined,
): number {
  if (!walletPk) return 1;
  const wallet = allWallets.indexedByPk[walletPk];
  if (!wallet) return 1;
  return amountRatioToPrimaryCurrency(allWallets, wallet.currency);
}

/**
 * Format an amount in a given currency.
 *
 * INR uses the en-IN locale so grouping follows the lakh/crore convention
 * rather than thousands — consistent with the rest of the app.
 */
export function formatCurrencyAmount(
  amount: number,
  currencyCode: string | null | undefined,
  opts: { decimals?: number; showSign?: boolean; compact?: boolean; obfuscate?: boolean } = {},
): string {
  const info = getCurrencyInfo(currencyCode);
  const decimals = opts.decimals ?? info?.decimals ?? 2;
  const symbol = info?.symbol ?? "";

  if (opts.obfuscate) return `${symbol}••••••`;

  if (!Number.isFinite(amount)) return `${symbol}—`;

  const locale = info?.code === "inr" ? "en-IN" : "en-US";
  const abs = Math.abs(amount);

  let body: string;
  if (opts.compact && abs >= 1000) {
    body = new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(abs);
  } else {
    body = new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(abs);
  }

  const sign = amount < 0 ? "-" : opts.showSign && amount > 0 ? "+" : "";
  return `${sign}${symbol}${body}`;
}
