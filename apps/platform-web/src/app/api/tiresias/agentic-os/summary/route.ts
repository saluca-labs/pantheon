/**
 * Agentic OS — /api/tiresias/agentic-os/summary
 *
 * GET — returns per-OS record counts and last-updated timestamps for the
 *       authenticated user. Queries all 9 OS primary tables in parallel
 *       via Promise.allSettled so a single table failure never crashes the
 *       whole response.
 *
 * Response shape:
 *   { summary: { [slug: string]: { count: number, lastUpdated: string | null, error?: string } } }
 *
 * Cache: in-memory 30-second TTL keyed by userId. The Map is module-level so
 *        it survives between requests in the same process but is never shared
 *        across users — each entry is keyed by userId.
 *
 * @license MIT — Tiresias platform (internal).
 */

import 'server-only';
import { NextResponse } from 'next/server';
import { getCurrentMakerUser, getMakerPool } from '@/lib/agentic-os/maker/session';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OsSummaryEntry {
  count: number;
  lastUpdated: string | null;
  error?: string;
}

export interface SummaryPayload {
  summary: Record<string, OsSummaryEntry>;
}

// ─── In-memory cache ──────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  ts: number;
  data: Record<string, OsSummaryEntry>;
}

const cache = new Map<string, CacheEntry>();

function getCached(userId: string): Record<string, OsSummaryEntry> | null {
  const entry = cache.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(userId);
    return null;
  }
  return entry.data;
}

function setCached(userId: string, data: Record<string, OsSummaryEntry>): void {
  cache.set(userId, { ts: Date.now(), data });
}

// ─── Per-OS query definitions ─────────────────────────────────────────────────

/**
 * Each entry describes how to count records for one OS.
 *
 * - table:   the primary table name (verified against each slug's repo.ts)
 * - userCol: the column that identifies the owner (usually user_id; cyber uses owner_id)
 * - timeCol: column used for max() — secure-dev only has created_at
 */
interface OsQueryDef {
  slug: string;
  table: string;
  userCol: string;
  timeCol: string;
}

const OS_QUERY_DEFS: OsQueryDef[] = [
  // health: single-row upsert profile — count is 0 or 1
  { slug: 'health',         table: 'agos_health_profile',          userCol: 'user_id',  timeCol: 'updated_at' },
  // maker: builds
  { slug: 'maker',          table: 'agos_maker_builds',            userCol: 'user_id',  timeCol: 'updated_at' },
  // research: hypotheses
  { slug: 'research',       table: 'agos_research_hypotheses',     userCol: 'user_id',  timeCol: 'updated_at' },
  // secure-dev: threat models — only has created_at (confirmed in repo.ts)
  { slug: 'secure-dev',     table: 'agos_secdev_threat_models',    userCol: 'user_id',  timeCol: 'created_at' },
  // cyber: alerts — uses owner_id not user_id (confirmed in repo.ts)
  { slug: 'cyber',          table: 'agos_cyber_alerts',            userCol: 'owner_id', timeCol: 'updated_at' },
  // filmmaker: count projects (shots are project-scoped; projects have user_id + updated_at)
  { slug: 'filmmaker',      table: 'agos_filmmaker_projects',      userCol: 'user_id',  timeCol: 'updated_at' },
  // autobiographer: chapters
  { slug: 'autobiographer', table: 'agos_autobiographer_chapters', userCol: 'user_id',  timeCol: 'updated_at' },
  // business: people contacts
  { slug: 'business',       table: 'agos_business_people',         userCol: 'user_id',  timeCol: 'updated_at' },
  // business_deals: pipeline deals (Phase 2)
  { slug: 'business_deals', table: 'agos_business_deals',          userCol: 'user_id',  timeCol: 'updated_at' },
  // creator: posts
  { slug: 'creator',        table: 'agos_creator_posts',           userCol: 'user_id',  timeCol: 'updated_at' },
];

// ─── Query executor ───────────────────────────────────────────────────────────

async function queryOsSummary(def: OsQueryDef, userId: string): Promise<OsSummaryEntry> {
  const pool = getMakerPool(); // all session helpers alias the same shared pg Pool
  const sql = `SELECT count(*) AS c, max(${def.timeCol}) AS u FROM ${def.table} WHERE ${def.userCol} = $1`;
  const r = await pool.query(sql, [userId]);
  const row = r.rows[0];
  const count = parseInt(row.c as string, 10);
  const lastUpdated: string | null = row.u ? (row.u as Date).toISOString() : null;
  return { count, lastUpdated };
}

// ─── Summary helper (exported for direct server-component use) ────────────────

export async function getOsSummary(userId: string): Promise<Record<string, OsSummaryEntry>> {
  const cached = getCached(userId);
  if (cached) return cached;

  const results = await Promise.allSettled(
    OS_QUERY_DEFS.map((def) => queryOsSummary(def, userId)),
  );

  const summary: Record<string, OsSummaryEntry> = {};
  results.forEach((result, i) => {
    const def = OS_QUERY_DEFS[i]!;
    if (result.status === 'fulfilled') {
      summary[def.slug] = result.value;
    } else {
      summary[def.slug] = {
        count: 0,
        lastUpdated: null,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      };
    }
  });

  setCached(userId, summary);
  return summary;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const summary = await getOsSummary(user.userId);
  return NextResponse.json({ summary } satisfies SummaryPayload);
}
