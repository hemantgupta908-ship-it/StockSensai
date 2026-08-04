import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** ₹1,23,456.78 — Indian digit grouping (lakh/crore), not thousands. */
export function formatINR(value: number, opts: { decimals?: number; compact?: boolean } = {}) {
  const { decimals = 2, compact = false } = opts;
  if (!Number.isFinite(value)) return "—";
  if (compact) return `₹${formatCompactINR(value)}`;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** 1.2 Cr / 45.3 L / 12,345 — the way Indian market data is normally quoted. */
export function formatCompactINR(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1e7) return `${(value / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${(value / 1e5).toFixed(2)} L`;
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value);
}

/**
 * Values already denominated in ₹ crore (market cap, net profit).
 * Above a lakh crore, Indian reporting switches to "lakh crore" rather than
 * printing seven digits.
 */
export function formatCrore(valueInCrore: number, opts: { withSymbol?: boolean } = {}) {
  const { withSymbol = true } = opts;
  const prefix = withSymbol ? "₹" : "";
  if (!Number.isFinite(valueInCrore)) return "—";
  const abs = Math.abs(valueInCrore);
  if (abs >= 1e5) return `${prefix}${(valueInCrore / 1e5).toFixed(2)} L Cr`;
  if (abs >= 1000) return `${prefix}${(valueInCrore / 1000).toFixed(1)}k Cr`;
  return `${prefix}${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(valueInCrore)} Cr`;
}

export function formatNumber(value: number, decimals = 2) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPercent(value: number, decimals = 2, withSign = true) {
  if (!Number.isFinite(value)) return "—";
  const sign = withSign && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

/** Volume in the Indian convention: 4.2 Cr shares, 12.5 L shares. */
export function formatVolume(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1e7) return `${(value / 1e7).toFixed(2)} Cr`;
  if (value >= 1e5) return `${(value / 1e5).toFixed(2)} L`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)} K`;
  return String(Math.round(value));
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** "2 hours ago" style relative timestamps for "last updated" labels. */
export function timeAgo(iso: string | Date) {
  const then = typeof iso === "string" ? new Date(iso) : iso;
  const seconds = Math.floor((Date.now() - then.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return then.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDate(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
