/**
 * Agentic OS — audit log repo.
 *
 * Provides a paginated read API over the shared `agos_audit` table that all
 * per-OS BFF routes write to via `recordAudit`. The viewer endpoint and UI
 * use this module exclusively — write paths stay in each OS's own repo.ts
 * to keep ownership clear.
 *
 * Schema (from migration 0003_agentic_os.py):
 *   agos_audit(id, project_id, actor_id, os_slug, action, payload, created_at)
 *
 * Cursor pagination is created_at-DESC, tie-broken by id-DESC. Cursors are
 * encoded as base64url(JSON({ts, id})) so they're opaque to clients but easy
 * to debug.
 *
 * @license MIT — Tiresias platform (internal).
 */

import 'server-only';
import { getMakerPool } from '@/lib/agentic-os/maker/session';
import { AGENTIC_OS_MODULES } from '@/lib/agentic-os/registry';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  actorId: string | null;
  osSlug: string;
  action: string;
  payload: Record<string, unknown>;
  createdAt: string; // ISO-8601
}

export interface AuditCursor {
  ts: string; // ISO-8601 created_at
  id: string;
}

export interface ListAuditOptions {
  actorId: string;
  slug?: string | null;
  action?: string | null;
  fromTs?: string | null; // inclusive
  toTs?: string | null; // exclusive
  limit?: number; // 1..200, default 50
  cursor?: AuditCursor | null;
}

export interface ListAuditResult {
  entries: AuditEntry[];
  nextCursor: AuditCursor | null;
}

// ─── Slug validation ─────────────────────────────────────────────────────────

const VALID_SLUGS: ReadonlySet<string> = new Set(AGENTIC_OS_MODULES.map((m) => m.slug));

export function isValidSlug(slug: string): boolean {
  return VALID_SLUGS.has(slug);
}

// ─── Cursor codec ────────────────────────────────────────────────────────────

export function encodeCursor(c: AuditCursor): string {
  const json = JSON.stringify(c);
  return Buffer.from(json, 'utf8').toString('base64url');
}

export function decodeCursor(s: string): AuditCursor | null {
  try {
    const json = Buffer.from(s, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'ts' in parsed &&
      'id' in parsed &&
      typeof (parsed as AuditCursor).ts === 'string' &&
      typeof (parsed as AuditCursor).id === 'string'
    ) {
      // Validate ts is ISO-parseable and id is a UUID-like string.
      const ts = (parsed as AuditCursor).ts;
      const id = (parsed as AuditCursor).id;
      if (Number.isNaN(Date.parse(ts))) return null;
      if (!/^[0-9a-fA-F-]{8,}$/.test(id)) return null;
      return { ts, id };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Reader ──────────────────────────────────────────────────────────────────

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

interface AuditRow {
  id: string;
  actor_id: string | null;
  os_slug: string;
  action: string;
  payload: unknown;
  created_at: Date;
}

/**
 * List audit entries for the actor, ordered by created_at DESC, id DESC.
 *
 * Returns up to `limit` entries plus a `nextCursor` if more exist.
 */
export async function listAudit(opts: ListAuditOptions): Promise<ListAuditResult> {
  const limit = Math.max(1, Math.min(MAX_LIMIT, opts.limit ?? DEFAULT_LIMIT));
  const params: unknown[] = [opts.actorId];
  const wheres: string[] = ['actor_id = $1'];

  if (opts.slug) {
    if (!isValidSlug(opts.slug)) {
      // Caller should validate first; defensive check returns empty.
      return { entries: [], nextCursor: null };
    }
    params.push(opts.slug);
    wheres.push(`os_slug = $${params.length}`);
  }

  if (opts.action) {
    params.push(opts.action);
    wheres.push(`action = $${params.length}`);
  }

  if (opts.fromTs) {
    params.push(opts.fromTs);
    wheres.push(`created_at >= $${params.length}`);
  }

  if (opts.toTs) {
    params.push(opts.toTs);
    wheres.push(`created_at < $${params.length}`);
  }

  if (opts.cursor) {
    params.push(opts.cursor.ts);
    const tsParam = `$${params.length}`;
    params.push(opts.cursor.id);
    const idParam = `$${params.length}`;
    // (created_at, id) < (cursor.ts, cursor.id) in DESC order
    wheres.push(`(created_at, id) < (${tsParam}::timestamptz, ${idParam}::uuid)`);
  }

  // Fetch limit+1 to detect "more"
  params.push(limit + 1);
  const limitParam = `$${params.length}`;

  const sql = `
    SELECT id, actor_id, os_slug, action, payload, created_at
    FROM agos_audit
    WHERE ${wheres.join(' AND ')}
    ORDER BY created_at DESC, id DESC
    LIMIT ${limitParam}
  `;

  const pool = getMakerPool();
  const r = await pool.query<AuditRow>(sql, params);

  const rows = r.rows;
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;

  const entries: AuditEntry[] = slice.map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    osSlug: row.os_slug,
    action: row.action,
    payload:
      row.payload && typeof row.payload === 'object'
        ? (row.payload as Record<string, unknown>)
        : {},
    createdAt: row.created_at.toISOString(),
  }));

  let nextCursor: AuditCursor | null = null;
  if (hasMore && entries.length > 0) {
    const last = entries[entries.length - 1]!;
    nextCursor = { ts: last.createdAt, id: last.id };
  }

  return { entries, nextCursor };
}
