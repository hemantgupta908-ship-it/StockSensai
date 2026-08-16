import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser, isSupabaseConfigured } from "@/lib/supabase/server";
import { resolveNext } from "@/lib/auth/destination";
import { LoginForm } from "@/components/auth/login-form";
import { AuthArtwork, BrandMark } from "@/components/auth/auth-artwork";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { DISCLAIMER_SHORT } from "@/lib/disclaimer";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to sync your watchlist and journal across devices.",
};

/**
 * Reasons `/auth/callback` can bounce someone back here.
 *
 * Anything not in this map is ignored rather than echoed — the value arrives in
 * a query string, so rendering it verbatim would let a crafted link put
 * arbitrary text on the sign-in screen.
 */
const CALLBACK_ERRORS: Record<string, string> = {
  cancelled: "Google sign-in was cancelled. Nothing has changed on your account.",
  provider: "Google couldn’t complete the sign-in. Try again, or use your email and password.",
  auth: "That sign-in link didn’t work — it may have already been used, or expired.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error: callbackError } = (await searchParams) || {};
  const destination = resolveNext(next);

  try {
    const user = await getCurrentUser();
    if (user) redirect(destination);
  } catch (error: any) {
    if (error?.digest?.startsWith?.("NEXT_REDIRECT")) throw error;
    // Otherwise continue to render login form in demo mode
  }

  return (
    <main className="min-h-dvh bg-bg lg:grid lg:place-items-center lg:p-6">
      <div
        className="
          w-full overflow-hidden bg-bg
          lg:grid lg:max-w-[1060px] lg:grid-cols-2 lg:rounded-[32px]
          lg:bg-bg-secondary lg:shadow-[0_24px_80px_-32px_rgb(0_0_0/0.18)]
        "
      >
        {/*
          Brand panel. On a phone this is a compact banner the form sits under;
          from `lg` it becomes the full-height left half of the card. The
          artwork is dropped below `lg` rather than scaled down — at banner
          height it would be illegible and would push the form below the fold,
          which on a sign-in screen is the one thing that must stay reachable.
        */}
        <aside
          className="
            relative flex flex-col justify-between overflow-hidden
            rounded-b-[28px] bg-brand bg-gradient-to-br from-[#1B7B50] to-[#105239]
            px-6 pb-7 pt-[calc(env(safe-area-inset-top)+1.25rem)] text-white
            lg:rounded-none lg:px-12 lg:pb-12 lg:pt-12
          "
        >
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-white/15 backdrop-blur-sm">
              <BrandMark className="h-6 w-6 text-white" />
            </span>
            <span className="text-headline font-semibold tracking-tight lg:hidden">
              WealthSensei
            </span>
          </div>

          <div className="mt-5 lg:mt-0">
            <h2 className="text-title1 font-bold leading-tight tracking-tight lg:text-[40px] lg:leading-[1.1]">
              Hi there,
              <br />
              great to see you
            </h2>
            {/*
              Hidden on phones. The banner is fixed furniture above a form, and
              every line here pushes the "Log In" button further down — on a
              667px-tall handset this paragraph alone was enough to put it below
              the fold. The subtitle beside the form says the same thing anyway.
            */}
            <p className="mt-4 hidden max-w-sm text-subhead leading-relaxed text-white/80 lg:block">
              Twenty-five rule-based screens across five trading styles, on NSE and BSE listings.
            </p>
          </div>

          <AuthArtwork className="mx-auto mt-10 hidden h-auto w-full max-w-[360px] text-white/90 lg:block" />

          <p className="hidden text-caption text-white/75 lg:block">
            Educational screening only · never investment advice
          </p>

          {/* Soft glow behind the artwork, purely decorative. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 top-1/3 h-72 w-72 rounded-full bg-white/[0.07] blur-3xl"
          />
        </aside>

        {/* Form side */}
        <div className="relative flex flex-col justify-center px-6 py-8 sm:px-10 lg:px-14 lg:py-14">
          {/*
            Absolutely placed rather than sitting in the flow: this column is
            already tight enough on a short handset that the artwork and the
            brand paragraph had to go, and a row of its own would push "Log In"
            back below the fold.
          */}
          <ThemeToggle className="absolute right-5 top-5 z-10 lg:right-6 lg:top-6" />

          <div className="mx-auto w-full max-w-sm">
            <h1 className="text-largetitle font-bold tracking-tight text-label/90">Welcome back!</h1>
            <p className="mt-1.5 text-subhead text-label-secondary/80">
              Sign in to sync your watchlist, journal and budget across devices.
            </p>

            <div className="mt-7">
              <LoginForm
                configured={isSupabaseConfigured}
                next={destination}
                initialError={(callbackError && CALLBACK_ERRORS[callbackError]) || null}
              />
            </div>

            <p className="mt-8 text-center text-caption leading-relaxed text-label-secondary/75">
              {DISCLAIMER_SHORT}{" "}
              <Link
                href="/disclaimer"
                className="font-semibold text-brand underline-offset-2 hover:underline"
              >
                Full disclaimer
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
