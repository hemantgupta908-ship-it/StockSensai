import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import type { User } from "@supabase/supabase-js";

/**
 * `backendFor` decides where a user's financial data is written, so the case
 * worth pinning down is not the happy path — it is that a Google account can
 * never be routed into this project's database, whatever else is misconfigured.
 * That guarantee is one edited line away from silently inverting, and nothing
 * in the UI would look different if it did.
 */

function userWith(provider: string): User {
  return { id: "u1", app_metadata: { provider } } as unknown as User;
}

async function backendFor(user: User | null, authEnabled: boolean) {
  const mod = await import("./backend");
  return mod.backendFor(user, authEnabled);
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("backendFor", () => {
  it("keeps a password account on Supabase", async () => {
    vi.stubEnv("NEXT_PUBLIC_OAUTH_GOOGLE", "1");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "x".repeat(30));
    expect(await backendFor(userWith("email"), true)).toBe("supabase");
  });

  it("routes a Google account to Drive when it is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_OAUTH_GOOGLE", "1");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "x".repeat(30));
    expect(await backendFor(userWith("google"), true)).toBe("drive");
  });

  it("degrades a Google account to local — never Supabase — when Drive is unconfigured", async () => {
    vi.stubEnv("NEXT_PUBLIC_OAUTH_GOOGLE", "1");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "");
    expect(await backendFor(userWith("google"), true)).toBe("local");
  });

  it("degrades a Google account to local when the client ID is a placeholder", async () => {
    vi.stubEnv("NEXT_PUBLIC_OAUTH_GOOGLE", "1");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "todo");
    expect(await backendFor(userWith("google"), true)).toBe("local");
  });

  it("is local for everyone when auth is off", async () => {
    vi.stubEnv("NEXT_PUBLIC_OAUTH_GOOGLE", "1");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "x".repeat(30));
    expect(await backendFor(userWith("google"), false)).toBe("local");
    expect(await backendFor(null, true)).toBe("local");
  });
});
