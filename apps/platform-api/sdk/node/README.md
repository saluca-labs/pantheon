# Tiresias Node.js SDK

Official Node.js / TypeScript client for the **Tiresias App Proxy** —
the AI-observability and zero-trust agent-auth sub-product that ships
inside the Pantheon monorepo at `apps/platform-app-proxy/`.

> **Branding note.** The App Proxy stays branded as Tiresias under
> the Pantheon umbrella; the SDK targets the App Proxy directly and
> therefore keeps the Tiresias name. See
> [ADR-013](../../../../docs/decisions/ADR-013-app-proxy-tiresias-branding.md)
> for the carve-out decision.

Route your LLM calls through Tiresias for encrypted audit logging, cost tracking, policy enforcement, and investigation.

## Installation

```bash
npm install tiresias
# or
yarn add tiresias
```

> **No package published yet?** You can use the proxy directly with any HTTP client or the OpenAI SDK — see [Direct Integration](#direct-integration-openai-sdk) below.

## Quickstart

```typescript
import { TiresiasClient } from 'tiresias';

const client = new TiresiasClient({
  apiKey: 'tir_acme_a3f8c2d9...',       // Your Tiresias proxy API key
  baseUrl: 'https://proxy.tiresias.network', // SaaS endpoint
});

// Health check
const health = await client.health();
console.log(health); // { status: 'ok', service: 'tiresias-proxy', mode: 'saas' }

// Get spend analytics
const spend = await client.getSpend({ start: '2026-04-01', end: '2026-04-05' });
console.log(`Total cost: $${spend.total_cost_usd}`);

// Search traces
const traces = await client.getTraces({ model: 'gpt-4o', limit: 20 });
for (const trace of traces.traces) {
  console.log(`${trace.model} | ${trace.token_count} tokens | $${trace.cost_usd}`);
}

// Replay a session (decrypted)
const replay = await client.replaySession('sess_abc123');
for (const turn of replay.turns) {
  console.log(`[${turn.model}] ${turn.prompt?.slice(0, 50)}...`);
}
```

## Direct Integration (OpenAI SDK)

The fastest way to use Tiresias — no SDK needed. Just change your base URL:

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: 'sk-your-openai-key',          // Your real OpenAI key
  baseURL: 'https://proxy.tiresias.network/v1',
  defaultHeaders: {
    'X-Tiresias-Api-Key': 'tir_acme_a3f8c2d9...', // Tiresias proxy key
  },
});

// All calls now route through Tiresias — encrypted, logged, rate-limited
const completion = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello, world!' }],
});

console.log(completion.choices[0].message.content);
```

Works with **any OpenAI-compatible SDK** (Anthropic via OpenAI compatibility, LiteLLM, etc.):

```typescript
// Anthropic via OpenAI SDK
const anthropic = new OpenAI({
  apiKey: 'sk-ant-your-key',
  baseURL: 'https://proxy.tiresias.network/v1',
  defaultHeaders: {
    'X-Tiresias-Api-Key': 'tir_acme_a3f8c2d9...',
  },
});

const msg = await anthropic.chat.completions.create({
  model: 'claude-sonnet-4-6',
  messages: [{ role: 'user', content: 'Explain quantum computing.' }],
});
```

## Session Tracking

Tag your calls with a session ID to group them for investigation:

```typescript
const completion = await openai.chat.completions.create(
  {
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'What is 2+2?' }],
  },
  {
    headers: {
      'X-Tiresias-Session-Id': 'my-agent-session-001',
    },
  },
);
```

Sessions can be replayed in the dashboard or via API:

```typescript
const replay = await fetch(
  'https://proxy.tiresias.network/dash/v1/sessions/my-agent-session-001/replay',
  {
    headers: { 'X-Tiresias-Api-Key': 'tir_acme_...' },
  },
);
const data = await replay.json();
// data.turns = [{ model, prompt, completion, tokens, cost, timestamp }, ...]
```

## Streaming

Streaming works transparently — Tiresias captures the full response for audit logging while streaming chunks to your client in real-time:

```typescript
const stream = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Write a poem about security.' }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
// Full response is audit-logged after stream completes
```

## Custom Metadata

Attach metadata to any request for filtering and investigation:

```typescript
const completion = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Summarize this document.' }],
  // Tiresias-specific field (stripped before forwarding to LLM)
  tiresias_metadata: {
    agent_name: 'document-summarizer',
    workflow_id: 'wf-123',
    environment: 'production',
  },
} as any);
```

## Error Handling

```typescript
try {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Hello' }],
  });
} catch (error) {
  if (error.status === 401) {
    // Invalid or missing Tiresias API key
    console.error('Check your X-Tiresias-Api-Key header');
  } else if (error.status === 429) {
    // Rate limited — check headers for backoff info
    const retryAfter = error.headers?.['retry-after'];
    const limit = error.headers?.['x-ratelimit-limit'];
    const remaining = error.headers?.['x-ratelimit-remaining'];
    console.error(`Rate limited. Retry after ${retryAfter}s. ${remaining}/${limit} remaining.`);
  } else if (error.status === 502) {
    // Upstream LLM provider error — check your LLM API key
    console.error('LLM provider returned an error. Verify your API key.');
  }
}
```

## Rate Limits

Tiresias enforces per-tenant rate limits based on your tier:

| Tier | RPM | Monthly Requests |
|------|-----|-----------------|
| Community | 30 | 10,000 |
| Starter ($49/mo) | 60 | 100,000 |
| Pro ($199/mo) | 300 | 1,000,000 |
| Enterprise | 1,000 | Unlimited |
| MSSP | 2,000 | Unlimited |

Rate limit headers are included on every response:
- `X-RateLimit-Limit` — Your tier's RPM limit
- `X-RateLimit-Remaining` — Requests remaining in current window
- `Retry-After` — Seconds to wait (only on 429)

## Dashboard API (fetch)

For dashboard and analytics, use plain `fetch`:

```typescript
const API_KEY = 'tir_acme_...';
const BASE = 'https://proxy.tiresias.network';

