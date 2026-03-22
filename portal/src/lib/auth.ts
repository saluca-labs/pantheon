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
function getSessionFromCookies(): AuthSession | null {
  if (typeof document === "undefined") return null;

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
      };
      if (data.expires_at && Date.now() > data.expires_at) {
        // expired — fall through to SoulKey check
      } else {
        return {
          soulkey: "httponly-oidc-protected",
          tenant_id: data.tenant_id,
          persona_id: data.role ?? "member",
          tier: "enterprise", // OIDC users are always enterprise+
          tenant_name: undefined,
          expires_at: data.expires_at,
          auth_method: "oidc",
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
        tier: data.tier || "starter",
        tenant_name: data.tenant_name,
      });

      const newSession: AuthSession = {
        soulkey: serverSession.session_token,
        tenant_id: data.tenant_id,
        persona_id: data.persona_id,
        tier: data.tier || "starter",
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
