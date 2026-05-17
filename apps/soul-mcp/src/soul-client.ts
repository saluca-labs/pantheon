/**
 * soul-client.ts — Thin HTTP client for the upstream soul-service.
 *
 * The adapter talks to soul-service exclusively through this client so the
 * tool handlers do not need to know the wire format. All calls carry the
 * shared-secret header (SOUL_SERVICE_KEY) when one is configured —
 * soul-service treats unset SOUL_SERVICE_KEY as fail-open (deploy-able
 * before the Secret Manager key exists) and enforces 401 when the key is
 * set. We always set the header if we have one, so both postures work.
 *
 * Endpoint surface (matches apps/soul-service/soul/serve.py):
 *   GET    /health/live
 *   POST   /memory/write              { session_id, content, topics, metadata }
 *   GET    /memory/{session_id}?limit
 *   POST   /tkhr/lookup               { topics: [...] }
 *   GET    /tkhr/top?limit
 *   GET    /tkhr/stats
 *   POST   /graph/integrity/{session_id}
 *
 * Failure mode: every method throws `SoulServiceError` on non-2xx so the
 * caller can decide whether to surface as an MCP tool error or HTTP 5xx.
 */

const DEFAULT_BASE_URL = 'http://soul-service:8080';
const DEFAULT_TIMEOUT_MS = 15_000;

export class SoulServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = 'SoulServiceError';
  }
}

export interface SoulClientOptions {
  baseUrl?: string;
  serviceKey?: string;
  timeoutMs?: number;
}

export interface WriteMemoryRequest {
  session_id: string;
  content: string;
  topics?: string[];
  metadata?: Record<string, unknown>;
}

export interface MemoryRecord {
  id: string;
  session_id: string;
  topic_id: string;
  full_context: string;
  full_context_hash: string;
  summarized_context: string;
  summarized_context_hash: string;
  topics?: string[];
  metadata: Record<string, unknown>;
  created_at: string;
}

export class SoulClient {
  readonly baseUrl: string;
  private readonly serviceKey: string;
  private readonly timeoutMs: number;

  constructor(opts: SoulClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.SOUL_SERVICE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.serviceKey = opts.serviceKey ?? process.env.SOUL_SERVICE_KEY ?? '';
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Returns true when the backend's /health/live responds 200 within timeout. */
  async healthy(): Promise<boolean> {
    try {
      const res = await this.request('GET', '/health/live', { auth: false });
      return res.ok;
    } catch {
      return false;
    }
  }

  async writeMemory(req: WriteMemoryRequest): Promise<{ memory_id: string }> {
    const body = {
      session_id: req.session_id,
      content: req.content,
      topics: req.topics ?? [],
      metadata: req.metadata ?? {},
    };
    return this.json('POST', '/memory/write', body);
  }

  async readMemory(sessionId: string, limit = 20): Promise<{ memories: MemoryRecord[]; count: number }> {
    return this.json(
      'GET',
      `/memory/${encodeURIComponent(sessionId)}?limit=${limit}`,
    );
  }

  async tkhrLookup(topics: string[]): Promise<{ memory_ids: string[]; count: number }> {
    return this.json('POST', '/tkhr/lookup', { topics });
  }

  async tkhrTop(limit = 20): Promise<{ topics: Array<{ topic: string; weight: number }> }> {
    return this.json('GET', `/tkhr/top?limit=${limit}`);
  }

  async tkhrStats(): Promise<Record<string, unknown>> {
    return this.json('GET', '/tkhr/stats');
  }

  async verifyIntegrity(sessionId: string): Promise<{ session_id: string; status: string }> {
    return this.json('POST', `/graph/integrity/${encodeURIComponent(sessionId)}`);
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.request(method, path, { body });
    const text = await res.text();
    if (!res.ok) {
      throw new SoulServiceError(
        `soul-service ${method} ${path} -> ${res.status}`,
        res.status,
        text,
      );
    }
    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  private async request(
    method: string,
    path: string,
    opts: { body?: unknown; auth?: boolean } = {},
  ): Promise<Response> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    const headers: Record<string, string> = {};
    if (opts.auth !== false && this.serviceKey) {
      headers['x-soul-service-key'] = this.serviceKey;
    }
    if (opts.body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    const init: RequestInit = { method, headers, signal: ctl.signal };
    if (opts.body !== undefined) {
      init.body = JSON.stringify(opts.body);
    }
    try {
      return await fetch(`${this.baseUrl}${path}`, init);
    } finally {
      clearTimeout(timer);
    }
  }
}
