/**
 * Creator OS Phase 2 — posts DB repository.
 *
 * Cross-ownership contract: every read / write filters by `user_id`
 * directly. A post id belonging to another user returns null on get /
 * update / delete.
 *
 * @license MIT — Tiresias Creator OS Phase 2 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getCreatorPool } from './session';
import { recordAudit } from '../_shared/audit';
import type {
  CreatorPost,
  CreateCreatorPostInput,
  UpdateCreatorPostInput,
  ListCreatorPostsOpts,
  PostStatus,
} from './posts';

const POST_COLUMNS = `id, user_id, title, slug, excerpt, content,
                       cover_image_url, status,
                       scheduled_at, published_at,
                       tags, notes_md, publish_at,
                       created_at, updated_at`;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

function toIsoOrNull(v: unknown): string | null {
  if (v == null) return null;
  return toIso(v);
}

interface RawPostRow {
  id: string;
  user_id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: Record<string, unknown> | null;
  cover_image_url: string | null;
  status: string;
  scheduled_at: Date | string | null;
  published_at: Date | string | null;
  tags: string[] | null;
  notes_md: string | null;
  publish_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function rowToPost(row: RawPostRow): CreatorPost {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt ?? null,
    content: (row.content as Record<string, unknown>) ?? {},
    coverImageUrl: row.cover_image_url ?? null,
    status: row.status as PostStatus,
    scheduledAt: toIsoOrNull(row.scheduled_at),
    publishedAt: toIsoOrNull(row.published_at),
    tags: Array.isArray(row.tags) ? row.tags : [],
    notesMd: row.notes_md ?? null,
    publishAt: toIsoOrNull(row.publish_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── Slug generation ─────────────────────────────────────────────────────────

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
    || 'untitled';
}

async function generateUniqueSlug(
  baseSlug: string,
  userId: string,
  pool: ReturnType<typeof getCreatorPool>,
  excludeId?: string,
): Promise<string> {
  let candidate = baseSlug;
  let counter = 1;

  while (true) {
    const params: unknown[] = [userId, candidate];
    let excludeClause = '';
    if (excludeId) {
      params.push(excludeId);
      excludeClause = ` AND id != $${params.length}`;
    }
    const r = await pool.query(
      `SELECT 1 FROM agos_creator_posts
        WHERE user_id = $1 AND slug = $2${excludeClause}
        LIMIT 1`,
      params,
    );
    if ((r.rowCount ?? 0) === 0) return candidate;

    counter += 1;
    candidate = `${baseSlug}-${counter}`;
  }
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listPosts(
  userId: string,
  opts: ListCreatorPostsOpts = {},
): Promise<CreatorPost[]> {
  const pool = getCreatorPool();
  const params: unknown[] = [userId];
  const where: string[] = [`user_id = $1`];

  if (opts.includeArchived !== true) {
    where.push(`status != 'archived'`);
  }

  if (opts.status) {
    const statii = Array.isArray(opts.status) ? opts.status : [opts.status];
    const placeholders = statii.map((_, i) => `$${params.length + i + 1}`);
    params.push(...statii);
    where.push(`status IN (${placeholders.join(', ')})`);
  }

  if (opts.search && opts.search.trim()) {
    params.push(`%${opts.search.trim().toLowerCase()}%`);
    where.push(
      `(LOWER(title) LIKE $${params.length}
        OR LOWER(COALESCE(excerpt, '')) LIKE $${params.length}
        OR LOWER(COALESCE(notes_md, '')) LIKE $${params.length})`,
    );
  }

  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  params.push(limit);
  params.push(offset);

  const r = await pool.query(
    `SELECT ${POST_COLUMNS}
       FROM agos_creator_posts
      WHERE ${where.join(' AND ')}
      ORDER BY updated_at DESC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToPost);
}

// ─── Get one ──────────────────────────────────────────────────────────────────

export async function getPost(
  id: string,
  userId: string,
): Promise<CreatorPost | null> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `SELECT ${POST_COLUMNS}
       FROM agos_creator_posts
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToPost(r.rows[0]);
}

// ─── Get by slug ──────────────────────────────────────────────────────────────

export async function getPostBySlug(
  slug: string,
  userId: string,
): Promise<CreatorPost | null> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `SELECT ${POST_COLUMNS}
       FROM agos_creator_posts
      WHERE slug = $1 AND user_id = $2
      LIMIT 1`,
    [slug, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToPost(r.rows[0]);
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createPost(
  input: CreateCreatorPostInput,
  userId: string,
): Promise<CreatorPost> {
  const pool = getCreatorPool();
  const id = randomUUID();
  const baseSlug = input.slug ?? slugify(input.title);
  const slug = await generateUniqueSlug(baseSlug, userId, pool);

  await pool.query(
    `INSERT INTO agos_creator_posts
       (id, user_id, title, slug, excerpt, content, cover_image_url,
        status, scheduled_at, tags, notes_md)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb,$11)`,
    [
      id,
      userId,
      input.title,
      slug,
      input.excerpt ?? null,
      JSON.stringify(input.content ?? {}),
      input.coverImageUrl ?? null,
      input.status ?? 'draft',
      input.scheduledAt ?? null,
      JSON.stringify(input.tags ?? []),
      null,
    ],
  );

  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: userId,
    action: 'creator.post.created',
    payload: { postId: id, title: input.title, slug },
  });

  const after = await getPost(id, userId);
  if (!after) throw new Error('Failed to create post');
  return after;
}

// ─── Update ───────────────────────────────────────────────────────────────────

export type UpdatePostOutcome =
  | { kind: 'ok'; post: CreatorPost }
  | { kind: 'not_found' };

export async function updatePost(
  id: string,
  userId: string,
  patch: UpdateCreatorPostInput,
): Promise<UpdatePostOutcome> {
  const pool = getCreatorPool();
  const set: string[] = [];
  const params: unknown[] = [id, userId];
  let n = 2;

  if (patch.title !== undefined) {
    params.push(patch.title);
    n += 1;
    set.push(`title = $${n}`);
  }
  if (patch.slug !== undefined) {
    const uniqueSlug = await generateUniqueSlug(patch.slug, userId, pool, id);
    params.push(uniqueSlug);
    n += 1;
    set.push(`slug = $${n}`);
  }
  if (patch.excerpt !== undefined) {
    params.push(patch.excerpt);
    n += 1;
    set.push(`excerpt = $${n}`);
  }
  if (patch.content !== undefined) {
    params.push(JSON.stringify(patch.content));
    n += 1;
    set.push(`content = $${n}::jsonb`);
  }
  if (patch.coverImageUrl !== undefined) {
    params.push(patch.coverImageUrl);
    n += 1;
    set.push(`cover_image_url = $${n}`);
  }
  if (patch.status !== undefined) {
    params.push(patch.status);
    n += 1;
    set.push(`status = $${n}`);
  }
  if (patch.scheduledAt !== undefined) {
    params.push(patch.scheduledAt);
    n += 1;
    set.push(`scheduled_at = $${n}`);
  }
  if (patch.tags !== undefined) {
    params.push(JSON.stringify(patch.tags));
    n += 1;
    set.push(`tags = $${n}::jsonb`);
  }
  if (patch.notesMd !== undefined) {
    params.push(patch.notesMd);
    n += 1;
    set.push(`notes_md = $${n}`);
  }

  if (set.length === 0) {
    const current = await getPost(id, userId);
    return current ? { kind: 'ok', post: current } : { kind: 'not_found' };
  }

  const r = await pool.query(
    `UPDATE agos_creator_posts
        SET ${set.join(', ')}
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    params,
  );
  if ((r.rowCount ?? 0) === 0) return { kind: 'not_found' };

  const after = await getPost(id, userId);
  if (!after) return { kind: 'not_found' };

  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: userId,
    action: 'creator.post.updated',
    payload: { postId: id, fields: Object.keys(patch) },
  });

  return { kind: 'ok', post: after };
}

// ─── Publish ──────────────────────────────────────────────────────────────────

export async function publishPost(
  id: string,
  userId: string,
): Promise<CreatorPost | null> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `UPDATE agos_creator_posts
        SET status = 'published',
            published_at = now(),
            scheduled_at = NULL
      WHERE id = $1 AND user_id = $2
        AND status IN ('draft', 'scheduled')
      RETURNING id`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;

  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: userId,
    action: 'creator.post.published',
    payload: { postId: id },
  });

  return getPost(id, userId);
}

// ─── Schedule ─────────────────────────────────────────────────────────────────

export async function schedulePost(
  id: string,
  userId: string,
  scheduledAt: string,
): Promise<CreatorPost | null> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `UPDATE agos_creator_posts
        SET status = 'scheduled',
            scheduled_at = $3::timestamptz,
            published_at = NULL
      WHERE id = $1 AND user_id = $2
        AND status IN ('draft', 'idea')
      RETURNING id`,
    [id, userId, scheduledAt],
  );
  if ((r.rowCount ?? 0) === 0) return null;

  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: userId,
    action: 'creator.post.scheduled',
    payload: { postId: id, scheduledAt },
  });

  return getPost(id, userId);
}

// ─── Archive ──────────────────────────────────────────────────────────────────

export async function archivePost(
  id: string,
  userId: string,
): Promise<CreatorPost | null> {
  const pool = getCreatorPool();
  await pool.query(
    `UPDATE agos_creator_posts
        SET status = 'archived'
      WHERE id = $1 AND user_id = $2
        AND status != 'archived'`,
    [id, userId],
  );

  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: userId,
    action: 'creator.post.archived',
    payload: { postId: id },
  });

  return getPost(id, userId);
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deletePost(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `DELETE FROM agos_creator_posts
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
      action: 'creator.post.deleted',
      payload: { postId: id },
    });
  }

  return deleted;
}
