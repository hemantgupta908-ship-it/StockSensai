"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, CheckCircle, Eye, EyeSlash, Info } from "@phosphor-icons/react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { REMEMBER_COOKIE, REMEMBERED_MAX_AGE } from "@/lib/auth/remember";
import { DEFAULT_SIGNED_IN_PATH } from "@/lib/auth/destination";
import { isDriveStorageEnabled, isGoogleAuthEnabled } from "@/lib/env";
import { DRIVE_SCOPE } from "@/lib/drive/token";
import { Button } from "@/components/ui/button";

type Mode = "signin" | "signup";
type Status = "idle" | "working" | "check-email" | "reset-sent";

/**
 * Sign-in keeps the brand green rather than following the accent, but takes it
 * from `--brand` instead of a literal hex so it still lives in the theme system
 * and can shift per theme.
 *
 * `text-brand-fg` matters: the accent's white label is only 4.7:1, which is why
 * "Log In" looked washed out on the blue. Green pins white at 6.0:1.
 *
 * `shadow-pill` and `active:` are restated because overriding a Button's
 * background by className drops the `primary` variant's own background but
 * keeps the rest — spelling them out keeps this button identical in behaviour
 * to every other primary button in the app.
 */
const BRAND = "bg-brand text-brand-fg shadow-pill active:bg-brand/90";
const BRAND_TEXT = "text-brand";

/**
 * Accounts created from a bare username get a synthetic address on this domain.
 * It receives no mail, which is exactly why the reset flow has to special-case
 * it rather than silently "sending" to a black hole.
 */
const USERNAME_DOMAIN = "wealthsensei.app";

/**
 * The domain username accounts used before the rename. Sign-in retries against
 * it so accounts created as `hemant@stocksensei.app` still work — the address
 * is an opaque internal identifier, and rebranding must not lock anyone out.
 */
const LEGACY_USERNAME_DOMAIN = "stocksensei.app";

/**
 * Google sign-in is opt-in: the button only renders once the provider is
 * actually enabled in the Supabase project. Showing it unconditionally would
 * mean a prominent button that errors for every self-hosted clone.
 */
const GOOGLE_ENABLED = isGoogleAuthEnabled;

const FIELD =
  "w-full rounded-[12px] border border-separator/50 bg-bg px-4 py-3 text-body text-label " +
  "placeholder:text-label-quaternary/55 transition-colors " +
  "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 " +
  "dark:border-white/[0.10] dark:bg-white/[0.04]";

const LABEL = "mb-1.5 block text-footnote font-semibold text-label";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 18 18" className="h-[18px] w-[18px]" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

