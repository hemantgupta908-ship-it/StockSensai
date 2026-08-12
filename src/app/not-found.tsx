import Link from "next/link";
import { House, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";

/**
 * 404. Reached most often from `notFound()` on the stock detail route, when a
 * ticker is unknown or isn't an NSE/BSE listing — so the copy says that rather
 * than a generic "page not found".
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-fill/10 text-label-secondary">
        <MagnifyingGlass size={26} />
      </div>

      <h1 className="mt-5 text-title2 font-bold tracking-tight text-label">Nothing here</h1>
      <p className="mt-2 max-w-sm text-subhead leading-relaxed text-label-secondary/70">
        This page doesn&apos;t exist. If you were looking for a stock, it may not be listed on NSE
        or BSE — those are the only exchanges WealthSensei covers.
      </p>

      <Link
        href="/home"
        className="mt-7 inline-flex h-[52px] items-center justify-center gap-2 rounded-[14px] bg-accent px-6 text-body font-semibold text-accent-fg shadow-pill"
      >
        <House size={17} />
        Go to Home
      </Link>
    </main>
  );
}
