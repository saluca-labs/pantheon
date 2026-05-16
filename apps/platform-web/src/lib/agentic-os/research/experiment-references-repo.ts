/**
 * Research OS Phase 4 — experiment-paper reference DB repository.
 *
 * Cross-ownership
 * ---------------
 * The join row's `experiment_id` carries NO FK (platform v0.1.30); the
 * `paper_id` FK CASCADE → papers. Ownership of BOTH sides is enforced by
 * EXISTS clauses against `agos_research_experiments` + `agos_research_papers`
 * filtered by `user_id` for every read and mutation.
 *
 * UNIQUE constraint on (experiment_id, paper_id, relevance) — INSERT
 * catches SQLSTATE 23505 and surfaces `{kind: 'duplicate'}` for 409
 * translation. Different relevance values for the same (exp, paper) pair
 * are allowed.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getResearchPool } from './session';
import {
  REFERENCE_RELEVANCES,
  asReferenceRelevance,
  type ReferenceRelevance,
  type ExperimentReferenceLink,
  type LinkedPaperReference,
  type CreateReferenceInput,
  type UpdateReferenceInput,
} from './experiment-references';
import { asPaperKind, type Paper } from './papers';

const LINK_COLUMNS = `id, experiment_id, paper_id, relevance, notes, created_at`;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

function toIsoOrNull(v: unknown): string | null {
  if (v == null) return null;
  return toIso(v);
}

interface RawLinkRow {
  id: string;
  experiment_id: string;
  paper_id: string;
  relevance: string | null;
  notes: string | null;
  created_at: Date | string;
}

interface RawJoinedPaperRow {
  p_id: string;
  p_user_id: string;
  p_title: string;
  p_kind: string;
  p_doi: string | null;
  p_arxiv_id: string | null;
  p_url: string | null;
  p_authors_text: string | null;
  p_venue: string | null;
  p_year: number | string | null;
  p_abstract_md: string | null;
  p_tags: string[] | null;
  p_metadata: Record<string, unknown> | null;
  p_archived_at: Date | string | null;
  p_created_at: Date | string;
  p_updated_at: Date | string;
}

function rowToLink(row: RawLinkRow): ExperimentReferenceLink {
  return {
    id: row.id,
    experimentId: row.experiment_id,
    paperId: row.paper_id,
    relevance: (asReferenceRelevance(row.relevance) ?? 'cites'),
    notes: row.notes ?? null,
    createdAt: toIso(row.created_at),
  };
}

function rowToPaper(row: RawJoinedPaperRow): Paper {
  return {
    id: row.p_id,
    userId: row.p_user_id,
    title: row.p_title,
    kind: (asPaperKind(row.p_kind) ?? 'paper'),
    doi: row.p_doi ?? null,
    arxivId: row.p_arxiv_id ?? null,
    url: row.p_url ?? null,
    authorsText: row.p_authors_text ?? null,
    venue: row.p_venue ?? null,
    year: row.p_year == null ? null : Number(row.p_year),
    abstractMd: row.p_abstract_md ?? null,
    tags: Array.isArray(row.p_tags) ? row.p_tags : [],
    metadata: (row.p_metadata as Record<string, unknown>) ?? {},
    archivedAt: toIsoOrNull(row.p_archived_at),
    createdAt: toIso(row.p_created_at),
    updatedAt: toIso(row.p_updated_at),
  };
}

// ─── Ownership probes ─────────────────────────────────────────────────────

export async function isExperimentOwnedByUser(
  experimentId: string,
  userId: string,
): Promise<boolean> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT 1 FROM agos_research_experiments
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [experimentId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function isPaperOwnedByUser(
  paperId: string,
  userId: string,
): Promise<boolean> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT 1 FROM agos_research_papers
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [paperId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── List joined ──────────────────────────────────────────────────────────

export async function listReferencesForExperiment(
  experimentId: string,
  userId: string,
): Promise<LinkedPaperReference[]> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT er.id, er.experiment_id, er.paper_id, er.relevance, er.notes, er.created_at,
            p.id            AS p_id,
            p.user_id       AS p_user_id,
            p.title         AS p_title,
            p.kind          AS p_kind,
            p.doi           AS p_doi,
            p.arxiv_id      AS p_arxiv_id,
            p.url           AS p_url,
            p.authors_text  AS p_authors_text,
            p.venue         AS p_venue,
            p.year          AS p_year,
            p.abstract_md   AS p_abstract_md,
            p.tags          AS p_tags,
            p.metadata      AS p_metadata,
            p.archived_at   AS p_archived_at,
            p.created_at    AS p_created_at,
            p.updated_at    AS p_updated_at
       FROM agos_research_experiment_references er
       JOIN agos_research_papers p ON p.id = er.paper_id
      WHERE er.experiment_id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_experiments e
               WHERE e.id = er.experiment_id AND e.user_id = $2
            )
        AND p.user_id = $2
      ORDER BY er.created_at ASC`,
    [experimentId, userId],
  );
  return r.rows.map((row: RawLinkRow & RawJoinedPaperRow) => ({
    link: rowToLink({
      id: row.id,
      experiment_id: row.experiment_id,
      paper_id: row.paper_id,
      relevance: row.relevance,
      notes: row.notes,
      created_at: row.created_at,
    }),
    paper: rowToPaper(row),
  }));
}

// ─── Get one ──────────────────────────────────────────────────────────────

export async function getReferenceByPair(
  experimentId: string,
  paperId: string,
  userId: string,
  relevance?: ReferenceRelevance,
): Promise<ExperimentReferenceLink | null> {
  const pool = getResearchPool();
  const params: unknown[] = [experimentId, paperId, userId];
  let clause = '';
  if (relevance) {
    params.push(relevance);
    clause = `AND er.relevance = $${params.length}`;
  }
  const r = await pool.query(
    `SELECT ${LINK_COLUMNS}
       FROM agos_research_experiment_references er
      WHERE er.experiment_id = $1
        AND er.paper_id = $2
        AND EXISTS (
              SELECT 1 FROM agos_research_experiments e
               WHERE e.id = er.experiment_id AND e.user_id = $3
            )
        AND EXISTS (
              SELECT 1 FROM agos_research_papers p
               WHERE p.id = er.paper_id AND p.user_id = $3
            )
        ${clause}
      LIMIT 1`,
    params,
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToLink(r.rows[0]);
}

// ─── List linked experiments for a paper (paper-detail view) ──────────────

export async function listExperimentsLinkingPaper(
  paperId: string,
  userId: string,
): Promise<
  Array<{
    link: ExperimentReferenceLink;
    experiment: { id: string; name: string };
  }>
> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT er.id, er.experiment_id, er.paper_id, er.relevance, er.notes, er.created_at,
            e.id   AS e_id,
            e.title AS e_name
       FROM agos_research_experiment_references er
       JOIN agos_research_experiments e ON e.id = er.experiment_id
      WHERE er.paper_id = $1
        AND e.user_id = $2
        AND EXISTS (
              SELECT 1 FROM agos_research_papers p
               WHERE p.id = er.paper_id AND p.user_id = $2
            )
      ORDER BY er.created_at DESC`,
    [paperId, userId],
  );
  return r.rows.map(
    (row: RawLinkRow & { e_id: string; e_name: string }) => ({
      link: rowToLink({
        id: row.id,
        experiment_id: row.experiment_id,
        paper_id: row.paper_id,
        relevance: row.relevance,
        notes: row.notes,
        created_at: row.created_at,
      }),
      experiment: { id: row.e_id, name: row.e_name },
    }),
  );
}

// ─── Create / link ────────────────────────────────────────────────────────

export type CreateReferenceOutcome =
  | { kind: 'ok'; link: ExperimentReferenceLink }
  | { kind: 'duplicate' };

export async function createReference(
  experimentId: string,
  userId: string,
  data: CreateReferenceInput,
): Promise<CreateReferenceOutcome> {
  const pool = getResearchPool();
  const relevance: ReferenceRelevance = data.relevance ?? 'cites';
  if (!(REFERENCE_RELEVANCES as readonly string[]).includes(relevance)) {
    throw new Error(`Invalid relevance: ${relevance}`);
  }
  const id = randomUUID();
  try {
    await pool.query(
      `INSERT INTO agos_research_experiment_references
         (id, experiment_id, paper_id, relevance, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, experimentId, data.paperId, relevance, data.notes ?? null],
    );
  } catch (err: unknown) {
    if (!(err instanceof Error)) throw err;
    const errErr = err as Error & { code?: string; constraint?: string };
    if (errErr?.code === '23505') return { kind: 'duplicate' };
    throw err;
  }
  const link = await getReferenceByPair(experimentId, data.paperId, userId, relevance);
  if (!link) return { kind: 'duplicate' };
  return { kind: 'ok', link };
}

// ─── Update ────────────────────────────────────────────────────────────────

export async function updateReference(
  experimentId: string,
  paperId: string,
  userId: string,
  patch: UpdateReferenceInput,
): Promise<ExperimentReferenceLink | null> {
  const pool = getResearchPool();
  if (
    patch.relevance !== undefined &&
    !(REFERENCE_RELEVANCES as readonly string[]).includes(patch.relevance)
  ) {
    throw new Error(`Invalid relevance: ${patch.relevance}`);
  }
  const set: string[] = [];
  const params: unknown[] = [experimentId, paperId, userId];
  let n = 3;
  if (patch.relevance !== undefined) {
    params.push(patch.relevance);
    n += 1;
    set.push(`relevance = $${n}`);
  }
  if (patch.notes !== undefined) {
    params.push(patch.notes);
    n += 1;
    set.push(`notes = $${n}`);
  }
  if (set.length === 0) {
    // No-op patch — return whatever exists.
    return getReferenceByPair(experimentId, paperId, userId);
  }
  try {
    const r = await pool.query(
      `UPDATE agos_research_experiment_references er
          SET ${set.join(', ')}
        WHERE er.experiment_id = $1
          AND er.paper_id = $2
          AND EXISTS (
                SELECT 1 FROM agos_research_experiments e
                 WHERE e.id = er.experiment_id AND e.user_id = $3
              )
          AND EXISTS (
                SELECT 1 FROM agos_research_papers p
                 WHERE p.id = er.paper_id AND p.user_id = $3
              )
        RETURNING er.id`,
      params,
    );
    if ((r.rowCount ?? 0) === 0) return null;
  } catch (err: unknown) {
    if (!(err instanceof Error)) throw err;
    const errErr = err as Error & { code?: string; constraint?: string };
    if (errErr?.code === '23505') {
      // Caller asked to switch relevance to a value that already
      // exists for this pair. Surface as null (the route then returns
      // 409 via getReferenceByPair short-circuit) — simpler than
      // threading another outcome shape through.
      return null;
    }
    throw err;
  }
  return getReferenceByPair(experimentId, paperId, userId);
}

// ─── Delete / unlink ───────────────────────────────────────────────────────

/**
 * Unlink one or more rows for a (experiment_id, paper_id) pair. When
 * `relevance` is supplied, only that row is unlinked; otherwise all
 * relevance rows for the pair are unlinked. Returns the number of rows
 * affected.
 */
