import { createContext } from "react";
import type { User } from "@supabase/supabase-js";

export type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  user: User | null;
  accessToken: string | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
