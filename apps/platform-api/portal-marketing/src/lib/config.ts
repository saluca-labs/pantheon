/**
 * Marketing site configuration.
 * Simplified from the full portal config — only public-facing values.
 */

export const config = {
  /** Marketing site URL */
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://tiresias.network",

  /** Platform dashboard URL (for login/dashboard redirects) */
  platformUrl: process.env.NEXT_PUBLIC_PLATFORM_URL || "https://platform.tiresias.network",

  /**
   * API base URL for trial registration and other SoulAuth calls.
   * Points to the platform subdomain so the marketing site can POST
   * trial signups without needing its own /v1/* rewrites.
   */
  apiUrl: process.env.NEXT_PUBLIC_PLATFORM_URL || "https://platform.tiresias.network",

  /** Support email */
  supportEmail: "support@saluca.com",
} as const;