export function LoginForm({
  configured,
  next = DEFAULT_SIGNED_IN_PATH,
  initialError = null,
}: {
  configured: boolean;
  next?: string;
  /** Message from a failed `/auth/callback` round trip, already made safe. */
  initialError?: string | null;
}) {
  const router = useRouter();
  const emailId = useId();
  const passwordId = useId();
  const rememberId = useId();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(initialError);

  // With no Supabase project the app is still fully usable; say so plainly
  // rather than presenting a sign-in form that cannot work.
  if (!configured) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-[14px] bg-brand/[0.08] px-4 py-3.5">
          <Info size={16} className={`mt-[1px] shrink-0 ${BRAND_TEXT}`} />
          <div>
            <p className="text-subhead font-semibold text-label">Demo mode</p>
            <p className="mt-1 text-footnote leading-relaxed text-label-secondary/80">
              No Supabase project is configured, so accounts are disabled. Everything else works:
              screens, charts, strategy explainers, watchlist and journal all run against seeded
              data, saved in this browser.
            </p>
            <p className="mt-2 text-caption leading-relaxed text-label-secondary/75">
              To enable accounts, add <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
              and <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{" "}
              <code className="font-mono">.env.local</code>, then run{" "}
              <code className="font-mono">supabase/schema.sql</code>.
            </p>
          </div>
        </div>
        <Button
          fullWidth
          size="lg"
          className={BRAND}
          onClick={() => router.push(DEFAULT_SIGNED_IN_PATH)}
        >
          Continue to app
          <ArrowRight size={17} />
        </Button>
      </div>
    );
  }

  /** A bare username is resolved to a synthetic address; an email passes through. */
  function resolveEmail(): string {
    const clean = email.trim();
    return clean.includes("@") ? clean : `${clean.toLowerCase()}@${USERNAME_DOMAIN}`;
  }

  /**
   * Record the "remember me" choice before signing in.
   *
   * The Supabase client fixes the auth cookie's lifetime when it is
   * constructed, which by then has already happened — the session provider
   * builds it on mount, long before the user touches this checkbox. Rebuilding
   * the client here would fix that but leave the session provider subscribed to
   * a discarded instance, so instead the flag is simply written first and the
   * middleware corrects the cookie on the next request. Sign-in navigates
   * immediately, so "next request" is milliseconds away.
   */
  function applyRememberChoice() {
    document.cookie = remember
      ? `${REMEMBER_COOKIE}=1; path=/; max-age=${REMEMBERED_MAX_AGE}; samesite=lax`
      : `${REMEMBER_COOKIE}=0; path=/; samesite=lax`;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("working");
    setError(null);

    applyRememberChoice();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setStatus("idle");
      return;
    }

    const resolvedEmail = resolveEmail();

    try {
      if (mode === "signup") {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: resolvedEmail,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (signUpError) throw signUpError;

        // Session created straight away means email confirmation is disabled.
        if (signUpData.session) {
          router.push(next);
          router.refresh();
          return;
        }

        // Try signing in directly, in case confirmation is off but no session
        // came back with the sign-up response.
        const { error: directSignInError } = await supabase.auth.signInWithPassword({
          email: resolvedEmail,
          password,
        });
        if (!directSignInError) {
          router.push(next);
          router.refresh();
          return;
        }

        setStatus("check-email");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: resolvedEmail,
        password,
      });

      if (signInError) {
        // A username that doesn't resolve may belong to a pre-rename account.
        const isUsername = !email.trim().includes("@");
        if (!isUsername) throw signInError;

        const { error: legacyError } = await supabase.auth.signInWithPassword({
          email: `${email.trim().toLowerCase()}@${LEGACY_USERNAME_DOMAIN}`,
          password,
        });
        if (legacyError) throw signInError;
      }

      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("idle");
    }
  }

  async function sendReset() {
    const clean = email.trim();
    if (!clean) {
      setError("Enter your email address first, then tap “Forgot password?”.");
      return;
    }
    if (!clean.includes("@")) {
      setError(
        "Password reset needs a real email address. Accounts created with just a username have no inbox to send to.",
      );
      return;
    }

    setStatus("working");
    setError(null);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setStatus("idle");
      return;
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(clean, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset`,
    });

    if (resetError) {
      setError(resetError.message);
      setStatus("idle");
      return;
    }
    setStatus("reset-sent");
  }

  /**
   * Hands off to Google. On success this never returns — the browser is already
   * navigating — so `status` is only ever reset on the failure path.
   */
  async function signInWithGoogle() {
    setError(null);
    setStatus("working");
    applyRememberChoice();

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setStatus("idle");
      return;
    }

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        /**
         * Ask for the app-folder scope during sign-in, not on first save.
         *
         * A Google account's data lives in that account's own Drive, so the
         * scope is not an optional extra to be requested later — it is where
         * the user's watchlist and budget are about to go. Bundling it into the
         * one consent screen also means a single decision rather than a second
         * Google prompt appearing mid-task, which reads like something has gone
         * wrong.
         */
        ...(isDriveStorageEnabled ? { scopes: DRIVE_SCOPE } : {}),
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setStatus("idle");
    }
  }

  if (status === "check-email" || status === "reset-sent") {
    const isReset = status === "reset-sent";
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        className="space-y-4 rounded-card border border-separator/40 bg-bg-secondary p-6 text-center shadow-card dark:border-white/[0.06] dark:bg-white/[0.03] dark:shadow-card-dark"
      >
        <CheckCircle size={36} className={`mx-auto ${BRAND_TEXT}`} />
        <div>
          <h2 className="text-headline font-semibold text-label">
            {isReset ? "Reset link sent" : "Account registered"}
          </h2>
          <p className="mt-1.5 text-footnote leading-relaxed text-label-secondary/80">
            {isReset ? (
              <>
                If an account exists for{" "}
                <span className="font-semibold text-label">{email.trim()}</span>, a link to set a
                new password is on its way. It expires in an hour.
              </>
            ) : (
              <>
                Your account <span className="font-semibold text-label">{email.trim()}</span> has
                been created. If email verification is enabled on your Supabase project, check your
                inbox — otherwise sign in below.
              </>
            )}
          </p>
        </div>

        <Button
          fullWidth
          size="lg"
          className={BRAND}
          onClick={() => {
            setMode("signin");
            setStatus("idle");
          }}
        >
          Back to sign in
        </Button>
      </motion.div>
    );
  }

  const working = status === "working";

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor={emailId} className={LABEL}>
          Email or username <span className="text-red/75">*</span>
        </label>
        <input
          id={emailId}
          name="email"
          type="text"
          required
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className={FIELD}
        />
      </div>

      <div>
        <label htmlFor={passwordId} className={LABEL}>
          Password <span className="text-red/75">*</span>
        </label>
        <div className="relative">
          <input
            id={passwordId}
            name="password"
            type={showPassword ? "text" : "password"}
            required
            minLength={8}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
            className={`${FIELD} pr-12`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-[10px] text-label-secondary/75 active:bg-fill/10"
          >
            {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      {/*
        The negative margins on the two controls below are deliberate: they pad
        18px-tall text out to a ~44px touch target without adding 26px of
        visible whitespace to the row.
      */}
      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor={rememberId}
          className="-my-3 flex cursor-pointer select-none items-center gap-2 py-3 text-footnote text-label-secondary"
        >
          <input
            id={rememberId}
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-[18px] w-[18px] shrink-0 cursor-pointer rounded-[5px] border-separator accent-brand"
          />
          Remember me
        </label>

        {mode === "signin" && (
          <button
            type="button"
            onClick={sendReset}
            disabled={working}
            className={`-my-3 py-3 text-footnote font-semibold ${BRAND_TEXT} disabled:opacity-40`}
          >
            Forgot password?
          </button>
        )}
      </div>

      <AnimatePresence>
        {error && (
          <motion.p
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-[10px] bg-red/[0.08] px-3 py-2 text-footnote leading-relaxed text-red"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <Button type="submit" fullWidth size="lg" className={BRAND} disabled={working}>
        {working ? "Working…" : mode === "signup" ? "Create account" : "Log In"}
      </Button>

      {GOOGLE_ENABLED && (
        <>
          <div className="flex items-center gap-3 py-1">
            <span className="h-px flex-1 bg-separator/50" />
            <span className="text-caption text-label-secondary/70">Or continue with</span>
            <span className="h-px flex-1 bg-separator/50" />
          </div>

          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={working}
            className="
              flex h-[52px] w-full items-center justify-center gap-2.5 rounded-[14px]
              border border-separator/50 bg-bg text-subhead font-semibold text-label
              transition-colors active:bg-fill/[0.08] disabled:opacity-40
              dark:border-white/[0.10] dark:bg-white/[0.04]
            "
          >
            <GoogleIcon />
            Google
          </button>

          {/*
            Google's consent screen is about to ask for Drive access, which is
            alarming without context — it reads like the app wants to rummage
            through your files. Saying why first, in one line, is the difference
            between a considered yes and a bounce.
          */}
          {isDriveStorageEnabled && (
            <p className="text-center text-caption leading-relaxed text-label-secondary/70">
              Sign in with Google and your watchlist, journal and budget are saved to a private
              folder in your own Google Drive — never to our servers.
            </p>
          )}
        </>
      )}

      <p className="pt-1 text-center text-footnote text-label-secondary/80">
        {mode === "signin" ? "Don’t have an account?" : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
          }}
          className={`-my-2 px-1 py-2 font-semibold ${BRAND_TEXT}`}
        >
          {mode === "signin" ? "Sign up" : "Sign in"}
        </button>
      </p>
    </form>
  );
}
