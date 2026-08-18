/**
 * Where computed sector medians are kept between screens.
 *
 * The medians cost one summary request per instrument, which is affordable only
 * while a full-universe screen is running anyway. Persisting them is what lets a
 * stock detail page show real peer comparisons for the price of one small read
 * instead of a 200-request fan-out.
 *
 * It is an interface because the two builds have genuinely different answers.
 * The server writes them to Supabase, where every user's detail page shares one
 * copy. The device has no such shared store — and no service-role key, nor any
 * business holding one — so it keeps them for the life of the process and
 * recomputes on the next cold start. That is a smaller win, not a broken one:
 * the universe screen that computes them is the same screen the phone runs.
 */

export interface SectorMedian {
  pe: number;
  pb: number;
  sampleSize: number;
}

export interface SectorMedianStore {
  load(): Promise<Record<string, SectorMedian>>;
  save(medians: Record<string, SectorMedian>): Promise<void>;
}

/**
 * In-process store. The default, and what the Android build uses.
 *
 * Deliberately not backed by localStorage: a median computed from yesterday's
 * prices is a worse peer comparison than the static fallback the readers
 * already have, and nothing here knows how to age it out.
 */
export function createMemorySectorMedianStore(): SectorMedianStore {
  let held: Record<string, SectorMedian> = {};
  return {
    async load() {
      return held;
    },
    async save(medians) {
      held = { ...held, ...medians };
    },
  };
}
