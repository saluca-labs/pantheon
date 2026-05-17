/**
 * @module auth-shell
 *
 * Thin platform-web-side auth stub for the unified shell (W-G.shell).
 *
 * Portal's `DashboardSidebar` / `DashboardHeader` (copied into
 * `components/layout/` for shell unification) consume a `useAuth()` hook
 * that returns a session shape with `tier`, `user_email`, `user_name`,
 * `tenant_name`, and `tenant_id`. Platform-web doesn't have portal's full
 * AuthProvider context, but it does set the `tiresias_oidc_data` cookie
 * during OIDC login. This module reads that cookie client-side on each
 * `useAuth()` call and returns a session in the shape the copied shell
 * components expect.
 *
 * No provider needed — the cookie is the single source of truth and reads
 * are cheap.
 *
 * NOTE: The `logout()` helper performs a best-effort cookie clear via
 * `/api/auth/signout` (platform-web's existing sign-out route).
 */
"use client";

import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Types — mirror portal's AuthSession shape (only the fields the shell uses)
// ---------------------------------------------------------------------------

export interface AuthShellSession {
  tenant_id: string;
  persona_id: string;
  tier: string;
  tenant_name?: string;
  user_name?: string;
  user_email?: string;
  expires_at?: number;
}

export interface AuthShellValue {
  session: AuthShellSession | null;
  loading: boolean;
  logout: () => void;
}

// ---------------------------------------------------------------------------
// Cookie reader (mirrors portal's getSessionFromCookies, OIDC-only path)
// ---------------------------------------------------------------------------

function readSessionFromCookies(): AuthShellSession | null {
  if (typeof document === "undefined") return null;

  const match = document.cookie.match(/(?:^|; )tiresias_oidc_data=([^;]*)/);
  if (!match) return null;

  try {
    const data = JSON.parse(decodeURIComponent(match[1])) as Record<string, unknown>;
    const expiresAt = typeof data.expires_at === "number" ? data.expires_at : undefined;
    if (expiresAt && Date.now() > expiresAt) return null;

    const email = typeof data.email === "string" ? data.email : undefined;
    const name = typeof data.name === "string" ? data.name : undefined;
    const role = typeof data.role === "string" ? data.role : "member";
    const tier = typeof data.tier === "string" ? data.tier : "enterprise";
    const tenantId = typeof data.tenant_id === "string" ? data.tenant_id : "";
    const tenantName = typeof data.tenant_name === "string" ? data.tenant_name : undefined;

    return {
      tenant_id: tenantId,
      persona_id: role,
      tier,
      tenant_name: tenantName,
      user_name: name ?? email?.split("@")[0] ?? undefined,
      user_email: email,
      expires_at: expiresAt,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Logout helper
// ---------------------------------------------------------------------------

function logoutClient(): void {
  // Best-effort cookie clear via platform-web's existing sign-out endpoint.
  // Falls back to a hard redirect either way.
  fetch("/auth/signout", { method: "POST" })
    .catch(() => {})
    .finally(() => {
      window.location.href = "/";
    });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hydrate-safe `useAuth()` hook. SSR returns `{ session: null, loading: true }`;
 * client mount re-reads the cookie and surfaces the actual session.
 *
 * The setState-in-effect pattern is intentional here: we MUST start with
 * `session=null` on both SSR and the first client render to avoid a hydration
 * mismatch (the cookie is only readable on the client), then update once on
 * mount. This is the same pattern portal's AuthProvider uses (which is the
 * source of truth for the shell components consuming this hook).
 */
export function useAuth(): AuthShellValue {
  const [session, setSession] = useState<AuthShellSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(readSessionFromCookies());
    setLoading(false);
  }, []);

  return { session, loading, logout: logoutClient };
}
