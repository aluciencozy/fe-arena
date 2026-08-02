import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type AuthIdentity = { id: string };
export interface AuthVerifier {
  verifyAccessToken(token: string): Promise<AuthIdentity | null>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isAuthUserId = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

export class SupabaseAuthVerifier implements AuthVerifier {
  constructor(
    url: string,
    publishableKey: string,
    private readonly client: SupabaseClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }),
  ) {}

  async verifyAccessToken(token: string): Promise<AuthIdentity | null> {
    if (!token.trim()) return null;
    const { data, error } = await this.client.auth.getUser(token);
    if (error || !isAuthUserId(data.user?.id)) return null;
    return { id: data.user.id };
  }
}

export class UnavailableAuthVerifier implements AuthVerifier {
  async verifyAccessToken(_token: string): Promise<AuthIdentity | null> {
    return null;
  }
}

export type AuthEnvironment = {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
};
export const createAuthVerifier = (environment: AuthEnvironment = process.env): AuthVerifier => {
  const url = environment.SUPABASE_URL?.trim();
  // A server may use the publishable key for verification; the secret key remains
  // server-only and is only a compatibility fallback for existing deployments.
  const key = environment.SUPABASE_PUBLISHABLE_KEY?.trim() || environment.SUPABASE_SECRET_KEY?.trim();
  return url && key ? new SupabaseAuthVerifier(url, key) : new UnavailableAuthVerifier();
};

export const bearerToken = (header: string | undefined): string | null => {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
};

export const verifyBearerHeader = async (
  verifier: AuthVerifier,
  header: string | undefined,
): Promise<AuthIdentity | null> => {
  const token = bearerToken(header);
  if (!token) return null;
  try {
    return await verifier.verifyAccessToken(token);
  } catch {
    return null;
  }
};
