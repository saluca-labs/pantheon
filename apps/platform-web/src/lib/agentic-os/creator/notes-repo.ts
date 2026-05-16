/**
 * Creator OS Phase 1 — notes DB repository.
 *
 * Cross-ownership contract: every read / write filters by `user_id`
 * directly. A note id belonging to another user returns null on get /
 * update / archive / restore / delete.
 *
 * @license MIT — Tiresias Creator OS Phase 1 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getCreatorPool } from './session';
import { recordAudit } from '../_shared/audit';
import type {
  CreatorNote,
  CreateCreatorNoteInput,
  UpdateCreatorNoteInput,
  ListCreatorNotesOpts,
} from './notes';

const NOTE_COLUMNS = `id, user_id, title, content, icon,
                       cover_image_url, parent_id, position,
                       tags, is_pinned,
                       archived_at, created_at, updated_at`;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

function toIsoOrNull(v: unknown): string | null {
  if (v == null) return null;
  return toIso(v);
}

interface RawNoteRow {
  id: string;
  user_id: string;
  title: string;
  content: Record<string, unknown> | null;
  icon: string | null;
  cover_image_url: string | null;
  parent_id: string | null;
  position: number | string | null;
  tags: string[] | null;
  is_pinned: boolean | null;
  archived_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function rowToNote(row: RawNoteRow): CreatorNote {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    content: (row.content as Record<string, unknown>) ?? {},
    icon: row.icon ?? null,
    coverImageUrl: row.cover_image_url ?? null,
    parentId: row.parent_id ?? null,
    position: Number(row.position ?? 0),
    tags: Array.isArray(row.tags) ? row.tags : [],
    isPinned: Boolean(row.is_pinned),
    archivedAt: toIsoOrNull(row.archived_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── List ─────────────────────────────────────────────────────────────────

export async function listNotes(
  userId: string,
  opts: ListCreatorNotesOpts = {},
): Promise<CreatorNote[]> {
  const pool = getCreatorPool();
  const params: unknown[] = [userId];
  const where: string[] = [`user_id = $1`];

  if (opts.includeArchived !== true) {
    where.push(`archived_at IS NULL`);
  }

  if (opts.parentId !== undefined) {
    if (opts.parentId === null) {
      where.push(`parent_id IS NULL`);
    } else {
      params.push(opts.parentId);
      where.push(`parent_id = $${params.length}`);
    }
  }

  if (opts.isPinned === true) {
    where.push(`is_pinned = true`);
  }

  if (opts.search && opts.search.trim()) {
    params.push(`%${opts.search.trim().toLowerCase()}%`);
    where.push(
      `(LOWER(title) LIKE $${params.length}
        OR $${params.length} = ANY(tags))`,
    );
  }

  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  params.push(limit);
  params.push(offset);

  const r = await pool.query(
    `SELECT ${NOTE_COLUMNS}
       FROM agos_creator_notes
      WHERE ${where.join(' AND ')}
      ORDER BY is_pinned DESC, position ASC, updated_at DESC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToNote);
}

// ─── Get one ──────────────────────────────────────────────────────────────

export async function getNote(
  id: string,
  userId: string,
): Promise<CreatorNote | null> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `SELECT ${NOTE_COLUMNS}
       FROM agos_creator_notes
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToNote(r.rows[0]);
}

// ─── Create ───────────────────────────────────────────────────────────────

export async function createNote(
  input: CreateCreatorNoteInput,
  userId: string,
): Promise<CreatorNote> {
  const pool = getCreatorPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_creator_notes
       (id, user_id, title, content, icon, cover_image_url,
        parent_id, tags, is_pinned)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8::text[],$9)`,
    [
      id,
      userId,
      input.title ?? 'Untitled',
      JSON.stringify(input.content ?? {}),
      input.icon ?? null,
      input.coverImageUrl ?? null,
      input.parentId ?? null,
      input.tags ?? [],
      input.isPinned ?? false,
    ],
  );

  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: userId,
    action: 'creator.note.created',
    payload: { noteId: id, title: input.title ?? 'Untitled' },
  });

  const after = await getNote(id, userId);
  if (!after) throw new Error('Failed to create note');
  return after;
}

// ─── Update ───────────────────────────────────────────────────────────────

export type UpdateNoteOutcome =
  | { kind: 'ok'; note: CreatorNote }
  | { kind: 'not_found' };

export async function updateNote(
  id: string,
  userId: string,
  patch: UpdateCreatorNoteInput,
): Promise<UpdateNoteOutcome> {
  const pool = getCreatorPool();
  const set: string[] = [];
  const params: unknown[] = [id, userId];
  let n = 2;

  if (patch.title !== undefined) {
    params.push(patch.title);
    n += 1;
    set.push(`title = $${n}`);
  }
  if (patch.content !== undefined) {
    params.push(JSON.stringify(patch.content));
    n += 1;
    set.push(`content = $${n}::jsonb`);
  }
  if (patch.icon !== undefined) {
    params.push(patch.icon);
    n += 1;
    set.push(`icon = $${n}`);
  }
  if (patch.coverImageUrl !== undefined) {
    params.push(patch.coverImageUrl);
    n += 1;
    set.push(`cover_image_url = $${n}`);
  }
  if (patch.parentId !== undefined) {
    params.push(patch.parentId);
    n += 1;
    set.push(`parent_id = $${n}`);
  }
  if (patch.position !== undefined) {
    params.push(patch.position);
    n += 1;
    set.push(`position = $${n}`);
  }
  if (patch.tags !== undefined) {
    params.push(patch.tags);
    n += 1;
    set.push(`tags = $${n}::text[]`);
  }
  if (patch.isPinned !== undefined) {
    params.push(patch.isPinned);
    n += 1;
    set.push(`is_pinned = $${n}`);
  }

  if (set.length === 0) {
    const current = await getNote(id, userId);
    return current ? { kind: 'ok', note: current } : { kind: 'not_found' };
  }

  const r = await pool.query(
    `UPDATE agos_creator_notes
        SET ${set.join(', ')}
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    params,
  );
  if ((r.rowCount ?? 0) === 0) return { kind: 'not_found' };

  const after = await getNote(id, userId);
  if (!after) return { kind: 'not_found' };

  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: userId,
    action: 'creator.note.updated',
    payload: { noteId: id, fields: Object.keys(patch) },
  });

  return { kind: 'ok', note: after };
}

// ─── Archive / restore ────────────────────────────────────────────────────

export async function archiveNote(
  id: string,
  userId: string,
): Promise<CreatorNote | null> {
  const pool = getCreatorPool();
  await pool.query(
    `UPDATE agos_creator_notes
        SET archived_at = now()
      WHERE id = $1 AND user_id = $2
        AND archived_at IS NULL`,
    [id, userId],
  );

  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: userId,
    action: 'creator.note.archived',
    payload: { noteId: id },
  });

  return getNote(id, userId);
}

export async function restoreNote(
  id: string,
  userId: string,
): Promise<CreatorNote | null> {
  const pool = getCreatorPool();
  const before = await getNote(id, userId);
  if (!before) return null;

  await pool.query(
    `UPDATE agos_creator_notes
        SET archived_at = NULL
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );

  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: userId,
    action: 'creator.note.restored',
    payload: { noteId: id },
  });

  return getNote(id, userId);
}

// ─── Delete ───────────────────────────────────────────────────────────────

export async function deleteNote(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `DELETE FROM agos_creator_notes
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    [id, userId],
  );

  const deleted = (r.rowCount ?? 0) > 0;
  if (deleted) {
    await recordAudit({
      pool,
      osSlug: 'creator',
      actorId: userId,
      action: 'creator.note.deleted',
      payload: { noteId: id },
    });
  }

  return deleted;
}
