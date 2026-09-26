import 'server-only';

/**
 * Privacy/security roadmap — Phase 5 rate limiting.
 *
 * Token-bucket per (key, kind). The key is operator-chosen: pass
 * `clerkUserId` for per-user limits, `org_${orgId}` for per-workspace,
 * or `ip_${ip}` for unauthenticated burst defense.
 *
 * Implementation:
 *   - **In-memory fallback (dev, single-instance).** A `Map<key, state>`
 *     local to the process. Works for local dev + low-traffic deploys.
 *     Useless against distributed abuse — a Vercel cold start resets
 *     state.
 *   - **Upstash Redis (production).** When `UPSTASH_REDIS_REST_URL`
 *     + `UPSTASH_REDIS_REST_TOKEN` are set, the helper switches to a
 *     REST-based atomic decrement. We don't load `@upstash/redis` to
 *     keep the dep surface small; the REST call is two lines of fetch.
 *
 * Failure mode: any Upstash error is logged and **permits** the
 * request (fail-open). Rate-limit infrastructure should never take the
 * site offline. The audit log (`audit_events`) plus the anomaly
 * detector are the backstop for abuse signals when this layer's
 * unavailable.
 *
 * Tier discipline: the helper writes no PII. Keys are opaque ids;
 * the `kind` is a tightly-controlled enum string. Internal-tier only.
 */

export type RateLimitKind =
  | 'ai_surface'
  | 'csv_export'
  | 'pdf_print'
  | 'share_link_create'
  | 'member_invite'
  | 'api_general';

interface BucketConfig {
  /** Max tokens in the bucket. */
  capacity: number;
  /** Tokens refilled per minute. */
  refillPerMinute: number;
}

const BUCKETS: Record<RateLimitKind, BucketConfig> = {
  ai_surface: { capacity: 30, refillPerMinute: 6 }, // 6/min sustained, 30 burst
  csv_export: { capacity: 10, refillPerMinute: 2 },
  pdf_print: { capacity: 20, refillPerMinute: 4 },
  share_link_create: { capacity: 10, refillPerMinute: 1 },
  member_invite: { capacity: 20, refillPerMinute: 2 },
  api_general: { capacity: 120, refillPerMinute: 60 },
};

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetSeconds: number;
}

interface InMemoryState {
  tokens: number;
  lastRefillMs: number;
}
const memoryStore = new Map<string, InMemoryState>();

function upstashEnabled(): boolean {
  return (
    !!process.env.UPSTASH_REDIS_REST_URL &&
    !!process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

export async function rateLimit(
  key: string,
  kind: RateLimitKind,
): Promise<RateLimitResult> {
  const cfg = BUCKETS[kind];
  if (upstashEnabled()) {
    try {
      return await rateLimitUpstash(key, kind, cfg);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[rate-limit] upstash failed; fail-open:', err);
    }
  }
  return rateLimitInMemory(key, kind, cfg);
}

function rateLimitInMemory(
  key: string,
  kind: RateLimitKind,
  cfg: BucketConfig,
): RateLimitResult {
  const now = Date.now();
  const bucketKey = `${kind}:${key}`;
  const state =
    memoryStore.get(bucketKey) ??
    ({ tokens: cfg.capacity, lastRefillMs: now } satisfies InMemoryState);

  // Refill tokens based on elapsed time.
  const elapsedMin = (now - state.lastRefillMs) / 60_000;
  state.tokens = Math.min(
    cfg.capacity,
    state.tokens + elapsedMin * cfg.refillPerMinute,
  );
  state.lastRefillMs = now;

  if (state.tokens < 1) {
    const resetSeconds = Math.ceil(
      ((1 - state.tokens) / cfg.refillPerMinute) * 60,
    );
    memoryStore.set(bucketKey, state);
    return { ok: false, remaining: 0, resetSeconds };
  }

  state.tokens -= 1;
  memoryStore.set(bucketKey, state);
  return {
    ok: true,
    remaining: Math.floor(state.tokens),
    resetSeconds: Math.ceil(
      ((cfg.capacity - state.tokens) / cfg.refillPerMinute) * 60,
    ),
  };
}

async function rateLimitUpstash(
  key: string,
  kind: RateLimitKind,
  cfg: BucketConfig,
): Promise<RateLimitResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const windowSec = 60;
  const redisKey = `ratelimit:${kind}:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;

  // INCR + EXPIRE pattern — atomic-enough for our purposes. Bursts up
  // to capacity inside a 1-minute window are allowed; sustained rate
  // gets enforced by the window roll-over. We deliberately don't
  // implement a true sliding-window token bucket here — Upstash's
  // built-in Ratelimit primitive does that, but we'd need to add
  // the SDK; the simple counter is good enough for v1.
  const incrRes = await fetch(`${url}/incr/${encodeURIComponent(redisKey)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!incrRes.ok) {
    throw new Error(`upstash incr failed: ${incrRes.status}`);
  }
  const { result } = (await incrRes.json()) as { result: number };

  if (result === 1) {
    // First hit in this window — set TTL.
    await fetch(
      `${url}/expire/${encodeURIComponent(redisKey)}/${windowSec}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      },
    );
  }

  const remaining = Math.max(0, cfg.capacity - result);
  return {
    ok: result <= cfg.capacity,
    remaining,
    resetSeconds: windowSec - (Math.floor(Date.now() / 1000) % windowSec),
  };
}
