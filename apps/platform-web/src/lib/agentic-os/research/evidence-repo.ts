/**
 * Research OS Phase 3 — evidence DB repository.
 *
 * Evidence rows are polymorphic via `source_kind`. The repo writes
 * the discriminator + the matching column (source_id or source_url)
 * and lets the route layer enforce the validation contract via
 * `validateEvidenceInput()`. The DB CHECK on `source_kind` is the
 * server-side gate.
 *
 * Cross-ownership: identical JOIN pattern to predictions/falsifiers.
 *
 * No PATCH path — evidence is append-or-delete only. Re-linking means
 * delete + recreate.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getResearchPool } from './session';
import {
  EVIDENCE_POLARITIES,
  EVIDENCE_SOURCE_KINDS,
  asEvidencePolarity,
  asEvidenceSourceKind,
  type Evidence,
  type CreateEvidenceInput,
} from './evidence';

const EVIDENCE_COLUMNS = `id, hypothesis_id, user_id, polarity, source_kind,
                          source_id, source_url, notes, metadata, created_at`;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

interface RawEvidenceRow {
  id: string;
  hypothesis_id: string;
  user_id: string;
  polarity: string;
  source_kind: string;
  source_id: string | null;
  source_url: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date | string;
}

function rowToEvidence(row: RawEvidenceRow): Evidence {
  const polarity = asEvidencePolarity(row.polarity) ?? 'mixed';
  const sourceKind = asEvidenceSourceKind(row.source_kind) ?? 'free_text';
  return {
    id: row.id,
    hypothesisId: row.hypothesis_id,
    userId: row.user_id,
    polarity,
    sourceKind,
    sourceId: row.source_id ?? null,
    sourceUrl: row.source_url ?? null,
    notes: row.notes ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: toIso(row.created_at),
  };
}

// ─── List ───────────────────────────────────────────────────────────────────

export async function listEvidenceForHypothesis(
  hypothesisId: string,
  userId: string,
): Promise<Evidence[]> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT ${EVIDENCE_COLUMNS}
       FROM agos_research_hypothesis_evidence e
      WHERE e.hypothesis_id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_hypotheses h
               WHERE h.id = e.hypothesis_id AND h.user_id = $2
            )
      ORDER BY e.created_at ASC`,
    [hypothesisId, userId],
  );
  return r.rows.map(rowToEvidence);
}

// ─── Get one ────────────────────────────────────────────────────────────────

export async function getEvidence(
  id: string,
  userId: string,
): Promise<Evidence | null> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT ${EVIDENCE_COLUMNS}
       FROM agos_research_hypothesis_evidence e
      WHERE e.id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_hypotheses h
               WHERE h.id = e.hypothesis_id AND h.user_id = $2
            )
      LIMIT 1`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToEvidence(r.rows[0]);
}

// ─── Create ─────────────────────────────────────────────────────────────────

export async function createEvidence(
  hypothesisId: string,
  userId: string,
  data: CreateEvidenceInput,
): Promise<Evidence> {
  if (!(EVIDENCE_POLARITIES as readonly string[]).includes(data.polarity)) {
    throw new Error(`Invalid evidence polarity: ${data.polarity}`);
  }
  if (!(EVIDENCE_SOURCE_KINDS as readonly string[]).includes(data.sourceKind)) {
    throw new Error(`Invalid evidence source_kind: ${data.sourceKind}`);
  }
  const pool = getResearchPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_research_hypothesis_evidence
       (id, hypothesis_id, user_id, polarity, source_kind,
        source_id, source_url, notes, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      id,
      hypothesisId,
      userId,
      data.polarity,
      data.sourceKind,
      data.sourceId ?? null,
      data.sourceUrl ?? null,
      data.notes ?? null,
      JSON.stringify(data.metadata ?? {}),
    ],
  );

  const created = await getEvidence(id, userId);
  if (!created) throw new Error('Failed to create evidence');
  return created;
}

// ─── Delete ─────────────────────────────────────────────────────────────────

export async function deleteEvidence(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getResearchPool();
  const r = await pool.query(
    `DELETE FROM agos_research_hypothesis_evidence e
      WHERE e.id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_hypotheses h
               WHERE h.id = e.hypothesis_id AND h.user_id = $2
            )`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}
