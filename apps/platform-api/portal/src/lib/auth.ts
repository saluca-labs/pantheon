/**
 * @module auth
 *
 * Dual-auth session layer for the Tiresias portal.
 *
 * Two authentication paths are supported:
 *  1. **SoulKey direct auth** -- API-key based login used by individual developers
 *     and starter-tier tenants. The key is validated against `/v1/auth/whoami`,
 *     then an HttpOnly session cookie is set via the Next.js `/api/session` route.
 *  2. **OIDC / SSO enterprise auth** -- OAuth 2.0 PKCE flow for enterprise tenants.
 *     The OIDC callback sets its own `tiresias_oidc_data` cookie. OIDC sessions
 *     always resolve to the `enterprise` tier.
 *
 * Session state is read from cookies on the client and exposed through the
 * React `AuthContext` (via `useAuth()`). The `AuthProvider` wraps the app
 * and handles hydration, login, logout, and OIDC logout flows.
 */
"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import React from "react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { config as _config } from "./config";
import { api, ApiError } from "./api";
import type { OIDCSession } from "./oidc";

// -- Types ------------------------------------------------------------------

export type AuthMethod = "soulkey" | "oidc";

export interface AuthSession {
  soulkey: string;
  tenant_id: string;
  persona_id: string;
  tier: string;
  tenant_name?: string;
  expires_at: number; // epoch ms
  auth_method: AuthMethod;
  /** User display name (from OIDC or persona_id fallback) */
  user_name?: string;
  /** User email (from OIDC, if available) */
  user_email?: string;
}

interface WhoamiResponse {
  soulkey_id: string;
  tenant_id: string;
  persona_id: string;
  tier: string;
  tenant_name?: string;
  status: string;
}

interface AuthContextValue {
  session: AuthSession | null;
  loading: boolean;
  login: (soulkey: string) => Promise<void>;
  logout: () => void;
  oidcLogout: () => Promise<void>;
  error: string | null;
}

// -- Server-side session helpers (SoulKey) ----------------------------------

/**
 * Create an HttpOnly session cookie on the server via the `/api/session` route.
 * Returns the opaque session token and its expiry timestamp (epoch ms).
 * The actual SoulKey is stored server-side; only a session token is returned.
 */
async function createServerSession(session: {
  soulkey: string;
  tenant_id: string;
  persona_id: string;
  tier: string;
  tenant_name?: string;
}): Promise<{ session_token: string; expires_at: number }> {
  const res = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(session),
  });
  if (!res.ok) {
    throw new Error("Failed to create session");
  }
  return res.json();
}

/**
 * Destroy the server-side session by calling DELETE on `/api/session`.
 * This clears both the HttpOnly session cookie and any OIDC data cookie.
 */
async function destroyServerSession(): Promise<void> {
  await fetch("/api/session", { method: "DELETE" });
}

/**
 * Return which auth method is currently active based on cookies.
 * Returns null if no session cookies are present.
 */
export function getAuthMethod(): AuthMethod | null {
  if (typeof document === "undefined") return null;

  const hasOIDC = document.cookie.includes("tiresias_oidc_data=");
  const hasSoulKey = document.cookie.includes("tiresias_session_data=");

  if (hasOIDC) return "oidc";
  if (hasSoulKey) return "soulkey";
  return null;
}

/**
 * Read non-sensitive session metadata from cookies (client-side).
 * Checks both SoulKey (tiresias_session_data) and OIDC (tiresias_oidc_data) cookies.
 */
/**
 * Read non-sensitive session metadata from browser cookies.
 *
 * Checks both SoulKey (`tiresias_session_data`) and OIDC (`tiresias_oidc_data`)
 * cookies. **OIDC takes priority** because enterprise SSO sessions carry
 * stricter identity guarantees (IdP-verified email, MFA, domain binding)
 * and must not be overridden by a stale SoulKey cookie from a prior session.
 */
