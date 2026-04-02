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
