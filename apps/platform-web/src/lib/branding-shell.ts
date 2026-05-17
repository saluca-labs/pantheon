/**
 * @module branding-shell
 *
 * Thin platform-web-side branding stub for the unified shell (W-G.shell).
 *
 * Portal's `DashboardSidebar` / `DashboardHeader` consume `useBranding()` to
 * read white-label tenant branding (logo, favicon, primary/accent colors).
 * Platform-web doesn't ship white-label yet, so this stub returns an empty
 * `BrandingConfig` and the shell falls back to the default Tiresias mark
 * (which we'll keep — the brand-rename to a Pantheon mark is separate work).
 *
 * When white-label lands on platform-web, replace this with a real
 * BrandingProvider that fetches `/v1/tenant/branding` like portal does.
 */
"use client";

// ---------------------------------------------------------------------------
// Types — match portal's BrandingConfig shape exactly so a future
// real-provider swap is a no-op for the shell consumer code.
// ---------------------------------------------------------------------------

export interface BrandingConfig {
  logo_url?: string | null;
  primary_color?: string | null;
  accent_color?: string | null;
  company_name?: string | null;
  favicon_url?: string | null;
}

export interface BrandingShellValue {
  branding: BrandingConfig;
  loading: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const EMPTY_BRANDING: BrandingConfig = {};

/**
 * Empty branding hook — always returns `{}` so the shell uses default chrome.
 * Stable reference (module-level constant) so consumers can include it in
 * effect deps without churn.
 */
export function useBranding(): BrandingShellValue {
  return { branding: EMPTY_BRANDING, loading: false };
}
