/**
 * Shared fetch helper for server-side API routes.
 *
 * Provides a resilient `tryFetch` that returns `null` on any failure
 * instead of throwing, matching the pattern used across 5+ route files.
 */

import { config } from "./server-config";

/**
 * Attempt a JSON GET fetch with a timeout. Returns the parsed JSON
 * response on success, or `null` on any error (network, non-2xx, timeout).
 *
 * @param url      - The URL to fetch.
 * @param headers  - Optional additional headers (merged with Content-Type: application/json).
 * @param timeout  - Request timeout in milliseconds (default: 8000).
 */
export async function tryFetch(
  url: string,
  headers?: Record<string, string>,
  timeout = 8000,
): Promise<any> {
  const caller = headers ?? {};
  const hasAuth =
    "Authorization" in caller ||
    "X-SoulKey" in caller ||
    "X-Internal-Key" in caller;
  const internalKey = process.env.INTERNAL_API_KEY ?? "";
  const defaultAuth: Record<string, string> =
    !hasAuth && internalKey ? { "X-Internal-Key": internalKey } : {};
  try {
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...defaultAuth,
        ...caller,
      },
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Fetch the full list of tenant IDs from SoulAuth admin API.
 *
 * Returns a deduplicated array of tenant ID strings. On failure (e.g.
 * SoulAuth unreachable) returns an empty array so callers degrade
 * gracefully instead of crashing.
 */
export async function fetchAllTenantIds(): Promise<string[]> {
  const internalKey = process.env.INTERNAL_API_KEY ?? "";
  const data = await tryFetch(
    `${config.soulauth.url}/v1/soulauth/admin/tenants`,
    internalKey ? { "X-Internal-Key": internalKey } : undefined,
  );
  if (!Array.isArray(data)) return [];
  return data
    .map((t: { id?: string }) => t.id)
    .filter((id: string | undefined): id is string => typeof id === "string");
}
