/**
 * In-memory rate limiter for login attempts.
 *
 * Replace with a Redis-backed implementation for multi-instance deployments.
 * Each key is typically `login:${email}` or `login:${ip}`.
 */

interface BucketEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, BucketEntry>();

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Check and increment the rate-limit counter for a given key.
 * Returns { allowed: true } if within limits, or { allowed: false, retryAfter } when exceeded.
 */
export function checkLoginRateLimit(
  key: string
): { allowed: true } | { allowed: false; retryAfter: number } {
  const now = Date.now();
  let entry = buckets.get(key);

  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, entry);
  }

  entry.count += 1;

  if (entry.count > MAX_ATTEMPTS) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }

  return { allowed: true };
}

/**
 * Reset the rate-limit counter for a given key (e.g., after a successful login).
 */
export function resetLoginRateLimit(key: string): void {
  buckets.delete(key);
}

// Clean up expired buckets periodically to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets.entries()) {
    if (entry.resetAt <= now) {
      buckets.delete(key);
    }
  }
}, WINDOW_MS);
