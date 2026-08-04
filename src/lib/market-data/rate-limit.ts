/**
 * Concurrency and rate-limiting helpers for live market data providers.
 *
 * The mock provider is pure computation, so the engine could fan out as wide as
 * it liked. Real brokerage APIs are the opposite: SmartAPI, Kite and Upstox all
 * enforce strict per-endpoint limits and will throttle — or temporarily block —
 * a client that ignores them. Anything that talks to a live feed has to go
 * through these.
 */

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Caps how many operations run at once. Queued callers wait their turn.
 */
export function createLimiter(concurrency: number) {
  let active = 0;
  const waiting: (() => void)[] = [];

  function release() {
    active -= 1;
    waiting.shift()?.();
  }

  return async function limit<T>(task: () => Promise<T>): Promise<T> {
    if (active >= concurrency) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    active += 1;
    try {
      return await task();
    } finally {
      release();
    }
  };
}

/**
 * Spaces calls so no more than `perSecond` start in any one-second window.
 *
 * Deliberately a simple serial pacer rather than a burst-capable token bucket:
 * brokerage limits are usually enforced as a hard per-second ceiling, and a
 * burst that trips it costs far more (a cooldown, sometimes a ban) than the
 * throughput it buys.
 */
export function createRateLimiter(perSecond: number) {
  const minGapMs = 1000 / perSecond;
  let previous: Promise<unknown> = Promise.resolve();
  let lastStart = 0;

  return function schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = previous.then(async () => {
      const wait = lastStart + minGapMs - Date.now();
      if (wait > 0) await sleep(wait);
      lastStart = Date.now();
      return task();
    });
    // Keep the chain alive even when a task rejects.
    previous = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  /** Return true to retry. Defaults to retrying throttle and 5xx errors. */
  shouldRetry?: (error: unknown) => boolean;
  label?: string;
}

/** Heuristic: is this error worth retrying? */
function defaultShouldRetry(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("429") ||
    message.includes("rate") ||
    message.includes("throttl") ||
    message.includes("timeout") ||
    message.includes("econnreset") ||
    message.includes("fetch failed") ||
    /\b5\d\d\b/.test(message)
  );
}

/**
 * Retries with exponential backoff and jitter.
 *
 * Jitter matters here: without it, a screen that throttles will retry all its
 * symbols at exactly the same moment and throttle again.
 */
export async function withRetry<T>(task: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    attempts = 3,
    baseDelayMs = 600,
    shouldRetry = defaultShouldRetry,
    label = "request",
  } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !shouldRetry(error)) break;
      const backoff = baseDelayMs * 2 ** (attempt - 1);
      const jitter = Math.random() * baseDelayMs;
      console.warn(
        `[market-data] ${label} failed (attempt ${attempt}/${attempts}), retrying in ${Math.round(backoff + jitter)}ms:`,
        error instanceof Error ? error.message : error,
      );
      await sleep(backoff + jitter);
    }
  }
  throw lastError;
}
