/**
 * Ephemeral in-memory key store for post-checkout SoulKey delivery.
 *
 * After Stripe checkout completes, the webhook handler stores the raw SoulKey
 * here (keyed by checkout session_id) instead of in Stripe subscription metadata.
 * The claim-key endpoint retrieves it once and deletes it immediately.
 *
 * Keys auto-expire after TTL_MS (10 minutes) as a safety net.
 * This eliminates cleartext SoulKey storage in Stripe metadata.
 */

export interface PendingKey {
  raw_key: string;
  tenant_id: string;
  soulkey_id: string;
  created_at: number;
}

const TTL_MS = 10 * 60 * 1000; // 10 minutes

const store = new Map<string, PendingKey>();

/**
 * Store a newly provisioned key for one-time retrieval.
 * Automatically schedules cleanup after TTL.
 */
export function storePendingKey(
  sessionId: string,
  data: { raw_key: string; tenant_id: string; soulkey_id: string }
): void {
  store.set(sessionId, {
    ...data,
    created_at: Date.now(),
  });

  // Auto-delete after TTL as safety net
  setTimeout(() => {
    store.delete(sessionId);
  }, TTL_MS);
}

/**
 * Claim a pending key (one-time retrieval). Returns the key data and
 * immediately deletes it from the store. Returns null if not found or expired.
 */
export function claimPendingKey(sessionId: string): PendingKey | null {
  const entry = store.get(sessionId);
  if (!entry) return null;

  // Check TTL (belt-and-suspenders with setTimeout above)
  if (Date.now() - entry.created_at > TTL_MS) {
    store.delete(sessionId);
    return null;
  }

  // One-time retrieval: delete immediately
  store.delete(sessionId);
  return entry;
}
