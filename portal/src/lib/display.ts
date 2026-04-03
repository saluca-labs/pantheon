/** Display utilities for human-friendly agent and tenant rendering. */

/** Known tenant UUID → human-readable name mapping. */
export const TENANT_NAMES: Record<string, string> = {
  "0c2515c2-1612-4a1a-bf72-47e760ccca51": "Alfred Local",
  "00000001-0000-4000-a001-000000000001": "Twin Alpha",
  "00000001-0000-4000-a002-000000000001": "Twin Ivory",
  "00000001-0000-4000-a000-000000000001": "Bootstrap Admin",
  // Legacy aliases (pre-provisioning UUIDs)
  "d4a853e2-twin-alpha-0001-000000000001": "Twin Alpha",
  "d4a853e2-twin-ivory-0001-000000000001": "Twin Ivory",
  "00000000-0000-0000-0000-000000000000": "Bootstrap Admin",
};

/** Return the human-readable tenant name, or a truncated UUID as fallback. */
export function tenantName(id: string): string {
  if (!id) return "—";
  if (TENANT_NAMES[id]) return TENANT_NAMES[id];
  // Truncate unknown UUIDs to first 8 chars
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

/** Truncate a soulkey hash for display (first 8 chars + ellipsis). */
export function truncateSoulkey(sk: string): string {
  if (!sk) return "—";
  return sk.length > 12 ? `${sk.slice(0, 12)}…` : sk;
}

/**
 * Convert an ISO date string to a human-friendly relative time.
 *
 * Examples: "Just now", "5m ago", "3h ago", "2d ago".
 * Accepts an optional nullable input and returns "—" for falsy values.
 */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
