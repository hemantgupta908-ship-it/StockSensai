import "server-only";

import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Persistence for sector median valuation ratios.
 *
 * The medians are computed from live data during a full-universe screen, which
 * costs one summary request per instrument. That is affordable exactly once —
 * while the screen is running anyway — and ruinous anywhere else: firing it
 * from a stock detail page put 200-odd requests ahead of the eight that page
 * was waiting on, and measured 68 seconds.
 *
 * Writing the result to Supabase breaks that trade-off. The screen computes
 * them, a detail page reads them back for the price of one small query, and
 * neither has to choose between real peer comparisons and a fast page.
 */

import type { SectorMedian, SectorMedianStore } from "./sector-median-store";

export type { SectorMedian };

/**
 * Below this many peers a median is noise rather than a peer group, so the
 * sector is not written at all and readers keep their static fallback.
 */
const MIN_SAMPLE = 3;

/** How long a loaded copy is trusted before re-reading. */
const CACHE_TTL_MS = 60 * 60 * 1000;

let cached: { loadedAt: number; medians: Record<string, SectorMedian> } | null = null;
let inFlight: Promise<Record<string, SectorMedian>> | null = null;
let warnedOnRead = false;

/**
 * A client that can read `sector_medians`.
 *
 * Prefers the anon client — the table carries a public select policy — so the
 * medians stay readable without a service-role key. `getSupabaseServerClient`
 * reads cookies and therefore throws outside a request scope, which is a normal
 * condition for background work, so that case falls through rather than
 * abandoning the read.
 */
async function readClient() {
  try {
    const anon = await getSupabaseServerClient();
    if (anon) return anon;
  } catch {
    // No request scope — fall through to the service-role client.
  }
  return getSupabaseAdminClient();
}

/**
 * Persisted medians, keyed by sector name.
 *
 * Returns an empty object rather than throwing when Supabase is unreachable or
 * unconfigured: callers all have a static fallback table, and a missing median
 * should degrade the comparison, never fail the page.
 */
export async function loadSectorMedians(): Promise<Record<string, SectorMedian>> {
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.medians;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const supabase = await readClient();
      if (!supabase) return {};

      const { data, error } = await supabase
        .from("sector_medians")
        .select("sector, pe, pb, sample_size");

      if (error || !data) {
        // Warned once, not per call. The overwhelmingly likely cause is that
        // the migration has not been applied yet, and every reader has a
        // working fallback — so this is worth saying, but only once, and it
        // must never escalate into an error the page surfaces.
        if (!warnedOnRead) {
          warnedOnRead = true;
          console.warn(
            "[market-data] sector_medians unavailable, falling back to the static " +
              `table${error ? `: ${error.message}` : ""}`,
          );
        }
        return {};
      }

      const medians: Record<string, SectorMedian> = {};
      for (const row of data) {
        medians[row.sector] = {
          pe: Number(row.pe),
          pb: Number(row.pb),
          sampleSize: Number(row.sample_size),
        };
      }

      cached = { loadedAt: Date.now(), medians };
      return medians;
    } catch (error) {
      console.error("[market-data] sector median load failed:", error);
      return {};
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Write freshly computed medians.
 *
 * Requires the service-role key; without one this is a no-op, which keeps the
 * screen working in environments that only have anon credentials. Sectors below
 * `MIN_SAMPLE` peers are dropped rather than stored with a weak figure.
 */
export async function saveSectorMedians(
  medians: Record<string, SectorMedian>,
): Promise<number> {
  const rows = Object.entries(medians)
    .filter(([, m]) => m.sampleSize >= MIN_SAMPLE && Number.isFinite(m.pe) && Number.isFinite(m.pb))
    .map(([sector, m]) => ({
      sector,
      pe: Number(m.pe.toFixed(2)),
      pb: Number(m.pb.toFixed(2)),
      sample_size: m.sampleSize,
      updated_at: new Date().toISOString(),
    }));

  if (rows.length === 0) return 0;

  try {
    const supabase = getSupabaseAdminClient();
    if (!supabase) return 0;

    const { error } = await supabase
      .from("sector_medians")
      .upsert(rows, { onConflict: "sector" });

    if (error) {
      console.error("[market-data] sector median save failed:", error.message);
      return 0;
    }

    // The freshly written set is authoritative for this process too.
    cached = {
      loadedAt: Date.now(),
      medians: Object.fromEntries(
        rows.map((r) => [r.sector, { pe: r.pe, pb: r.pb, sampleSize: r.sample_size }]),
      ),
    };
    return rows.length;
  } catch (error) {
    console.error("[market-data] sector median save failed:", error);
    return 0;
  }
}


/**
 * The Supabase-backed store, for the server.
 *
 * `save` returns a row count that the provider does not need, so it is dropped
 * here rather than widening the interface the device also has to satisfy.
 */
export const supabaseSectorMedianStore: SectorMedianStore = {
  load: loadSectorMedians,
  async save(medians) {
    await saveSectorMedians(medians);
  },
};
