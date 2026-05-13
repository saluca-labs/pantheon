/**
 * Per-tenant per-OS rate limiter for LLM calls. Keyed `llm:{tid}:{os_slug}`,
 * default 60 calls / minute / tenant / OS.
 *
 * Backend selection mirrors the platform-api `make_rate_limiter()` factory
 * (CFG-02): if `REDIS_URL` is set, use Redis; otherwise fall back to an
 * in-process fixed-window counter (test/dev only).
 *
 * Wave 0 ships the in-process backend with a swap point for Redis. The
 * Redis adapter lands when the first consumer (Wave 1's secure-dev OS)
 * needs it; until then the in-process counter is correct for single-node
 * deploys and matches CFG-02's behavior in tests.
 */

const DEFAULT_RPM = 60;

export class LlmRateLimiter {
  private readonly counters = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly capacity: number = Number(process.env['LLM_RATE_LIMIT_RPM'] ?? DEFAULT_RPM),
    private readonly windowMs: number = 60_000,
  ) {}

  /** Returns true if call is allowed; false if it should be rejected. */
  consume(key: string): boolean {
    const now = Date.now();
    const e = this.counters.get(key);
    if (!e || now >= e.resetAt) {
      this.counters.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (e.count >= this.capacity) return false;
    e.count += 1;
    return true;
  }

  /** Test-only — reset all counters. */
  _reset(): void {
    this.counters.clear();
  }
}

export function llmRateLimitKey(tenantId: string, osSlug: string): string {
  return `llm:${tenantId}:${osSlug}`;
}