function getSessionFromCookies(): AuthSession | null {
  if (typeof document === "undefined") return null;

  // OIDC takes priority over SoulKey: enterprise SSO carries IdP-verified identity
  // Try OIDC session first
  const oidcMatch = document.cookie.match(
    /(?:^|; )tiresias_oidc_data=([^;]*)/,
  );
  if (oidcMatch) {
    try {
      const data = JSON.parse(decodeURIComponent(oidcMatch[1])) as OIDCSession & {
        email: string;
        name: string | null;
        role: string;
        tenant_name?: string | null;
      };
      if (data.expires_at && Date.now() > data.expires_at) {
        // expired — fall through to SoulKey check
      } else {
        return {
          soulkey: "httponly-oidc-protected",
          tenant_id: data.tenant_id,
          persona_id: data.role ?? "member",
          tier: (data as unknown as Record<string, string>).tier || "enterprise",
          tenant_name: data.tenant_name ?? undefined,
          expires_at: data.expires_at,
          auth_method: "oidc",
          user_name: data.name ?? data.email?.split("@")[0] ?? undefined,
          user_email: data.email ?? undefined,
        };
      }
    } catch {
      // malformed — ignore
    }
  }

  // Fall back to SoulKey session
  const dataMatch = document.cookie.match(
    /(?:^|; )tiresias_session_data=([^;]*)/,
  );
  if (!dataMatch) return null;

  try {
    const data = JSON.parse(decodeURIComponent(dataMatch[1]));
    if (data.expires_at && Date.now() > data.expires_at) return null;

    return {
      soulkey: data.session_token || "httponly-protected",
      tenant_id: data.tenant_id,
      persona_id: data.persona_id,
      tier: data.tier,
      tenant_name: data.tenant_name,
      expires_at: data.expires_at,
      auth_method: "soulkey",
      user_name: data.user_name ?? data.persona_id ?? undefined,
      user_email: data.user_email ?? undefined,
    };
  } catch {
    return null;
  }
}

// -- OIDC logout helper -----------------------------------------------------

/**
 * Clear OIDC cookies client-side and call the backend revoke endpoint.
 * The backend revoke call is best-effort — we always clear cookies locally.
 */
/**
 * Clear OIDC session state and revoke the token on the backend.
 *
 * The backend revoke call (`DELETE /v1/auth/oidc/session`) is **best-effort**:
 * if it fails (e.g. network issue, IdP unreachable) we still clear local
 * cookies so the user is logged out of the portal. This avoids trapping
 * users in a broken session when the IdP is temporarily down.
 */
export async function oidcLogout(): Promise<void> {
  // Best-effort backend revoke
  try {
    await api.delete("/v1/auth/oidc/session");
  } catch {
    // ignore — we still clear cookies
  }

  // Clear OIDC cookies via the session API route
  await fetch("/api/session", { method: "DELETE" });
}

// -- Context ----------------------------------------------------------------

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  login: async () => {},
  logout: () => {},
  oidcLogout: async () => {},
  error: null,
});

export function useAuth() {
  return useContext(AuthContext);
}

// -- Provider ---------------------------------------------------------------

/**
 * Top-level authentication context provider.
 *
 * Wraps the application and exposes session state, `login`, `logout`, and
 * `oidcLogout` via the `useAuth()` hook. On mount it hydrates from cookies;
 * the `login` callback performs: API whoami validation -> server session
 * creation (HttpOnly cookie) -> React state update.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const existing = getSessionFromCookies();
    if (existing) {
      setSession(existing);
    }
    setLoading(false);
  }, []);

    /**
     * SoulKey login flow:
     * 1. Call `/v1/auth/whoami` to validate the key and fetch tenant metadata
     * 2. Create a server-side HttpOnly session via `/api/session`
     * 3. Store the resulting session in React state (triggers re-render / redirect)
     */
  const login = useCallback(async (soulkey: string) => {
    setLoading(true);
    setError(null);

    try {
      const data = await api.get<WhoamiResponse>("/v1/auth/whoami", {
        headers: {
          Authorization: `Bearer ${soulkey}`,
          "X-SoulKey": soulkey,
        },
      });

      if (data.status === "revoked" || data.status === "suspended") {
        throw new Error(
          `This SoulKey is ${data.status}. Please contact your administrator or start a new trial.`,
        );
      }

      const serverSession = await createServerSession({
        soulkey,
        tenant_id: data.tenant_id,
        persona_id: data.persona_id,
        tier: data.tier || "community",
        tenant_name: data.tenant_name,
      });

      const newSession: AuthSession = {
        soulkey: serverSession.session_token,
        tenant_id: data.tenant_id,
        persona_id: data.persona_id,
        tier: data.tier || "community",
        tenant_name: data.tenant_name,
        expires_at: serverSession.expires_at,
        auth_method: "soulkey",
      };

      setSession(newSession);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401 || err.status === 403) {
          setError("Invalid SoulKey. Please check and try again.");
        } else {
          setError(err.message);
        }
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Login failed. Please try again.");
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    destroyServerSession().finally(() => {
      setSession(null);
      setError(null);
      window.location.href = "/";
    });
  }, []);

  const handleOIDCLogout = useCallback(async () => {
    await oidcLogout();
    setSession(null);
    setError(null);
    window.location.href = "/";
  }, []);

  return React.createElement(
    AuthContext.Provider,
    { value: { session, loading, login, logout, oidcLogout: handleOIDCLogout, error } },
    children,
  );
}
