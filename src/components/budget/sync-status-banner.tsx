"use client";

import { CloudSlash, GoogleDriveLogo } from "@phosphor-icons/react";
import { useShallow } from "zustand/react/shallow";

import { useBudget } from "./budget-provider";
import { useSession } from "@/components/auth/session-provider";
import { backendFor, isGoogleAccount } from "@/lib/store/backend";

/**
 * Says so when the numbers on screen are not this account's real numbers.
 *
 * The provider falls back to local data whenever the remote cannot be read, and
 * that is the correct behaviour — a device with no signal has to stay usable.
 * But on a fresh install the local store is *empty*, so the fallback renders a
 * net worth of zero and an untouched budget, which is indistinguishable from
 * having lost everything. Someone seeing that has no way to tell a network
 * blip from real data loss, and the app was previously not telling them.
 *
 * Rendering nothing is the common case: this only appears when a read actually
 * failed for an account that has a remote.
 */
export function SyncStatusBanner() {
  const { remoteStatus, loading } = useBudget(
    useShallow((s) => ({ remoteStatus: s.remoteStatus, loading: s.loading })),
  );
  const { user, authEnabled } = useSession();

  if (loading || remoteStatus !== "unreachable") return null;

  const backend = backendFor(user, authEnabled);
  const drive = backend === "drive" && isGoogleAccount(user);

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-card border border-orange/30 bg-orange/[0.08] p-4"
    >
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-orange/[0.14]">
        {drive ? (
          <GoogleDriveLogo size={18} weight="duotone" className="text-orange" />
        ) : (
          <CloudSlash size={18} weight="duotone" className="text-orange" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-subhead font-semibold text-label">
          {drive ? "Couldn't reach your Google Drive" : "Couldn't reach your saved data"}
        </p>
        <p className="mt-1 text-caption leading-relaxed text-label-secondary/75">
          {drive ? (
            <>
              This account keeps its data in your own Google Drive, and this device could not get
              permission to read it. <strong className="font-semibold text-label">Nothing has
              been deleted</strong> — the figures below are just this device&apos;s empty copy.
              Open Settings → Budget &amp; Data and reconnect Drive.
            </>
          ) : (
            <>
              <strong className="font-semibold text-label">Nothing has been deleted</strong> — the
              figures below are this device&apos;s local copy, which is empty. Check your
              connection and reopen the app.
            </>
          )}
        </p>
        <p className="mt-2 text-caption2 leading-relaxed text-label-secondary/55">
          Avoid editing until this clears. Changes made now are saved locally and will be merged
          when the connection returns.
        </p>
      </div>
    </div>
  );
}
