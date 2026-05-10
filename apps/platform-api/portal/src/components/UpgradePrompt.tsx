"use client";

import { Lock } from "lucide-react";

interface UpgradePromptProps {
  /** The feature name returned by the API (e.g. "mssp_admin") */
  feature?: string;
  /** The tier required to unlock the feature (e.g. "mssp", "enterprise") */
  requiredTier?: string;
}

/**
 * UpgradePrompt — shown when an API call returns 402 Payment Required.
 * Replaces generic error cards for tier-gated endpoints so users see a
 * clear upgrade path instead of a confusing error message.
 */
export function UpgradePrompt({ feature, requiredTier }: UpgradePromptProps) {
  const tierLabel = requiredTier ? requiredTier.toUpperCase() : "a higher";
  const featureLabel = feature
    ? feature.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "This feature";

  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 rounded-xl border border-of-outline-variant/10 bg-of-surface-container gap-4 text-center">
      <div className="w-12 h-12 rounded-full bg-of-primary/10 border border-of-primary/20 flex items-center justify-center">
        <Lock className="h-5 w-5 text-of-primary" />
      </div>
      <div>
        <p className="text-sm font-bold text-of-on-surface">
          Upgrade to {tierLabel} to unlock {featureLabel}
        </p>
        <p className="text-xs text-of-on-surface-variant mt-1 max-w-xs">
          Your current plan does not include access to this feature. Upgrade
          your tier to continue.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <a
          href="https://pantheon.saluca.com/pricing"
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 rounded-lg bg-of-primary/15 border border-of-primary/25 text-xs font-bold text-of-primary hover:bg-of-primary/25 transition-colors"
        >
          View Pricing
        </a>
        <a
          href="mailto:sales@saluca.com"
          className="px-4 py-2 rounded-lg border border-of-outline-variant/20 text-xs font-bold text-of-on-surface-variant hover:text-of-on-surface hover:border-of-outline-variant/40 transition-colors"
        >
          Contact Sales
        </a>
      </div>
    </div>
  );
}

/**
 * Parse an error string from useWidgetData (format: "402: <message>") and
 * extract the HTTP status code. Returns null if the string is not in that format.
 */
export function parseErrorStatus(error: string | null): number | null {
  if (!error) return null;
  const match = error.match(/^(\d{3}):/);
  return match ? parseInt(match[1], 10) : null;
}
