/**
 * Centralized server-side configuration for all backend service URLs and keys.
 *
 * Every API route should import from here instead of reading process.env
 * directly. Fallback values use empty strings for keys so that missing
 * secrets fail loudly rather than silently using stale dev credentials.
 */

export const config = {
  /** SoulAuth — identity, sessions, contracts, admin keys */
  soulauth: {
    url: process.env.SOULAUTH_INTERNAL_URL || "http://soulauth:8000",
  },

  /** SoulWatch — detections, anomalies, quarantines, LLM metrics */
  soulwatch: {
    url: process.env.SOULWATCH_INTERNAL_URL || "http://localhost:8001",
    key: process.env.SOULWATCH_INTERNAL_KEY || "",
  },

  /** SoulGate — API gateway, audit logs, upstreams */
  soulgate: {
    url: process.env.SOULGATE_INTERNAL_URL || "http://localhost:8002",
  },

  /** Tiresias proxy — dashboard data, SIEM pipeline */
  proxy: {
    url: process.env.TIRESIAS_PROXY_URL || "http://tiresias-proxy:8080",
    apiKey: process.env.TIRESIAS_API_KEY || "",
  },

  /** Shared internal API key for server-to-server calls */
  internalApiKey: process.env.INTERNAL_API_KEY || "",

  /** Dev-mode fallback tenant ID (Bootstrap Admin). */
  devFallbackTenant: "00000001-0000-4000-a000-000000000001",
} as const;
