/**
 * Inbound rate limiting.
 *
 * The failure modes worth pinning are the ones that are invisible in normal
 * use: a limiter that never resets locks users out permanently, and one that
 * shares a key across callers lets one person's refreshes block everybody.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { callerKey, checkRateLimit, resetRateLimits } from "./api-rate-limit";

afterEach(() => {
  resetRateLimits();
  vi.useRealTimers();
});

const opts = { limit: 3, windowMs: 60_000 };

function request(headers: Record<string, string>): Request {
  return new Request("https://example.com/api/recommendations", { headers });
}

describe("checkRateLimit", () => {
  it("admits requests up to the limit", () => {
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit("k", opts).allowed).toBe(true);
    }
  });

  it("rejects the one after the limit", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("k", opts);
    expect(checkRateLimit("k", opts).allowed).toBe(false);
  });

  it("counts down the remaining allowance", () => {
    expect(checkRateLimit("k", opts).remaining).toBe(2);
    expect(checkRateLimit("k", opts).remaining).toBe(1);
    expect(checkRateLimit("k", opts).remaining).toBe(0);
  });

  it("reports a positive retry-after when it rejects", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("k", opts);
    const result = checkRateLimit("k", opts);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("never reports a retry-after of zero while blocking", () => {
    // A `Retry-After: 0` invites an immediate retry, which is a busy loop.
    vi.useFakeTimers();
    for (let i = 0; i < 3; i++) checkRateLimit("k", opts);
    vi.advanceTimersByTime(59_999);
    const result = checkRateLimit("k", opts);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("lets the caller back in once the window passes", () => {
    // The bug this guards: a limiter that never resets is a permanent lockout.
    vi.useFakeTimers();
    for (let i = 0; i < 3; i++) checkRateLimit("k", opts);
    expect(checkRateLimit("k", opts).allowed).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(checkRateLimit("k", opts).allowed).toBe(true);
  });

  it("keeps separate callers independent", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("alice", opts);
    expect(checkRateLimit("alice", opts).allowed).toBe(false);
    expect(checkRateLimit("bob", opts).allowed).toBe(true);
  });

  it("does not leak allowance between different endpoints", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("recommendations:alice", opts);
    expect(checkRateLimit("quotes:alice", opts).allowed).toBe(true);
  });
});

describe("callerKey", () => {
  it("is stable for the same session", () => {
    const headers = { cookie: "sb-abcdef-auth-token=xyz123; theme=dark" };
    expect(callerKey(request(headers))).toBe(callerKey(request(headers)));
  });

  it("differs between sessions", () => {
    const a = callerKey(request({ cookie: "sb-abcdef-auth-token=aaa" }));
    const b = callerKey(request({ cookie: "sb-abcdef-auth-token=bbb" }));
    expect(a).not.toBe(b);
  });

  it("ignores unrelated cookies changing", () => {
    // Otherwise a theme toggle would hand the caller a fresh allowance.
    const a = callerKey(request({ cookie: "sb-abcdef-auth-token=aaa; theme=dark" }));
    const b = callerKey(request({ cookie: "sb-abcdef-auth-token=aaa; theme=light" }));
    expect(a).toBe(b);
  });

  it("matches Supabase's chunked cookie names", () => {
    const key = callerKey(request({ cookie: "sb-abcdef-auth-token.0=part1" }));
    expect(key).toBeTruthy();
    expect(key).not.toBe(callerKey(request({ cookie: "nothing=here" })));
  });

  it("falls back to the forwarded IP with no auth cookie", () => {
    const a = callerKey(request({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" }));
    const b = callerKey(request({ "x-forwarded-for": "203.0.113.9" }));
    expect(a).not.toBe(b);
  });

  it("does not contain the session token", () => {
    // The map would otherwise hold live credentials in memory.
    const token = "super-secret-token-value";
    expect(callerKey(request({ cookie: `sb-abcdef-auth-token=${token}` }))).not.toContain(token);
  });

  it("returns something for a request with no headers at all", () => {
    expect(callerKey(request({}))).toBeTruthy();
  });
});
