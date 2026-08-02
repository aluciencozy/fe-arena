export type Environment = Record<string, string | undefined>;

export type RuntimeConfig = {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  frontendOrigins: readonly string[];
  trustProxy: boolean | number;
  supabase: {
    configured: boolean;
    authConfigured: boolean;
  };
};

export class ConfigurationError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid server configuration:\n${problems.map((problem) => `- ${problem}`).join("\n")}`);
    this.name = "ConfigurationError";
  }
}

const parsePort = (value: string | undefined, production: boolean, problems: string[]): number => {
  if (!value?.trim()) {
    if (production) problems.push("PORT must be set in production (use the port supplied by the hosting platform).");
    return 3001;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    problems.push("PORT must be an integer between 1 and 65535.");
    return 3001;
  }
  return port;
};

const parseOrigins = (environment: Environment, production: boolean, problems: string[]): string[] => {
  const raw = environment.FRONTEND_ORIGINS ?? environment.FRONTEND_ORIGIN;
  if (!raw?.trim()) {
    if (production) problems.push("FRONTEND_ORIGINS must contain at least one explicit https:// frontend origin.");
    return ["http://localhost:5173"];
  }
  const origins = raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const normalized: string[] = [];
  for (const origin of origins) {
    try {
      const parsed = new URL(origin);
      if (
        !/^https?:$/.test(parsed.protocol) ||
        parsed.pathname !== "/" ||
        parsed.search ||
        parsed.hash ||
        parsed.username ||
        parsed.password
      ) {
        throw new Error("not an origin");
      }
      const canonical = parsed.origin;
      if (!normalized.includes(canonical)) normalized.push(canonical);
    } catch {
      problems.push(
        `FRONTEND_ORIGINS contains an invalid origin: ${origin || "(empty)"}. Use comma-separated http(s) origins without paths.`,
      );
    }
  }
  if (production && (origins.includes("*") || normalized.some((origin) => origin.startsWith("http://")))) {
    problems.push(
      "Production frontend origins must be explicit HTTPS origins; wildcard or HTTP origins are not allowed.",
    );
  }
  if (!normalized.length) normalized.push("http://localhost:5173");
  return normalized;
};

const parseTrustProxy = (value: string | undefined, production: boolean, problems: string[]): boolean | number => {
  if (!value?.trim()) {
    if (production)
      problems.push("TRUST_PROXY must be set explicitly in production (for example true, false, or a hop count).");
    return false;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  const hops = Number(normalized);
  if (Number.isInteger(hops) && hops >= 0) return hops;
  problems.push("TRUST_PROXY must be true, false, or a non-negative integer hop count.");
  return false;
};

const validateSupabase = (environment: Environment, production: boolean, problems: string[]) => {
  const url = environment.SUPABASE_URL?.trim();
  const secret = environment.SUPABASE_SECRET_KEY?.trim();
  const publishable = environment.SUPABASE_PUBLISHABLE_KEY?.trim();
  const hasUrl = Boolean(url);
  const hasSecret = Boolean(secret);
  const hasPublishable = Boolean(publishable);
  if (hasSecret && !hasUrl) problems.push("SUPABASE_SECRET_KEY requires SUPABASE_URL.");
  if (hasUrl && !hasSecret && !hasPublishable)
    problems.push(
      "SUPABASE_URL requires SUPABASE_SECRET_KEY for persistence or SUPABASE_PUBLISHABLE_KEY for Auth-only verification.",
    );
  if (hasPublishable && !hasUrl) problems.push("SUPABASE_PUBLISHABLE_KEY requires SUPABASE_URL.");
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && production) problems.push("SUPABASE_URL must use https:// in production.");
    } catch {
      problems.push("SUPABASE_URL must be a valid URL.");
    }
  }
  return { configured: hasUrl && hasSecret, authConfigured: hasUrl && (hasPublishable || hasSecret) };
};

export const getRuntimeConfig = (environment: Environment = process.env): RuntimeConfig => {
  const nodeEnv = environment.NODE_ENV?.trim() || "development";
  const isProduction = nodeEnv === "production";
  const problems: string[] = [];
  const port = parsePort(environment.PORT, isProduction, problems);
  const frontendOrigins = parseOrigins(environment, isProduction, problems);
  const trustProxy = parseTrustProxy(environment.TRUST_PROXY, isProduction, problems);
  const supabase = validateSupabase(environment, isProduction, problems);
  if (problems.length) throw new ConfigurationError(problems);
  return { nodeEnv, isProduction, port, frontendOrigins, trustProxy, supabase };
};

export const startupDiagnostics = (config: RuntimeConfig): Record<string, unknown> => ({
  mode: config.nodeEnv,
  port: config.port,
  frontendOrigins: [...config.frontendOrigins],
  trustProxy: config.trustProxy,
  supabaseServerConfiguration: config.supabase.configured ? "configured" : "omitted; using guest/in-memory fallback",
  persistence: config.supabase.configured ? "supabase" : "in-memory guest fallback",
  guestGameplay: "enabled",
  authVerification: config.supabase.authConfigured ? "enabled" : "disabled",
});
