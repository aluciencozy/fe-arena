import type { NextFunction, Request, RequestHandler, Response } from "express";

export type RateDecision = { allowed: boolean; retryAfterSeconds: number };

type Bucket = { count: number; resetAt: number };

export class FixedWindowLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly limit: number, private readonly windowMs: number) {}

  check(key: string, now = Date.now()): RateDecision {
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + this.windowMs };
      this.buckets.set(key, bucket);
    }
    if (bucket.count >= this.limit) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
    }
    bucket.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  clear(keyPrefix?: string): void {
    if (!keyPrefix) this.buckets.clear();
    else for (const key of this.buckets.keys()) if (key.startsWith(keyPrefix)) this.buckets.delete(key);
  }
}

export const createIpRateLimit = (limit: number, windowMs: number): RequestHandler => {
  const limiter = new FixedWindowLimiter(limit, windowMs);
  return (request: Request, response: Response, next: NextFunction) => {
    const decision = limiter.check(request.ip || "unknown");
    if (decision.allowed) return next();
    response.set("Retry-After", String(decision.retryAfterSeconds));
    return response.status(429).json({ code: "RATE_LIMITED", message: "Too many requests. Please try again shortly." });
  };
};

export const isAllowedOrigin = (origin: string | undefined, allowedOrigins: readonly string[], requireOrigin = false): boolean => {
  if (!origin) return !requireOrigin;
  return allowedOrigins.includes(origin);
};

export const securityHeaders = (production: boolean) => (_request: Request, response: Response, next: NextFunction): void => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  if (production) response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
};
