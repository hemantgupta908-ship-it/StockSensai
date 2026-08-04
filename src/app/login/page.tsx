import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser, isSupabaseConfigured } from "@/lib/supabase/server";
import { LoginForm } from "@/components/auth/login-form";
import { DISCLAIMER_SHORT } from "@/components/disclaimer";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to sync your watchlist and journal across devices.",
};

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/home");

  return (
    <main className="flex min-h-dvh flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[18px] bg-blue shadow-pill">
            <svg viewBox="0 0 32 32" className="h-8 w-8" fill="none" aria-hidden>
              <path
                d="M5 22.5 12 14l5 5 9.5-11"
                stroke="white"
                strokeWidth="2.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M20.5 8h6v6"
                stroke="white"
                strokeWidth="2.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="text-title1 font-bold tracking-tight text-label">StockPilot</h1>
          <p className="mt-1.5 text-subhead text-label-secondary/65">
            Rule-based screens for NSE &amp; BSE stocks
          </p>
        </div>

        <LoginForm configured={isSupabaseConfigured} />

        <p className="mt-6 text-center text-caption leading-relaxed text-label-secondary/50">
          {DISCLAIMER_SHORT}{" "}
          <Link href="/disclaimer" className="font-semibold text-blue underline-offset-2 hover:underline">
            Full disclaimer
          </Link>
        </p>
      </div>
    </main>
  );
}
