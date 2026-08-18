"use client";

import { useEffect, useState } from "react";
import { CheckCircle, CloudSlash, Flask } from "@phosphor-icons/react";

import { IS_MOBILE } from "@/lib/mobile/config";
import { callEngine } from "@/lib/mobile/engine-client";
import { Card, SectionLabel } from "@/components/ui/card";

/**
 * Where this device's prices come from — reported, not configured.
 *
 * This card used to ask for a deployment URL. That was wrong: an app on the Play
 * Store cannot ask its users to paste a server address, and one that needs a
 * server the developer pays for degrades for everybody the day it lapses. The
 * app now fetches live NSE/BSE prices itself through native HTTP, so there is
 * nothing left to configure and the honest thing to show is which source
 * answered.
 *
 * A build-time `NEXT_PUBLIC_API_BASE_URL` still takes precedence when set, for a
 * deployment that wants to serve its cron's precomputed feed. That is a property
 * of the build, not a setting, so it does not appear here.
 *
 * Android only. On the web the app *is* the deployment, so the question has no
 * meaning.
 */
export function DataSourceCard() {
  const [live, setLive] = useState<boolean | null>(null);

  useEffect(() => {
    if (!IS_MOBILE) return;
    let cancelled = false;
    // The provider is resolved once per session and memoised, so this is a
    // message to the engine worker rather than a network request.
    void callEngine("isLive").then(
      (value) => {
        if (!cancelled) setLive(value);
      },
      () => {
        if (!cancelled) setLive(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (!IS_MOBILE) return null;

  return (
    <section className="space-y-2">
      <SectionLabel>Market data</SectionLabel>
      <Card className="!p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-fill/[0.10] dark:bg-white/[0.08]">
            {live === null ? (
              <CloudSlash size={18} weight="duotone" className="text-label-secondary/50" />
            ) : live ? (
              <CheckCircle size={18} weight="duotone" className="text-green" />
            ) : (
              <Flask size={18} weight="duotone" className="text-orange" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-subhead font-semibold text-label">
              {live === null ? "Checking…" : live ? "Live NSE & BSE prices" : "Demo data"}
            </p>
            <p className="mt-1 text-caption leading-relaxed text-label-secondary/70">
              {live === null ? (
                "Working out which source this device can reach."
              ) : live ? (
                <>
                  Prices, fundamentals and every screened level come from live exchange data, which
                  this device fetches directly. Quotes are delayed roughly 15 minutes, which is
                  normal for free Indian market data.
                </>
              ) : (
                <>
                  This device could not reach live market data, so it is screening seeded simulation
                  instead. Every screen still works, but prices — and any profit or loss drawn from
                  them — are not real. Check your connection and reopen the app.
                </>
              )}
            </p>
          </div>
        </div>
      </Card>
    </section>
  );
}
