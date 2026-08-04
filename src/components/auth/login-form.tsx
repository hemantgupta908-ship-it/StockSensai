"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, CheckCircle2, Info } from "lucide-react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type Mode = "signin" | "signup";

export function LoginForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "working" | "check-email">("idle");
  const [error, setError] = useState<string | null>(null);

  // With no Supabase project the app is still fully usable; say so plainly
  // rather than presenting a sign-in form that cannot work.
  if (!configured) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-[14px] bg-blue/[0.08] px-4 py-3.5">
          <Info size={16} className="mt-[1px] shrink-0 text-blue" strokeWidth={2.2} />
          <div>
            <p className="text-subhead font-semibold text-label">Demo mode</p>
            <p className="mt-1 text-footnote leading-relaxed text-label-secondary/65">
              No Supabase project is configured, so accounts are disabled. Everything else works:
              screens, charts, strategy explainers, watchlist and journal all run against seeded
              data, saved in this browser.
            </p>
            <p className="mt-2 text-caption leading-relaxed text-label-secondary/55">
              To enable accounts, add <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
              and <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{" "}
              <code className="font-mono">.env.local</code>, then run{" "}
              <code className="font-mono">supabase/schema.sql</code>.
            </p>
          </div>
        </div>
        <Button fullWidth size="lg" onClick={() => router.push("/home")}>
          Continue to app
          <ArrowRight size={17} strokeWidth={2.6} />
        </Button>
      </div>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setStatus("working");
    setError(null);

    try {
      if (mode === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (signUpError) throw signUpError;
        setStatus("check-email");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      router.push("/home");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("idle");
    }
  }

  if (status === "check-email") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        className="rounded-card border border-separator/40 bg-bg-secondary p-6 text-center shadow-card dark:border-white/[0.06] dark:shadow-card-dark"
      >
        <CheckCircle2 size={34} className="mx-auto text-green" strokeWidth={2} />
        <h2 className="mt-3 text-headline font-semibold text-label">Check your email</h2>
        <p className="mt-1.5 text-footnote leading-relaxed text-label-secondary/65">
          We sent a confirmation link to <span className="font-semibold">{email}</span>. Open it to
          finish creating your account.
        </p>
      </motion.div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="overflow-hidden rounded-card border border-separator/40 bg-bg-secondary shadow-card dark:border-white/[0.06] dark:shadow-card-dark">
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full border-b border-separator/40 bg-transparent px-4 py-3.5 text-body text-label placeholder:text-label-quaternary/35 focus:outline-none dark:border-white/[0.06]"
        />
        <input
          type="password"
          required
          minLength={8}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === "signup" ? "Password (min 8 characters)" : "Password"}
          className="w-full bg-transparent px-4 py-3.5 text-body text-label placeholder:text-label-quaternary/35 focus:outline-none"
        />
      </div>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="px-1 text-footnote text-red"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <Button type="submit" fullWidth size="lg" disabled={status === "working"}>
        {status === "working"
          ? "Working…"
          : mode === "signup"
            ? "Create account"
            : "Sign in"}
      </Button>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError(null);
        }}
        className="w-full py-2 text-footnote font-medium text-blue"
      >
        {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>

      <button
        type="button"
        onClick={() => router.push("/home")}
        className="w-full py-1 text-footnote text-label-secondary/50"
      >
        Skip — browse without an account
      </button>
    </form>
  );
}
