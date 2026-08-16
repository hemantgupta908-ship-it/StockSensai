"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Eye, EyeSlash, Warning } from "@phosphor-icons/react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { DEFAULT_SIGNED_IN_PATH } from "@/lib/auth/destination";
import { Button } from "@/components/ui/button";

/** Matches the sign-in CTA; see the note on `BRAND` in `login-form.tsx`. */
const BRAND = "bg-brand text-brand-fg shadow-pill active:bg-brand/90";

const FIELD =
  "w-full rounded-[12px] border border-separator/50 bg-bg-secondary px-4 py-3 text-body text-label " +
  "placeholder:text-label-quaternary/55 transition-colors " +
  "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 " +
  "dark:border-white/[0.10] dark:bg-white/[0.04]";

const MIN_LENGTH = 8;

export function ResetPasswordForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const passwordId = useId();
  const confirmId = useId();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Null while unknown — the session check is async and must not flash a warning. */
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  // The recovery link is what authorises this change. Without a session the
  // update would fail with an opaque error, so check up front and say why.
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setHasSession(false);
      return;
    }
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setHasSession(Boolean(data.session));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!configured) {
    return (
      <p className="rounded-card bg-bg-secondary p-5 text-center text-footnote leading-relaxed text-label-secondary">
        Accounts are disabled in demo mode, so there is no password to reset.
      </p>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Those two passwords don’t match.");
      return;
    }

    setWorking(true);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setWorking(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    setWorking(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="space-y-4 rounded-card border border-separator/40 bg-bg-secondary p-6 text-center shadow-card dark:border-white/[0.06] dark:bg-white/[0.03]">
        <CheckCircle size={36} className="mx-auto text-brand" />
        <div>
          <h2 className="text-headline font-semibold text-label">Password updated</h2>
          <p className="mt-1.5 text-footnote leading-relaxed text-label-secondary/65">
            You’re signed in on this device. Other devices will need the new password.
          </p>
        </div>
        <Button
          fullWidth
          size="lg"
          className={BRAND}
          onClick={() => {
            router.push(DEFAULT_SIGNED_IN_PATH);
            router.refresh();
          }}
        >
          Continue to app
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {hasSession === false && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[12px] bg-amber/[0.10] px-3.5 py-3 text-footnote leading-relaxed text-label"
        >
          <Warning size={16} className="mt-[2px] shrink-0 text-amber" />
          <span>
            This recovery link has expired or was already used. Request a new one from the sign-in
            screen.
          </span>
        </p>
      )}

      <div>
        <label htmlFor={passwordId} className="mb-1.5 block text-footnote font-semibold text-label">
          New password <span className="text-red">*</span>
        </label>
        <div className="relative">
          <input
            id={passwordId}
            type={show ? "text" : "password"}
            required
            minLength={MIN_LENGTH}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={`At least ${MIN_LENGTH} characters`}
            className={`${FIELD} pr-12`}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-[10px] text-label-secondary/60 active:bg-fill/10"
          >
            {show ? <EyeSlash size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      <div>
        <label htmlFor={confirmId} className="mb-1.5 block text-footnote font-semibold text-label">
          Confirm password <span className="text-red">*</span>
        </label>
        <input
          id={confirmId}
          type={show ? "text" : "password"}
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Type it again"
          className={FIELD}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-[10px] bg-red/[0.08] px-3 py-2 text-footnote leading-relaxed text-red"
        >
          {error}
        </p>
      )}

      <Button
        type="submit"
        fullWidth
        size="lg"
        className={BRAND}
        disabled={working || hasSession === false}
      >
        {working ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
