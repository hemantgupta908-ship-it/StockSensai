import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser, isSupabaseConfigured } from "@/lib/supabase/server";
import { resolveNext } from "@/lib/auth/destination";
import { CALLBACK_ERRORS, LoginScreen } from "@/components/auth/login-screen";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to sync your watchlist and journal across devices.",
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
    <LoginScreen
      configured={isSupabaseConfigured}
      next={destination}
      initialError={(callbackError && CALLBACK_ERRORS[callbackError]) || null}
    />
  );
}
