import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { setSocketAccessToken } from "@/lib/socket";
import { supabase } from "@/lib/supabase";
import { AuthContext, type AuthContextValue } from "@/context/auth-context";
const authError = (error: unknown) => error instanceof Error ? error.message : "Authentication failed. Try again.";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(Boolean(supabase));
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) { setSocketAccessToken(null); return; }
    let mounted = true;
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return;
      if (sessionError) setError(authError(sessionError));
      setUser(data.session?.user ?? null);
      setAccessToken(data.session?.access_token ?? null);
      setSocketAccessToken(data.session?.access_token ?? null);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session: Session | null) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setAccessToken(session?.access_token ?? null);
      setSocketAccessToken(session?.access_token ?? null);
      setLoading(false);
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    configured: Boolean(supabase), loading, user, accessToken, error,
    signIn: async (email, password) => {
      if (!supabase) return setError("Account sign-in is not configured yet. Guest play is still available.");
      const result = await supabase.auth.signInWithPassword({ email, password });
      if (result.error) setError(authError(result.error)); else setError(null);
    },
    signUp: async (email, password) => {
      if (!supabase) return setError("Account sign-in is not configured yet. Guest play is still available.");
      const result = await supabase.auth.signUp({ email, password });
      if (result.error) setError(authError(result.error));
      else setError(result.data.session ? null : "Check your email to confirm your account, then sign in.");
    },
    signOut: async () => {
      if (!supabase) return;
      const result = await supabase.auth.signOut();
      if (result.error) setError(authError(result.error)); else setError(null);
    },
    clearError: () => setError(null),
  }), [accessToken, error, loading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

