/**
 * Checks that no financial or identifying data survives into a Sentry event.
 *
 * This is the check that matters most in the observability wiring: everything
 * else failing means errors go unreported, whereas this failing means a user's
 * bank transactions are shipped to a third party. It asserts on the serialised
 * event, because that is what actually leaves the process.
 */

import type { ErrorEvent, EventHint } from "@sentry/nextjs";

import { scrubEvent } from "../src/lib/observability";

let failures = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\nsentry event scrubbing\n");

/** Values that must never appear in a serialised event, whatever the shape. */
const SECRETS = [
  "hemant.gupta.awsome.555@gmail.com",
  "sb-access-token-abc123",
  "eyJhbGciOiJIUzI1NiJ9.secret",
  "HDFC Salary Credit",
  "487211.55",
];

const event = {
  message: "Something failed",
  user: { id: "uuid-1234", email: "hemant.gupta.awsome.555@gmail.com", ip_address: "203.0.113.7" },
  server_name: "vercel-iad1-abc",
  request: {
    url: "https://app.example.com/budget/transactions?wallet=0&q=HDFC%20Salary%20Credit",
    cookies: { "sb-access-token": "sb-access-token-abc123" },
    headers: { authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.secret", cookie: "sb=abc" },
    data: { payload: { transactions: [{ name: "HDFC Salary Credit", amount: 487211.55 }] } },
  },
  contexts: {
    budget: {
      payload: { transactions: [{ name: "HDFC Salary Credit", amount: 487211.55 }] },
      settings: { primaryCurrency: "INR" },
    },
  },
  extra: {
    balance: 487211.55,
    wallets: [{ name: "HDFC", balance: 487211.55 }],
    harmless: "strategy-swing-rsi-reversal",
  },
  breadcrumbs: [
    { category: "console", message: "[budget] persisting HDFC Salary Credit 487211.55" },
    { category: "navigation", data: { from: "/budget", to: "/budget/transactions" } },
    { category: "fetch", data: { url: "/api/quotes", amount: 487211.55 } },
  ],
} as unknown as ErrorEvent;

const scrubbed = scrubEvent(event, {} as EventHint);
check("event is not dropped", scrubbed !== null);

const serialised = JSON.stringify(scrubbed);

for (const secret of SECRETS) {
  check(`"${secret.slice(0, 28)}" does not survive`, !serialised.includes(secret));
}

check("user identity is removed", scrubbed?.user === undefined);
check("server name is removed", scrubbed?.server_name === undefined);
check("cookies are removed", scrubbed?.request?.cookies === undefined);
check("headers are removed", scrubbed?.request?.headers === undefined);
check("request body is removed", scrubbed?.request?.data === undefined);
check(
  "the query string is stripped from the url",
  scrubbed?.request?.url === "https://app.example.com/budget/transactions",
  `got ${scrubbed?.request?.url}`,
);
check(
  "console breadcrumbs are dropped entirely",
  !scrubbed?.breadcrumbs?.some((c) => c.category === "console"),
);
check(
  "non-console breadcrumbs are kept",
  scrubbed?.breadcrumbs?.length === 2,
  `got ${scrubbed?.breadcrumbs?.length}`,
);
check(
  "breadcrumb navigation data survives",
  JSON.stringify(scrubbed?.breadcrumbs?.[0]?.data) === JSON.stringify({ from: "/budget", to: "/budget/transactions" }),
);

// Redaction must not be so broad that the event stops being useful.
check(
  "non-sensitive context is preserved",
  (scrubbed?.extra as Record<string, unknown>)?.harmless === "strategy-swing-rsi-reversal",
);
check("the error message survives", scrubbed?.message === "Something failed");

// Depth and cycles: a real error object is not a tidy three-level literal.
{
  let deep: Record<string, unknown> = { amount: 999999 };
  for (let i = 0; i < 40; i++) deep = { nested: deep };
  const cyclic: Record<string, unknown> = { name: "loop" };
  cyclic.self = cyclic;

  let survived = true;
  try {
    const out = scrubEvent(
      { extra: { deep, cyclic } } as unknown as ErrorEvent,
      {} as EventHint,
    );
    JSON.stringify(out);
  } catch {
    survived = false;
  }
  check("deep and cyclic structures do not throw or hang", survived);
}

console.log(failures === 0 ? "\nall scenarios passed\n" : `\n${failures} scenario(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);