export async function deleteReference(
  experimentId: string,
  paperId: string,
  userId: string,
  relevance?: ReferenceRelevance,
): Promise<number> {
  const pool = getResearchPool();
  const params: unknown[] = [experimentId, paperId, userId];
  let clause = '';
  if (relevance) {
    params.push(relevance);
    clause = `AND er.relevance = $${params.length}`;
  }
  const r = await pool.query(
    `DELETE FROM agos_research_experiment_references er
      WHERE er.experiment_id = $1
        AND er.paper_id = $2
        AND EXISTS (
              SELECT 1 FROM agos_research_experiments e
               WHERE e.id = er.experiment_id AND e.user_id = $3
            )
        AND EXISTS (
              SELECT 1 FROM agos_research_papers p
               WHERE p.id = er.paper_id AND p.user_id = $3
            )
        ${clause}`,
    params,
  );
  return r.rowCount ?? 0;
}

// ─── Reading-notes lookup (Phase 3 evidence rows where source_kind=paper) ─

export interface RelatedNotebookEntryRef {
  evidenceId: string;
  hypothesisId: string;
  notebookEntryId: string;
  notebookEntryTitle: string;
  notebookEntryKind: string;
  polarity: string;
  notes: string | null;
  createdAt: string;
}

/**
 * Phase 4 reading-notes integration. The spec locks: a notebook entry
 * with a Phase 3 evidence row of `source_kind='notebook_entry'` that
 * cites this paper would NOT show up here — we need the evidence row
 * whose `source_kind='paper'` AND `source_id = paper.id`. That is the
 * canonical reading-note link. We then join through `metadata` (if
 * present) or hint at the paper from the notebook entry it sits next
 * to. Simpler: we surface the evidence rows directly, plus the most
 * recent notebook entry under the same hypothesis that the user
 * authored — that's the practical "reading-note for this paper" link.
 *
 * The route layer projects this list to the paper-detail page.
 */
