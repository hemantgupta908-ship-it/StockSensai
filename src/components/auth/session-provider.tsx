"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { clearDriveToken } from "@/lib/drive/token";

interface SessionValue {
  user: User | null;
  loading: boolean;
  /** False when the app is running without a Supabase project configured. */
  authEnabled: boolean;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue>({
  user: null,
  loading: false,
  authEnabled: false,
  signOut: async () => {},
});

/**
 * Keep the object we already have when the session still describes the same
 * person.
 *
 * Supabase hands back a *new* `User` on every token refresh, and Android fires
 * one every time the app returns to the foreground. Storing it re-runs every
 * effect keyed on `user` — including the budget provider's re-hydration, which
 * puts a skeleton on screen and so unmounts everything under it, a half-filled
 * transaction sheet included. Nothing downstream cares that the object is new;
 * they care which account it is.
 */
function keepIfSamePerson(previous: User | null, next: User | null): User | null {
  return previous && next && previous.id === next.id ? previous : next;
}

export function SessionProvider({
  initialUser = null,
  children,
}: {
  initialUser?: User | null;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      setUser((prev) => keepIfSamePerson(prev, data.user ?? null));
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser((prev) => keepIfSamePerson(prev, session?.user ?? null));
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    // The Drive token outlives the Supabase session otherwise — it is held in a
    // module variable, not a cookie — and signing into a second account in the
    // same tab would then write the first account's Drive.
    clearDriveToken();
    setUser(null);
  };

  return (
    <SessionContext.Provider value={{ user, loading, authEnabled: isSupabaseConfigured, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
