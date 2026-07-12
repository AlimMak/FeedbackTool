import "server-only";

/**
 * Minimal in-memory fixed-window rate limiter for the public routes (votes and
 * submissions). Keyed by e.g. `vote:<ip>:<visitorId>`.
 *
 * This is per-process and resets on restart — fine for a single instance and
 * for stopping casual spam. A multi-instance deployment should back this with a
 * shared store (Redis, Upstash, etc.); the call sites wouldn't change.
 */
type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();

  // Opportunistic cleanup so the map can't grow unbounded.
  if (windows.size > 5000) {
    for (const [k, w] of windows) {
      if (now >= w.resetAt) windows.delete(k);
    }
  }

  const existing = windows.get(key);
  if (!existing || now >= existing.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterMs: 0 };
  }
  if (existing.count >= limit) {
    return { ok: false, retryAfterMs: existing.resetAt - now };
  }
  existing.count += 1;
  return { ok: true, retryAfterMs: 0 };
}
