/**
 * API client for SoulAuth backend.
 * Handles auth headers, base URL, and error normalization.
 */

import { config } from "./config";

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: Record<string, unknown> | null,
  ) {
    const detail =
      (body?.detail as string) ||
      (body?.message as string) ||
      `${status} ${statusText}`;
    super(detail);
    this.name = "ApiError";
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

/**
 * Get the stored SoulKey from cookie (client-side).
 * Returns null if not authenticated.
 */
export function getStoredSoulKey(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${config.sessionCookie}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Get tenant ID from session cookie (client-side).
 */
export function getStoredTenantId(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    /(?:^|; )tiresias_tenant=([^;]*)/,
  );
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Core fetch wrapper with auth headers and error handling.
 */
async function apiFetch<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, headers: extraHeaders, ...rest } = options;

  const soulkey = getStoredSoulKey();
  const tenantId = getStoredTenantId();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(extraHeaders as Record<string, string>),
  };

  if (soulkey) {
    headers["Authorization"] = `Bearer ${soulkey}`;
    headers["X-SoulKey"] = soulkey;
  }
  if (tenantId) {
    headers["X-Tenant-ID"] = tenantId;
  }

  const url = path.startsWith("http") ? path : `${config.apiUrl}${path}`;

  const res = await fetch(url, {
    ...rest,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let errorBody = null;
    try {
      errorBody = await res.json();
    } catch {
      // response may not be JSON
    }
    throw new ApiError(res.status, res.statusText, errorBody);
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return res.json();
  }

  // For non-JSON (e.g. Prometheus metrics text)
  return (await res.text()) as T;
}

/**
 * API client with convenience methods.
 */
export const api = {
  get: <T = unknown>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: "GET" }),

  post: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: "POST", body }),

  put: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: "PUT", body }),

  patch: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: "PATCH", body }),

  delete: <T = unknown>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: "DELETE" }),
};
