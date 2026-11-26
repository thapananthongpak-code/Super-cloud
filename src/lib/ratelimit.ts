import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let redisClient: Redis | null = null;

function isConfigured() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

export function redis(): Redis {
  if (!redisClient) {
    if (!isConfigured()) throw new Error("Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN");
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return redisClient;
}

type LimiterName = "uploadInit" | "uploadComplete" | "download" | "passwordFail" | "adminPin";

const configs: Record<LimiterName, { tokens: number; window: `${number} ${"s" | "m" | "h"}` }> = {
  uploadInit: { tokens: 10, window: "10 m" },
  uploadComplete: { tokens: 20, window: "10 m" },
  download: { tokens: 60, window: "1 m" },
  passwordFail: { tokens: 5, window: "15 m" },
  adminPin: { tokens: 5, window: "15 m" },
};

const limiters = new Map<LimiterName, Ratelimit>();

function limiter(name: LimiterName): Ratelimit {
  let l = limiters.get(name);
  if (!l) {
    const { tokens, window } = configs[name];
    l = new Ratelimit({
      redis: redis(),
      limiter: Ratelimit.slidingWindow(tokens, window),
      prefix: `rl:${name}`,
    });
    limiters.set(name, l);
  }
  return l;
}

/** Consumes one token. Returns true if the request is allowed. */
export async function rateLimit(name: LimiterName, key: string): Promise<boolean> {
  const l = limiter(name);
  const { success } = await l.limit(key);
  return success;
}

/** Checks remaining tokens without consuming one. */
export async function isRateLimited(name: LimiterName, key: string): Promise<boolean> {
  const { remaining } = await limiter(name).getRemaining(key);
  return remaining <= 0;
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
