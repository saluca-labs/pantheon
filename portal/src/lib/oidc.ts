/**
 * OIDC helper library for Tiresias SSO/OIDC authentication.
 * Mirrors the API client pattern from src/lib/api.ts.
 */

import { api } from "./api";

// -- Types ------------------------------------------------------------------

export type OIDCProvider = "google" | "okta" | "azure_ad" | "generic";

export interface IdPConfig {
  id: string;
  tenant_id: string;
  provider: OIDCProvider;
  client_id: string;
  discovery_url: string;
  domain_hint: string | null;
  display_name: string;
  active: boolean;
  created_at: string;
}

export interface OIDCUser {
  sub: string;
  email: string;
  name: string | null;
  given_name: string | null;
  family_name: string | null;
  picture: string | null;
  email_verified: boolean;
}

export interface OIDCSession {
  session_token: string;
  tenant_id: string;
  role: string;
  user: OIDCUser;
  idp_id: string;
  expires_at: number; // epoch ms
}

interface AuthorizeResponse {
  authorization_url: string;
  state: string;
}

interface CallbackResponse {
  session_token: string;
  tenant_id: string;
  role: string;
  user: OIDCUser;
  idp_id: string;
  expires_at: number;
}

// -- OIDC client functions --------------------------------------------------

/**
 * Build the IdP authorization URL by calling the backend, which
 * generates a PKCE code_challenge, state, and nonce then returns
 * the full IdP redirect URL.
 */
export async function buildAuthorizeUrl(tenantSlug: string): Promise<string> {
  const data = await api.get<AuthorizeResponse>(
    `/v1/auth/oidc/authorize?tenant_slug=${encodeURIComponent(tenantSlug)}`
  );
  return data.authorization_url;
}

/**
 * Exchange the IdP callback code + state for a Tiresias OIDC session.
 * Called server-side from the API route handler.
 */
export async function exchangeCode(
  code: string,
  state: string
): Promise<CallbackResponse> {
  return api.post<CallbackResponse>("/v1/auth/oidc/callback", { code, state });
}

/**
 * Read OIDC session data from the tiresias_oidc_data cookie (client-side only).
 * Returns null if not authenticated via OIDC.
 */
export function getOIDCSession(): OIDCSession | null {
  if (typeof document === "undefined") return null;

  const match = document.cookie.match(
    /(?:^|; )tiresias_oidc_data=([^;]*)/
  );
  if (!match) return null;

  try {
    const data = JSON.parse(decodeURIComponent(match[1]));
    if (data.expires_at && Date.now() > data.expires_at) {
      return null;
    }
    return data as OIDCSession;
  } catch {
    return null;
  }
}

/**
 * Revoke the OIDC session on the backend.
 * Called server-side; the API route then clears the cookies.
 */
export async function revokeOIDCSession(): Promise<void> {
  await api.delete("/v1/auth/oidc/session");
}

/**
 * Resolve a tenant slug from an email address domain by calling the backend.
 * Returns the tenant slug if an IdP is configured, or null if not found.
 */
export async function resolveTenantSlug(
  email: string
): Promise<string | null> {
  try {
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain) return null;
    const data = await api.get<{ tenant_slug: string | null }>(
      `/v1/auth/oidc/resolve?domain=${encodeURIComponent(domain)}`
    );
    return data.tenant_slug ?? null;
  } catch {
    return null;
  }
}
