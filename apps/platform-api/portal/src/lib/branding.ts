/**
 * BrandingProvider — White-label CSS variable injection (WL-03).
 *
 * Loads GET /v1/tenant/branding after session establishes.
 * Injects CSS variable overrides onto document.documentElement.
 * Exposes useBranding() hook for logo swap and settings panel.
 */

"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useAuth } from "./auth";
import { api } from "./api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BrandingConfig {
  logo_url?: string | null;
  primary_color?: string | null;
  accent_color?: string | null;
  company_name?: string | null;
  favicon_url?: string | null;
}

interface BrandingContextValue {
  branding: BrandingConfig;
  loading: boolean;
  saveBranding: (config: BrandingConfig) => Promise<void>;
  previewBranding: (config: BrandingConfig) => void;
  resetPreview: () => void;
}

// ---------------------------------------------------------------------------
// DOM injection
// ---------------------------------------------------------------------------

/**
 * Apply a BrandingConfig to the document CSS variables.
 * Only overrides fields that are non-null/non-empty.
 * Primary color -> --of-primary (and related primary tokens).
 * Accent color  -> --of-secondary (secondary token family).
 */
export function applyBrandingToDOM(config: BrandingConfig): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  if (config.primary_color) {
    root.style.setProperty("--of-primary", config.primary_color);
    root.style.setProperty("--of-primary-fixed", config.primary_color);
    root.style.setProperty("--of-primary-fixed-dim", config.primary_color);
    root.style.setProperty("--of-surface-tint", config.primary_color);
  } else {
    // Reset to Obsidian Flux defaults
    root.style.removeProperty("--of-primary");
    root.style.removeProperty("--of-primary-fixed");
    root.style.removeProperty("--of-primary-fixed-dim");
    root.style.removeProperty("--of-surface-tint");
  }

  if (config.accent_color) {
    root.style.setProperty("--of-secondary", config.accent_color);
    root.style.setProperty("--of-secondary-fixed", config.accent_color);
    root.style.setProperty("--of-secondary-fixed-dim", config.accent_color);
  } else {
    root.style.removeProperty("--of-secondary");
    root.style.removeProperty("--of-secondary-fixed");
    root.style.removeProperty("--of-secondary-fixed-dim");
  }
}

/**
 * Remove all CSS variable overrides (restore Obsidian Flux defaults).
 */
export function clearBrandingFromDOM(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const brandingVars = [
    "--of-primary", "--of-primary-fixed", "--of-primary-fixed-dim", "--of-surface-tint",
    "--of-secondary", "--of-secondary-fixed", "--of-secondary-fixed-dim",
  ];
  brandingVars.forEach((v) => root.style.removeProperty(v));
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const BrandingContext = createContext<BrandingContextValue>({
  branding: {},
  loading: false,
  saveBranding: async () => {},
  previewBranding: () => {},
  resetPreview: () => {},
});

export function useBranding(): BrandingContextValue {
  return useContext(BrandingContext);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface BrandingApiResponse {
  tenant_id: string;
  branding: BrandingConfig;
}

export function BrandingProvider({ children }: { children: ReactNode }): React.ReactElement {
  const { session } = useAuth();
  const [branding, setBranding] = useState<BrandingConfig>({});
  const [loading, setLoading] = useState(false);
  // Tracks the committed (saved) branding for reset-preview
  const [committed, setCommitted] = useState<BrandingConfig>({});

  // Load branding when session establishes on an mssp/saas tier
  useEffect(() => {
    if (!session) {
      clearBrandingFromDOM();
      setBranding({});
      setCommitted({});
      return;
    }

    let cancelled = false;
    setLoading(true);

    api
      .get<BrandingApiResponse>("/v1/tenant/branding")
      .then((res) => {
        if (cancelled) return;
        const config = res.branding ?? {};
        setBranding(config);
        setCommitted(config);
        applyBrandingToDOM(config);
      })
      .catch(() => {
        // Non-fatal: white-label load failure falls back to Tiresias defaults silently
        if (!cancelled) {
          clearBrandingFromDOM();
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.tenant_id, session?.tier]); // re-load if tenant or tier changes

  const saveBranding = useCallback(async (config: BrandingConfig): Promise<void> => {
    const res = await api.put<BrandingApiResponse>("/v1/tenant/branding", { body: config });
    const saved = res.branding ?? config;
    setBranding(saved);
    setCommitted(saved);
    applyBrandingToDOM(saved);
  }, []);

  const previewBranding = useCallback((config: BrandingConfig): void => {
    setBranding(config);
    applyBrandingToDOM(config);
  }, []);

  const resetPreview = useCallback((): void => {
    setBranding(committed);
    applyBrandingToDOM(committed);
  }, [committed]);

  return React.createElement(
    BrandingContext.Provider,
    { value: { branding, loading, saveBranding, previewBranding, resetPreview } },
    children,
  );
}
