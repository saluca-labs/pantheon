import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const TIRESIAS_API_URL =
  process.env['TIRESIAS_API_URL'] ?? 'http://localhost:8900';
const MEMORY_SERVICE_URL =
  process.env['MEMORY_SERVICE_URL'] ?? 'http://memory-service:8910';

const FETCH_TIMEOUT_MS = 3000;

let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env['DATABASE_URL'],
      max: 2,
    });
  }
  return _pool;
}

interface ComponentHealth {
  status: 'ready' | 'not_ready';
  latency_ms: number;
  error?: string;
}

async function checkDb(): Promise<ComponentHealth> {
  const started = performance.now();
  try {
    await getPool().query('SELECT 1');
    return {
      status: 'ready',
      latency_ms: Number((performance.now() - started).toFixed(2)),
    };
  } catch (err) {
    return {
      status: 'not_ready',
      latency_ms: Number((performance.now() - started).toFixed(2)),
      error: err instanceof Error ? err.message : 'unknown error',
    };
  }
}

async function checkUrl(
  url: string,
  init?: RequestInit,
): Promise<ComponentHealth> {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
    });
    const latency_ms = Number((performance.now() - started).toFixed(2));
    if (!resp.ok) {
      return {
        status: 'not_ready',
        latency_ms,
        error: `HTTP ${resp.status}`,
      };
    }
    return { status: 'ready', latency_ms };
  } catch (err) {
    return {
      status: 'not_ready',
      latency_ms: Number((performance.now() - started).toFixed(2)),
      error: err instanceof Error ? err.message : 'unknown error',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  const [db, platformApi, memoryService] = await Promise.all([
    checkDb(),
    checkUrl(`${TIRESIAS_API_URL}/health/ready`),
    checkUrl(`${MEMORY_SERVICE_URL}/health/ready`),
  ]);

  const overall =
    db.status === 'ready' &&
    platformApi.status === 'ready' &&
    memoryService.status === 'ready'
      ? 'ready'
      : 'not_ready';

  const body = {
    status: overall,
    components: {
      database: db,
      platform_api: platformApi,
      memory_service: memoryService,
    },
  };

  return NextResponse.json(body, { status: overall === 'ready' ? 200 : 503 });
}
