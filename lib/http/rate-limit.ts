import { createHash } from "node:crypto";

import { HttpRouteError } from "@/lib/http/route-error";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type ConsumeRateLimitOptions = {
  route: string;
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
};

export type RateLimitResult = {
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

const RATE_LIMIT_STORE = new Map<string, RateLimitEntry>();

function cleanupExpiredEntries(now: number) {
  for (const [key, value] of RATE_LIMIT_STORE.entries()) {
    if (value.resetAt <= now) {
      RATE_LIMIT_STORE.delete(key);
    }
  }
}

function normalizeClientIp(rawIp: string | null) {
  if (!rawIp) {
    return "unknown";
  }

  const firstForwardedIp = rawIp.split(",")[0]?.trim();
  return firstForwardedIp || "unknown";
}

function buildAuthorizationFingerprint(request: Request) {
  const authHeader = request.headers.get("authorization")?.trim();

  if (!authHeader) {
    return "no-auth";
  }

  return createHash("sha256").update(authHeader).digest("hex").slice(0, 24);
}

export function getClientRateLimitKey(request: Request) {
  const clientIp = normalizeClientIp(request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"));
  const authFingerprint = buildAuthorizationFingerprint(request);

  return `${clientIp}:${authFingerprint}`;
}

export function getRateLimitHeaders(result: RateLimitResult) {
  return {
    "x-ratelimit-limit": String(result.limit),
    "x-ratelimit-remaining": String(result.remaining),
    "x-ratelimit-reset": String(result.resetAt),
  };
}

export function consumeRateLimit(options: ConsumeRateLimitOptions): RateLimitResult {
  const now = options.now ?? Date.now();

  if (options.limit < 1) {
    throw new Error(`Rate limit for route ${options.route} must be >= 1`);
  }

  if (options.windowMs < 1000) {
    throw new Error(`Rate-limit window for route ${options.route} must be >= 1000ms`);
  }

  cleanupExpiredEntries(now);

  const storeKey = `${options.route}:${options.key}`;
  const existing = RATE_LIMIT_STORE.get(storeKey);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + options.windowMs;
    RATE_LIMIT_STORE.set(storeKey, { count: 1, resetAt });

    return {
      limit: options.limit,
      remaining: Math.max(options.limit - 1, 0),
      resetAt,
      retryAfterSeconds: Math.ceil(options.windowMs / 1000),
    };
  }

  existing.count += 1;

  const retryAfterSeconds = Math.max(Math.ceil((existing.resetAt - now) / 1000), 1);
  const remaining = Math.max(options.limit - existing.count, 0);

  if (existing.count > options.limit) {
    throw new HttpRouteError("Too many requests", {
      status: 429,
      code: "rate_limited",
      headers: {
        ...getRateLimitHeaders({
          limit: options.limit,
          remaining: 0,
          resetAt: existing.resetAt,
          retryAfterSeconds,
        }),
        "retry-after": String(retryAfterSeconds),
      },
    });
  }

  return {
    limit: options.limit,
    remaining,
    resetAt: existing.resetAt,
    retryAfterSeconds,
  };
}
