import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser, isSupabaseConfigured } from "@/lib/supabase/server";
import { LoginForm } from "@/components/auth/login-form";
import { AuthArtwork, BrandMark } from "@/components/auth/auth-artwork";
import { DISCLAIMER_SHORT } from "@/components/disclaimer";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to sync your watchlist and journal across devices.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Only ever bounce back to a path inside this app — an absolute URL here
  // would turn the sign-in screen into an open redirect.
  const destination = next && next.startsWith("/") && !next.startsWith("//") ? next : "/home";

  const user = await getCurrentUser();
  if (user) redirect(destination);

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
            rounded-b-[28px] bg-[#17714A] bg-gradient-to-br from-[#1B7B50] to-[#105239]
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
        <div className="flex flex-col justify-center px-6 py-8 sm:px-10 lg:px-14 lg:py-14">
          <div className="mx-auto w-full max-w-sm">
            <h1 className="text-largetitle font-bold tracking-tight text-label/90">Welcome back!</h1>
            <p className="mt-1.5 text-subhead text-label-secondary/80">
              Sign in to sync your watchlist, journal and budget across devices.
            </p>

            <div className="mt-7">
              <LoginForm configured={isSupabaseConfigured} next={destination} />
            </div>

            <p className="mt-8 text-center text-caption leading-relaxed text-label-secondary/75">
              {DISCLAIMER_SHORT}{" "}
              <Link
                href="/disclaimer"
                className="font-semibold text-accent underline-offset-2 hover:underline"
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
