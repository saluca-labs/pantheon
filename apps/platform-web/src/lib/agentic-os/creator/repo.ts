/**
 * Creator OS — database CRUD for editorial calendar posts.
 *
 * All queries target the `agos_creator_*` tables added in migration
 * 0011_creator_os.py.
 *
 * @license MIT — original work for Tiresias platform
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { getCreatorPool } from './session';
import { recordAudit } from '../_shared/audit';
import type { CalendarPost, PostStatus, Channel, ContentFormat } from './calendar';

export async function listPosts(userId: string, limit = 50): Promise<CalendarPost[]> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `SELECT id, user_id, title, status, channel, content_format,
            publish_at, body, tags, created_at, updated_at
       FROM agos_creator_posts
      WHERE user_id = $1
      ORDER BY COALESCE(publish_at, updated_at) DESC
      LIMIT $2`,
    [userId, limit],
  );
  return r.rows.map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    status: row.status as PostStatus,
    channel: row.channel as Channel,
    contentFormat: row.content_format as ContentFormat,
    publishAt: row.publish_at ? row.publish_at.toISOString() : null,
    body: row.body,
    tags: row.tags ?? [],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));
}

export async function getPost(id: string): Promise<CalendarPost | null> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `SELECT id, user_id, title, status, channel, content_format,
            publish_at, body, tags, created_at, updated_at
       FROM agos_creator_posts WHERE id = $1`,
    [id],
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0];
  return {
    id: row.id, userId: row.user_id, title: row.title,
    status: row.status as PostStatus, channel: row.channel as Channel,
    contentFormat: row.content_format as ContentFormat,
    publishAt: row.publish_at ? row.publish_at.toISOString() : null,
    body: row.body, tags: row.tags ?? [],
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  };
}

export interface PostCreate {
  title: string;
  status?: PostStatus;
  channel: Channel;
  contentFormat: ContentFormat;
  publishAt?: string | null;
  body?: string | null;
  tags?: string[];
}

export async function createPost(userId: string, data: PostCreate): Promise<CalendarPost> {
  const pool = getCreatorPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_creator_posts
       (id, user_id, title, status, channel, content_format, publish_at, body, tags)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
    [
      id, userId, data.title,
      data.status ?? 'idea', data.channel, data.contentFormat,
      data.publishAt ?? null, data.body ?? null,
      JSON.stringify(data.tags ?? []),
    ],
  );
  const post = await getPost(id);
  if (!post) throw new Error('Failed to create post');
  return post;
}

export async function updatePostStatus(id: string, status: PostStatus): Promise<void> {
  const pool = getCreatorPool();
  await pool.query(
    `UPDATE agos_creator_posts SET status = $2, updated_at = now() WHERE id = $1`,
    [id, status],
  );
}
