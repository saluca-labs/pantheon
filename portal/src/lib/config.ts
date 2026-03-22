/**
 * Portal configuration - centralizes environment variables and constants.
 */

export const config = {
  /** SoulAuth API base URL (no trailing slash) */
  /** Uses relative URLs — Next.js rewrites /v1/* to the soulauth backend */
  apiUrl: "",

  /** Session cookie name */
  sessionCookie: "tiresias_session",

  /** Session TTL in seconds (24 hours) */
  sessionTTL: 86400,

  /** Widget auto-refresh interval in ms */
  refreshInterval: 30000,

  /** Support email */
  supportEmail: "support@saluca.com",
} as const;
