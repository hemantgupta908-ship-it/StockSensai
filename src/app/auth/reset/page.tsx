import type { Metadata } from "next";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { BrandMark } from "@/components/auth/auth-artwork";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Set a new password",
  robots: { index: false, follow: false },
};

/**
 * Landing point for the password-recovery link.
 *
 * `/auth/callback` has already exchanged the recovery code for a session by the
 * time the user gets here, so this screen only has to collect the new password.
 * It lives under `/auth`, which the middleware treats as public — the session
 * that authorises the change comes from the emailed link, not a prior sign-in.
 */
export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-dvh flex-col justify-center bg-bg px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-7 text-center">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[18px] bg-brand shadow-pill">
            <BrandMark className="h-7 w-7 text-brand-fg" />
          </span>
          <h1 className="text-title1 font-bold tracking-tight text-label">Set a new password</h1>
          <p className="mt-1.5 text-subhead text-label-secondary/65">
            Choose something you haven’t used here before.
          </p>
        </div>

        <ResetPasswordForm configured={isSupabaseConfigured} />
      </div>
    </main>
  );
}
