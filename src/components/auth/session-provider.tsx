"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

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
      setUser(data.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    await supabase.auth.signOut();
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
