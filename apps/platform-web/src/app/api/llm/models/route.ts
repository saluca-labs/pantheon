/**
 * GET /api/llm/models
 *
 * Returns the current cloud-LLM model availability registry, populated by
 * the 6-hour llm-models-heartbeat CronJob (apps/platform-api/k8s/pantheon/
 * cronjobs/llm-models-heartbeat.yaml). Source of truth for model pickers,
 * agent config UIs, and the pantheon dashboard widget.
 *
 * Query params (all optional):
 *   provider          Filter by provider key (anthropic, openrouter, gemini,
 *                     ollama_cloud). Repeatable: ?provider=anthropic&provider=gemini.
 *   includeDeprecated Boolean; default false. Set to "true" to include
 *                     models whose deprecated_at is non-null.
 *   capability        Filter to models whose capabilities JSONB contains the
 *                     given key as a truthy value (e.g. vision, tool_use).
 *
 * Response shape:
 *   {
 *     models: Array<{
 *       id, provider, model_id, display_name,
 *       context_window, max_output_tokens,
 *       capabilities, pricing,
 *       first_seen_at, last_seen_at, deprecated_at
 *     }>,
 *     providers: Record<provider, {
 *       count, last_seen_at, deprecated_count
 *     }>,
 *     fetched_at: ISO timestamp,
 *   }
 *
 * Auth: requires a valid local session (same gate as /api/tiresias/rbac/*).
 */
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { validateSession } from '@platform/auth';
import { getSessionToken, type ReadableCookieStore } from '@platform/auth/cookies';
import { Pool } from 'pg';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env['DATABASE_URL'],
      max: 5,
    });
  }
  return _pool;
}

async function getLocalSession() {
  const cookieStore = await cookies();
  const token = getSessionToken(cookieStore as ReadableCookieStore);
  if (!token) return null;
  return validateSession(token, getPool());
}

interface ModelRow {
  id: string;
  provider: string;
  model_id: string;
  display_name: string | null;
  context_window: number | null;
  max_output_tokens: number | null;
  capabilities: Record<string, unknown>;
  pricing: Record<string, unknown>;
  first_seen_at: string;
  last_seen_at: string;
  deprecated_at: string | null;
}

interface ProviderSummary {
  count: number;
  last_seen_at: string | null;
  deprecated_count: number;
}

export async function GET(request: NextRequest) {
  const session = await getLocalSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const providers = searchParams.getAll('provider');
  const includeDeprecated = searchParams.get('includeDeprecated') === 'true';
  const capability = searchParams.get('capability');

  // Build the WHERE clause with parameterized inputs (no string interp on user data).
  const where: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (providers.length > 0) {
    where.push(`provider = ANY($${i}::text[])`);
    params.push(providers);
    i++;
  }
  if (!includeDeprecated) {
    where.push('deprecated_at IS NULL');
  }
  if (capability) {
    // Match capabilities ? key AND capabilities ->> key matches a truthy value.
    where.push(`(capabilities ? $${i} AND capabilities ->> $${i} NOT IN ('false', 'null', ''))`);
    params.push(capability);
    i++;
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const db = getPool();
    const { rows } = await db.query<ModelRow>(
      `SELECT id, provider, model_id, display_name, context_window,
              max_output_tokens, capabilities, pricing,
              first_seen_at, last_seen_at, deprecated_at
       FROM _llm_available_models
       ${whereSql}
       ORDER BY provider ASC, last_seen_at DESC, model_id ASC
       LIMIT 2000`,
      params,
    );

    // Provider summary — aggregate counts + freshness.
    const providerSummary: Record<string, ProviderSummary> = {};
    for (const r of rows) {
      const p = providerSummary[r.provider] ?? {
        count: 0,
        last_seen_at: null,
        deprecated_count: 0,
      };
      p.count += 1;
      if (r.deprecated_at) p.deprecated_count += 1;
      if (!p.last_seen_at || r.last_seen_at > p.last_seen_at) {
        p.last_seen_at = r.last_seen_at;
      }
      providerSummary[r.provider] = p;
    }

    return NextResponse.json(
      {
        models: rows,
        providers: providerSummary,
        fetched_at: new Date().toISOString(),
      },
      {
        // Short cache — UI may poll. Heartbeat runs every 6h so the data
        // doesn't change often; 60s is enough to absorb a refresh burst.
        headers: { 'Cache-Control': 'private, max-age=60' },
      },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Failed to query LLM model registry',
        detail: err instanceof Error ? err.message : 'unknown',
      },
      { status: 500 },
    );
  }
}
