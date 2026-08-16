import Link from "next/link";
import { HardDrive } from "@phosphor-icons/react/dist/ssr";

/**
 * Why the data is not syncing.
 *
 * `signed-out` is the long-standing case: no account, so nowhere to sync to.
 *
 * `google-local` is a signed-in Google account with no Drive sync — either
 * because this deployment has not configured it or because Drive could not be
 * reached. The two are one message on purpose: the user cannot act on the
 * difference, and both mean the same thing to them. What they must not be told
 * is "sign in to sync", which is the other branch's advice and is worse than
 * useless to someone who already has.
 */
export type LocalStorageReason = "signed-out" | "google-local";

/**
 * Shown when data is being kept in the browser rather than an account. Users
 * should know their journal will vanish if they clear site data — silently
 * losing a trade log would be a genuinely bad outcome.
 */
export function LocalStorageNotice({
  what,
  reason = "signed-out",
}: {
  what: string;
  reason?: LocalStorageReason;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-[14px] bg-blue/[0.08] px-3.5 py-3">
      <HardDrive size={15} className="mt-[1px] shrink-0 text-blue" weight="duotone" />
      <p className="text-caption leading-snug text-label-secondary/70">
        {reason === "google-local" ? (
          <>
            This {what} is saved in this browser only. Because you signed in with Google, your
            data is never kept on our servers — but that also means it won’t follow you to
            another device, and clearing site data will remove it.
          </>
        ) : (
          <>
            This {what} is saved in this browser only.{" "}
            <Link
              href="/login"
              className="font-semibold text-blue underline-offset-2 hover:underline"
            >
              Sign in
            </Link>{" "}
            to sync it across devices — anything already saved here will be carried over.
          </>
        )}
      </p>
    </div>
  );
}
