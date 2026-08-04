/**
 * Deterministic pseudo-randomness.
 *
 * Every generated series must be identical across server restarts and across
 * the Vercel serverless instances that might handle successive requests —
 * otherwise a recommendation card and its detail page could disagree. So all
 * randomness is seeded from a stable string (usually the ticker).
 */

/** FNV-1a — small, fast, good enough avalanche for seeding. */
export function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export type Rng = () => number;

/** Mulberry32 — compact PRNG with a full 2^32 period, uniform in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(...parts: (string | number)[]): Rng {
  return mulberry32(hashSeed(parts.join(":")));
}

/** Box–Muller transform: standard normal from two uniforms. */
export function gaussian(rng: Rng): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function uniform(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length];
}
