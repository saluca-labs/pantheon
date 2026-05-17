"use client";

import React from "react";
import { Lock } from "lucide-react";
import { useAuth } from "@/lib/auth-shell";

// Tier hierarchy: each tier includes all features of tiers below it
export const TIER_ORDER = [
  "community",
  "starter",
  "pro",
  "enterprise",
  "mssp",
  "saas",
  "owner",
] as const;

export type Tier = (typeof TIER_ORDER)[number];

/** Customer-visible tiers (owner is internal-only). */
export const CUSTOMER_TIERS = TIER_ORDER.filter((t) => t !== "owner");

/**
 * Returns true if `actualTier` meets the `requiredTier` threshold.
 * Owner tier always passes. Unknown tiers fall back to index 0 (community = lowest).
 */
export function tierMeets(actualTier: string, requiredTier: Tier): boolean {
  if (actualTier === "owner") return true;
  const actualIdx = TIER_ORDER.indexOf(actualTier as Tier);
  const requiredIdx = TIER_ORDER.indexOf(requiredTier);
  return actualIdx >= requiredIdx;
}

interface TierGateProps {
  /** Minimum tier required to see children */
  requiredTier: Tier;
  /** Feature label shown in the upgrade prompt */
  featureLabel?: string;
  children: React.ReactNode;
}

/**
 * TierGate — renders children when session.tier meets requiredTier.
 * Shows an upgrade prompt panel otherwise.
 * No console errors, no blank panels on lower-tier deploys (DTIER-05).
 *
 * W-G.shell: ported from portal/src/components/dashboard/TierGate.tsx with
 * Obsidian Flux tokens swapped for Saluca surface/accent tokens. Reads from
 * the platform-web auth-shell stub.
 */
export function TierGate({ requiredTier, featureLabel, children }: TierGateProps) {
  const { session } = useAuth();
  const actualTier = session?.tier ?? "community";

  if (tierMeets(actualTier, requiredTier)) {
    return <>{children}</>;
  }

  const tierLabel = requiredTier.toUpperCase();

  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 rounded-xl border border-border-subtle bg-surface-2 gap-4 text-center">
      <div className="w-12 h-12 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center">
        <Lock className="h-5 w-5 text-accent" />
      </div>
      <div>
        <p className="text-sm font-bold text-text-primary">
          {featureLabel ?? tierLabel + " Feature"}
        </p>
        <p className="text-xs text-text-secondary mt-1 max-w-xs">
          This feature requires the{" "}
          <span className="font-semibold text-accent">{tierLabel}</span> tier or
          higher. Your current deployment is{" "}
          <span className="font-semibold text-text-primary">{actualTier.toUpperCase()}</span>.
        </p>
      </div>
      <a
        href="https://pantheon.saluca.com/pricing"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 px-4 py-2 rounded-lg bg-accent/15 border border-accent/25 text-xs font-bold text-accent hover:bg-accent/25 transition-colors"
      >
        Upgrade to {tierLabel}
      </a>
    </div>
  );
}
