import Link from "next/link";
import { HardDrive } from "lucide-react";

/**
 * Shown when data is being kept in the browser rather than an account. Users
 * should know their journal will vanish if they clear site data — silently
 * losing a trade log would be a genuinely bad outcome.
 */
export function LocalStorageNotice({ what }: { what: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[14px] bg-blue/[0.08] px-3.5 py-3">
      <HardDrive size={15} className="mt-[1px] shrink-0 text-blue" strokeWidth={2.2} />
      <p className="text-caption leading-snug text-label-secondary/70">
        This {what} is saved in this browser only.{" "}
        <Link href="/login" className="font-semibold text-blue underline-offset-2 hover:underline">
          Sign in
        </Link>{" "}
        to sync it across devices — anything already saved here will be carried over.
      </p>
    </div>
  );
}
