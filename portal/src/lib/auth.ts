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

// -- Types ------------------------------------------------------------------

export interface AuthSession {
  soulkey: string;
  tenant_id: string;
  persona_id: string;
  tier: string;
  tenant_name?: string;
  expires_at: number; // epoch ms
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
  error: string | null;
}

// -- Server-side session helpers --------------------------------------------

/**
 * Create a session via the server-side API route.
 * The soulkey is stored in an HttpOnly cookie (not accessible to JS).
 * Only non-sensitive metadata is returned for client-side use.
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
 * Destroy the session via the server-side API route.
 * Clears the HttpOnly cookie.
 */
async function destroyServerSession(): Promise<void> {
  await fetch("/api/session", { method: "DELETE" });
}

/**
 * Read non-sensitive session metadata from the tiresias_session_data cookie.
 * The actual soulkey is NOT available to JavaScript (HttpOnly).
 */
function getSessionFromCookies(): AuthSession | null {
  if (typeof document === "undefined") return null;

  const dataMatch = document.cookie.match(
    /(?:^|; )tiresias_session_data=([^;]*)/,
  );

  if (!dataMatch) return null;

  try {
    const data = JSON.parse(decodeURIComponent(dataMatch[1]));

    // Check expiry
    if (data.expires_at && Date.now() > data.expires_at) {
      return null;
    }

    return {
      // The soulkey is stored server-side in an HttpOnly cookie.
      // Client uses a placeholder; actual API calls should go through
      // server-side routes or use the session API to retrieve it.
      soulkey: data.session_token || "httponly-protected",
      tenant_id: data.tenant_id,
      persona_id: data.persona_id,
      tier: data.tier,
      tenant_name: data.tenant_name,
      expires_at: data.expires_at,
    };
  } catch {
    return null;
  }
}

// -- Context ----------------------------------------------------------------

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  login: async () => {},
  logout: () => {},
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

  // Restore session from cookies on mount
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

      // Store soulkey server-side in HttpOnly cookie via API route
      const serverSession = await createServerSession({
        soulkey,
        tenant_id: data.tenant_id,
        persona_id: data.persona_id,
        tier: data.tier || "starter",
        tenant_name: data.tenant_name,
      });

      const newSession: AuthSession = {
        // Client gets the session token (not the raw soulkey)
        soulkey: serverSession.session_token,
        tenant_id: data.tenant_id,
        persona_id: data.persona_id,
        tier: data.tier || "starter",
        tenant_name: data.tenant_name,
        expires_at: serverSession.expires_at,
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

  return React.createElement(
    AuthContext.Provider,
    { value: { session, loading, login, logout, error } },
    children,
  );
}
