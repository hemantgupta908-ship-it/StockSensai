"use client";

import { useEffect, useState } from "react";
import { CloudCheck, GoogleDriveLogo, HardDrive, Warning } from "@phosphor-icons/react";

import { useSession } from "@/components/auth/session-provider";
import { backendFor, isGoogleAccount } from "@/lib/store/backend";
import { deleteAllDocs, probeDrive } from "@/lib/drive/app-data";
import { prepareDriveConsent, requestDriveConsent } from "@/lib/drive/token";
import { SectionLabel } from "@/components/ui/card";

/**
 * Where this account's data is kept, said plainly.
 *
 * Worth a card of its own rather than a line in a help page: users of a money
 * app are entitled to know which company holds their transaction history, and
 * for Google accounts the answer is genuinely unusual enough that leaving it
 * implicit would waste it. It also gives the one case that needs an action —
 * Drive configured but unreachable — somewhere to be explained.
 */
export function StorageCard() {
  const { user, authEnabled } = useSession();
  const backend = backendFor(user, authEnabled);
  const [status, setStatus] = useState<"idle" | "working" | "done" | "failed">("idle");
  const [confirming, setConfirming] = useState(false);

  /**
   * Whether Drive will actually accept us right now.
   *
   * Configured is not the same as consented. An account that signed in before
   * this deployment asked for the Drive scope has a valid session and no grant,
   * and the silent token request fails for that account forever — quietly, in a
   * console warning nobody reads. Probing on mount is what turns that dead end
   * into a button.
   */
  const [drive, setDrive] = useState<"checking" | "ready" | "needs-consent">("checking");
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (backend !== "drive") return;
    let cancelled = false;
    // Build the consent client now, so the button's popup can be opened
    // synchronously on click rather than after a script load.
    prepareDriveConsent();
    void probeDrive().then((ok) => {
      if (!cancelled) setDrive(ok ? "ready" : "needs-consent");
    });
    return () => {
      cancelled = true;
    };
  }, [backend]);

  /**
   * Ask Google for the grant, with UI this time.
   *
   * A reload afterwards rather than a state update: the providers read their
   * documents once on mount, so without it the user is told they are connected
   * while still looking at unsynced data.
   */
  const [connectFailed, setConnectFailed] = useState(false);

  /**
   * Deliberately not `async`.
   *
   * `requestDriveConsent` opens a popup, and browsers only allow that while the
   * click's activation is live. An `await` before it — even on something that
   * looks instant — hands control back to the event loop and the popup is
   * blocked, which is a silent failure: a console warning and a button that
   * appears to do nothing. So the call goes first, and everything else hangs
   * off its promise.
   */
  function handleConnect() {
    setConnecting(true);
    setConnectFailed(false);

    void requestDriveConsent().then(async (token) => {
      // Consent granted is not the same as Drive answering — the API can still
      // be switched off for the Cloud project.
      if (token && (await probeDrive())) {
        window.location.reload();
        return;
      }
      setConnecting(false);
      setConnectFailed(true);
      setDrive("needs-consent");
    });
  }

  // Nothing useful to say to someone with no account: the browser-storage
  // notices on the watchlist and journal already cover that case in context.
  if (backend === "local" && !isGoogleAccount(user)) return null;

  async function handleDelete() {
    setStatus("working");
    const ok = await deleteAllDocs();
    setStatus(ok ? "done" : "failed");
    setConfirming(false);
  }

  return (
    <section className="space-y-2">
      <SectionLabel>Your Data</SectionLabel>
      <div className="rounded-2xl border border-separator/40 bg-bg-secondary p-4 shadow-card dark:border-white/[0.08] dark:shadow-card-dark">
        {backend === "drive" && drive === "needs-consent" && (
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Warning size={17} weight="fill" />
            </div>
            <div>
              <p className="text-subhead font-semibold text-label">Drive not connected yet</p>
              <p className="mt-1 text-footnote leading-relaxed text-label-secondary/75">
                Your data is saved in this browser and nowhere else. Connect Drive to keep it in
                your own Google account and have it follow you between devices — it still never
                touches our servers.
              </p>
              <button
                type="button"
                onClick={handleConnect}
                disabled={connecting}
                className="mt-3 rounded-[10px] bg-brand px-3.5 py-2 text-footnote font-semibold text-brand-fg disabled:opacity-40"
              >
                {connecting ? "Connecting…" : "Connect Google Drive"}
              </button>

              {/*
                Google's own popup explains a denial in its terms, not the
                app's, and it closes before most people finish reading. The two
                causes below account for nearly every failure here, and both are
                fixed in the Cloud console rather than anywhere in this app.
              */}
              {connectFailed && (
                <p className="mt-2.5 text-caption leading-relaxed text-red">
                  Google turned that down. The usual causes are the account not
                  being on the app&rsquo;s test-user list, or the Drive API not being
                  enabled for the project. Your data is unaffected and stays in
                  this browser.
                </p>
              )}
            </div>
          </div>
        )}

        {backend === "drive" && drive !== "needs-consent" && (
          <>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <GoogleDriveLogo size={17} weight="fill" />
              </div>
              <div>
                <p className="text-subhead font-semibold text-label">Stored in your Google Drive</p>
                <p className="mt-1 text-footnote leading-relaxed text-label-secondary/75">
                  Your budget, watchlist and journal are saved to a private folder in your own
                  Drive that only this app can see. They are never stored on our servers, which
                  means we cannot read them, and revoking access in your Google account settings
                  takes them with it.
                </p>
              </div>
            </div>

            <div className="mt-4 border-t border-separator/40 pt-4 dark:border-white/[0.08]">
              {status === "done" ? (
                <p className="flex items-center gap-2 text-footnote text-label-secondary/75">
                  <CloudCheck size={15} className="text-emerald-500" />
                  Deleted from your Drive. What is on this device stays until you clear it.
                </p>
              ) : confirming ? (
                <div className="space-y-2.5">
                  <p className="text-footnote leading-relaxed text-label-secondary/80">
                    This deletes the app&rsquo;s folder from your Drive. There is no copy anywhere
                    else — export anything you want to keep first.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={status === "working"}
                      className="rounded-[10px] bg-red/[0.12] px-3 py-2 text-footnote font-semibold text-red disabled:opacity-40"
                    >
                      {status === "working" ? "Deleting…" : "Delete from Drive"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      className="rounded-[10px] px-3 py-2 text-footnote font-semibold text-label-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="text-footnote font-semibold text-red"
                >
                  Delete my data from Drive
                </button>
              )}
              {status === "failed" && (
                <p className="mt-2 text-footnote text-red">
                  Couldn&rsquo;t reach Drive. You can also remove this app from your Google account
                  settings, which deletes the folder too.
                </p>
              )}
            </div>
          </>
        )}

        {backend === "local" && isGoogleAccount(user) && (
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Warning size={17} weight="fill" />
            </div>
            <div>
              <p className="text-subhead font-semibold text-label">Saved on this device only</p>
              <p className="mt-1 text-footnote leading-relaxed text-label-secondary/75">
                Google Drive storage isn&rsquo;t set up on this deployment, so there is nowhere to
                sync to. Your data stays in this browser rather than going to our database —
                that&rsquo;s deliberate — but it will not follow you to another device, and
                clearing site data will remove it.
              </p>
            </div>
          </div>
        )}

        {backend === "supabase" && (
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-500">
              <HardDrive size={17} weight="fill" />
            </div>
            <div>
              <p className="text-subhead font-semibold text-label">Stored in your account</p>
              <p className="mt-1 text-footnote leading-relaxed text-label-secondary/75">
                Your budget, watchlist and journal sync across your devices through this
                app&rsquo;s database, where row-level security keeps them reachable only by you.
                Signing in with Google instead keeps them in your own Drive.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
