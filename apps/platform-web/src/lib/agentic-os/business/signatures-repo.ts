/**
 * Business OS Phase 6 — signatures DB repository.
 *
 * Cross-ownership contract: every read / write filters by `user_id`
 * directly. Signatures are scoped to a document; document ownership is
 * validated before any signature operation.
 *
 * @license MIT — Tiresias Business OS Phase 6 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getBusinessPool } from './session';
import { getDocument, signDocument } from './documents-repo';
import {
  SIGNER_ROLES,
  type BusinessSignature,
  type SignerRole,
  type CreateSignatureInput,
} from './signatures';

const COLUMNS = `id, document_id, user_id, signer_role, signer_name,
                  signer_email, signature_image_url, signed_at,
                  ip_address, user_agent, metadata, created_at`;

// ─── Row mapper ───────────────────────────────────────────────────────────

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

function toIsoOrNull(v: unknown): string | null {
  if (v == null) return null;
  return toIso(v);
}

function rowToSignature(row: any): BusinessSignature {
  return {
    id: row.id,
    documentId: row.document_id,
    userId: row.user_id,
    signerRole: row.signer_role as SignerRole,
    signerName: row.signer_name ?? '',
    signerEmail: row.signer_email ?? null,
    signatureImageUrl: row.signature_image_url ?? '',
    signedAt: toIso(row.signed_at),
    ipAddress: row.ip_address ?? null,
    userAgent: row.user_agent ?? null,
    metadata: row.metadata ?? {} as Record<string, unknown>,
    createdAt: toIso(row.created_at),
  };
}

// ─── List ─────────────────────────────────────────────────────────────────

export async function listSignatures(
  documentId: string,
  userId: string,
): Promise<BusinessSignature[] | null> {
  // Validate document ownership
  const doc = await getDocument(documentId, userId);
  if (!doc) return null;

  const pool = getBusinessPool();
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM agos_business_signatures
     WHERE document_id = $1
     ORDER BY signed_at DESC`,
    [documentId],
  );

  return rows.map(rowToSignature);
}

// ─── Capture ──────────────────────────────────────────────────────────────

export async function captureSignature(
  userId: string,
  documentId: string,
  input: CreateSignatureInput,
): Promise<
  | { kind: 'ok'; signature: BusinessSignature; document?: any }
  | { kind: 'not_found' }
  | { kind: 'invalid_transition'; reason: string }
> {
  // Validate document exists and belongs to user
  const doc = await getDocument(documentId, userId);
  if (!doc) return { kind: 'not_found' };

  if (doc.status !== 'sent') {
    return {
      kind: 'invalid_transition',
      reason: `Cannot capture a signature for a document in '${doc.status}' status. The document must be sent first.`,
    };
  }

  const pool = getBusinessPool();
  const id = randomUUID();
  const role = input.signerRole ?? 'counterparty';

  const { rows } = await pool.query(
    `INSERT INTO agos_business_signatures
       (id, document_id, user_id, signer_role, signer_name, signer_email,
        signature_image_url, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${COLUMNS}`,
    [
      id,
      documentId,
      userId,
      role,
      input.signerName,
      input.signerEmail ?? null,
      input.signatureImageUrl,
      JSON.stringify({}),
    ],
  );

  const signature = rowToSignature(rows[0]);

  // If counterparty signs, auto-sign the document
  if (role === 'counterparty') {
    const signResult = await signDocument(documentId, userId);
    if (signResult.kind === 'ok') {
      return { kind: 'ok', signature, document: signResult.doc };
    }
  }

  return { kind: 'ok', signature };
}
