/**
 * Business OS Phase 6 — signature domain types + pure helpers.
 *
 * DB calls live in `signatures-repo.ts`.
 *
 * @license MIT — Tiresias Business OS Phase 6 (internal).
 */

// ─── Constants ────────────────────────────────────────────────────────────

export const SIGNER_ROLES = ['self', 'counterparty', 'witness'] as const;

export type SignerRole = (typeof SIGNER_ROLES)[number];

// ─── Domain type ──────────────────────────────────────────────────────────

export interface BusinessSignature {
  id: string;
  documentId: string;
  userId: string;
  signerRole: SignerRole;
  signerName: string;
  signerEmail: string | null;
  signatureImageUrl: string;
  signedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ─── Create input ─────────────────────────────────────────────────────────

export interface CreateSignatureInput {
  signerRole?: SignerRole;
  signerName: string;
  signerEmail?: string | null;
  signatureImageUrl: string;
}