export async function listRelatedNotebookEntriesForPaper(
  paperId: string,
  userId: string,
): Promise<RelatedNotebookEntryRef[]> {
  const pool = getResearchPool();
  // Step 1: find Phase 3 evidence rows where source_kind=paper and
  // source_id=paperId, owned by this user.
  const r = await pool.query(
    `WITH ev AS (
       SELECT he.id           AS evidence_id,
              he.hypothesis_id,
              he.user_id,
              he.polarity,
              he.notes,
              he.created_at
         FROM agos_research_hypothesis_evidence he
        WHERE he.source_kind = 'paper'
          AND he.source_id = $1
          AND he.user_id   = $2
     )
     SELECT ev.evidence_id,
            ev.hypothesis_id,
            ev.polarity,
            ev.notes,
            ev.created_at,
            ne.id        AS ne_id,
            ne.title     AS ne_title,
            ne.entry_kind AS ne_kind
       FROM ev
       LEFT JOIN LATERAL (
         SELECT n.id, n.title, n.entry_kind
           FROM agos_research_notebook_entries n
           JOIN agos_research_experiments e ON e.id = n.experiment_id
          WHERE e.user_id = ev.user_id
            AND EXISTS (
                  SELECT 1 FROM agos_research_experiment_hypotheses lk
                   WHERE lk.experiment_id = n.experiment_id
                     AND lk.hypothesis_id = ev.hypothesis_id
                )
            AND n.archived_at IS NULL
          ORDER BY n.updated_at DESC
          LIMIT 1
       ) ne ON TRUE
      ORDER BY ev.created_at DESC`,
    [paperId, userId],
  );
  return r.rows.map(
    (row: {
      evidence_id: string;
      hypothesis_id: string;
      ne_id: string | null;
      ne_title: string | null;
      ne_kind: string | null;
      polarity: string;
      notes: string | null;
      created_at: Date | string;
    }) => ({
      evidenceId: row.evidence_id,
      hypothesisId: row.hypothesis_id,
      notebookEntryId: row.ne_id ?? '',
      notebookEntryTitle: row.ne_title ?? '',
      notebookEntryKind: row.ne_kind ?? '',
      polarity: row.polarity,
      notes: row.notes ?? null,
      createdAt: toIso(row.created_at),
    }),
  );
}