// Spend summary
const spend = await fetch(`${BASE}/dash/v1/spend?start=2026-04-01&end=2026-04-05`, {
  headers: { 'X-Tiresias-Api-Key': API_KEY },
}).then(r => r.json());

// Request volume
const requests = await fetch(`${BASE}/dash/v1/requests`, {
  headers: { 'X-Tiresias-Api-Key': API_KEY },
}).then(r => r.json());

// Latency percentiles
const latency = await fetch(`${BASE}/dash/v1/latency`, {
  headers: { 'X-Tiresias-Api-Key': API_KEY },
}).then(r => r.json());

// Error rates
const errors = await fetch(`${BASE}/dash/v1/errors`, {
  headers: { 'X-Tiresias-Api-Key': API_KEY },
}).then(r => r.json());

// Top sessions by cost
const topSessions = await fetch(`${BASE}/dash/v1/sessions/top?limit=10`, {
  headers: { 'X-Tiresias-Api-Key': API_KEY },
}).then(r => r.json());

// Provider health
const providers = await fetch(`${BASE}/dash/v1/providers/health`, {
  headers: { 'X-Tiresias-Api-Key': API_KEY },
}).then(r => r.json());

// Unified analytics (LLM + API telemetry)
const unified = await fetch(`${BASE}/v1/analytics/unified?hours=24`, {
  headers: { 'X-Tiresias-Api-Key': API_KEY },
}).then(r => r.json());
```

## API Reference

### Proxy Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/chat/completions` | OpenAI-compatible LLM proxy (audit-logged) |
| POST | `/v1/sessions/{id}/tag` | Tag a session with metadata |
| GET | `/v1/sessions/{id}` | Get session statistics |
| GET | `/v1/admin/providers` | List configured LLM providers |
| POST | `/v1/admin/reload` | Hot-reload provider configuration |

### Dashboard Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dash/v1/spend` | Spend summary (with date range) |
| GET | `/dash/v1/requests` | Request volume per day |
| GET | `/dash/v1/latency` | Latency percentiles (p50/p95/p99) |
| GET | `/dash/v1/errors` | Error rates by provider |
| GET | `/dash/v1/sessions/top` | Top sessions by cost |
| GET | `/dash/v1/sessions/{id}/replay` | Full session replay (decrypted) |
| GET | `/dash/v1/traces` | Trace search with filters |
| GET | `/dash/v1/providers/health` | Provider health status |

### Analytics Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/analytics/api/endpoints` | Per-endpoint metrics |
| GET | `/v1/analytics/api/costs` | Cost by endpoint/service |
| GET | `/v1/analytics/api/errors` | Error breakdown |
| GET | `/v1/analytics/unified` | Combined LLM + API telemetry |

### Authentication

All requests require a Tiresias API key via one of:

```
Authorization: Bearer tir_<slug>_<hex32>
```
or
```
X-Tiresias-Api-Key: tir_<slug>_<hex32>
```

The `X-Tiresias-Api-Key` header is recommended when you need the `Authorization` header for your upstream LLM key.

### OpenAPI Spec

Interactive API documentation is available at:
- **Swagger UI**: `https://proxy.tiresias.network/docs`
- **OpenAPI JSON**: `https://proxy.tiresias.network/openapi.json`

## On-Prem Usage

For Enterprise/on-prem deployments, point to your local proxy:

```typescript
const openai = new OpenAI({
  apiKey: 'sk-your-openai-key',
  baseURL: 'http://localhost:8080/v1', // Local Tiresias proxy
  // No X-Tiresias-Api-Key needed in on-prem mode
});
```

## Requirements

- Node.js 18+ (for native `fetch`) or any HTTP client
- OpenAI SDK v4+ (recommended for LLM calls)

## License

MIT
