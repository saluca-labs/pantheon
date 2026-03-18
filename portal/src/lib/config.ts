/**
 * Portal configuration - centralizes environment variables and constants.
 */

export const config = {
  /** SoulAuth API base URL (no trailing slash) */
  apiUrl: process.env.NEXT_PUBLIC_SOULAUTH_API_URL || "https://tiresias.saluca.com",

  /** Session cookie name */
  sessionCookie: "tiresias_session",

  /** Session TTL in seconds (24 hours) */
  sessionTTL: 86400,

  /** Widget auto-refresh interval in ms */
  refreshInterval: 30000,

  /** Support email */
  supportEmail: "support@saluca.com",
} as const;
