# Part V: API Gateway Security

> **Tiresias Administration Guide -- v3.0**
> Classification: Internal / Customer-Facing

---

## Chapter 15: SoulGate -- Gateway Configuration

SoulGate is the API gateway component of the Tiresias platform. It sits in front of all upstream AI services (LLM providers, agent runtimes, internal APIs) and enforces a seven-stage security pipeline on every request: authentication, IP/geo access control, rate limiting, circuit breaking, payload inspection, upstream forwarding, and audit logging.

This chapter covers deployment, upstream management, API key lifecycle, and gateway operational modes.

---

### 15.1 Gateway Architecture Overview

Every request that enters SoulGate passes through a fixed-order pipeline. No stage can be bypassed, and every request -- whether allowed or blocked -- produces an audit log entry.

**Pipeline Stages**

| Stage | Component | Failure Response |
|-------|-----------|------------------|
| 1. Authentication | `token_validator` | `401 Unauthorized` |
| 1b. Tier Validation | `tier_validator` | `402 Payment Required` |
| 2. IP/Geo Access Control | `ip_filter` | `403 Forbidden` |
| 3. Rate Limiting | `ratelimit.engine` | `429 Too Many Requests` |
| 4. Circuit Breaker | `circuit.breaker` | `503 Service Unavailable` |
| 5. Payload Inspection | `prompt_guard`, `scanner` | `400 Bad Request` or `413 Payload Too Large` |
| 6. Upstream Forwarding | `httpx` async client | `502 Bad Gateway` or `504 Gateway Timeout` |
| 7. Audit Logging | `audit.logger` | (fire-and-forget, non-blocking) |

**Authentication Methods (evaluated in order)**

1. `X-API-Key` header -- SoulGate API key (bcrypt-verified, prefix-indexed lookup)
2. `Authorization: Bearer <token>` -- JWT capability token validated via SoulAuth `/v1/auth/evaluate`
3. `X-SoulKey` header -- Raw SoulKey validated via SoulAuth `/v1/auth/identify`

If none of the three headers are present, the request is rejected with `401`.

**Identity Injection**

On successful authentication, SoulGate injects the following headers into the upstream request:

| Header | Source | Description |
|--------|--------|-------------|
| `X-Tenant-ID` | Auth result | UUID of the authenticated tenant |
| `X-SoulKey-ID` | Auth result | UUID of the authenticating SoulKey (if applicable) |
| `X-Persona-ID` | Auth result | Agent persona identifier (if applicable) |
| `X-Forwarded-By` | Static | Always set to `SoulGate/1.0` |

Only safe headers from the original request are forwarded: `content-type`, `accept`, `accept-encoding`, `accept-language`, `user-agent`, `x-request-id`, and `x-correlation-id`. All other client headers are stripped.

**Blocked Response Format**

All block responses use a consistent JSON structure:

```json
{
  "detail": "Human-readable reason",
  "blocked_by": "soulgate"
}
```

The `blocked_by` field allows downstream consumers and SIEM integrations to identify SoulGate as the enforcement point.

---

### 15.2 Deploy and Configure SoulGate

#### 15.2.1 Environment Variables

SoulGate is configured entirely through environment variables with the `SOULGATE_` prefix. The following table lists all settings.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SOULGATE_MODE` | string | `gateway` | Operating mode. Currently supports `gateway` (reverse proxy with full security pipeline). |
| `SOULGATE_HOST` | string | `0.0.0.0` | Listener bind address. |
| `SOULGATE_SERVER_PORT` | int | `8002` | Listener port. |
| `SOULGATE_DEBUG` | bool | `false` | Enable debug mode. Disables metrics endpoint authentication when `true`. |
| `SOULGATE_LOG_LEVEL` | string | `INFO` | Structured log level (`DEBUG`, `INFO`, `WARNING`, `ERROR`). |
| `SOULGATE_DATABASE_URL` | string | `None` | Async database URL. Set to `postgresql+asyncpg://...` for shared Postgres; leave unset for per-tenant SQLite under `SOULGATE_DATA_ROOT`. |
| `SOULGATE_DATA_ROOT` | string | `/data` | Root directory for per-tenant SQLite databases (ignored when `DATABASE_URL` is set). |
| `SOULGATE_DB_POOL_SIZE` | int | `10` | Database connection pool size. |
| `SOULGATE_DB_MAX_OVERFLOW` | int | `20` | Maximum overflow connections above pool size. |
| `SOULGATE_DB_POOL_TIMEOUT` | int | `30` | Seconds to wait for a pool connection before timeout. |
| `SOULGATE_SOULAUTH_BASE_URL` | string | `http://localhost:8000` | Base URL for SoulAuth API (token validation, identity resolution). |
| `SOULGATE_SOULWATCH_BASE_URL` | string | `http://localhost:8001` | Base URL for SoulWatch API (event forwarding). |
| `SOULGATE_DEFAULT_RATE_LIMIT_RPM` | int | `60` | Default requests per minute when no policy matches. |
| `SOULGATE_DEFAULT_BURST_SIZE` | int | `10` | Default burst allowance above the rate limit. |
| `SOULGATE_CIRCUIT_FAILURE_THRESHOLD` | int | `5` | Consecutive failures before a circuit breaker opens. |
| `SOULGATE_CIRCUIT_COOLDOWN_SECONDS` | int | `30` | Seconds to wait in open state before allowing a half-open probe. |
| `SOULGATE_PROXY_TIMEOUT_MS` | int | `30000` | Upstream request timeout in milliseconds. |
| `SOULGATE_MAX_REQUEST_BODY_BYTES` | int | `10485760` | Maximum request body size (10 MB). Requests exceeding this return `413`. |
| `SOULGATE_INTERNAL_API_KEY` | string | `None` | Shared secret for admin endpoints (circuit breaker control, metrics scraping). |
| `SOULGATE_PROMPT_GUARD_ENABLED` | bool | `true` | Enable prompt injection scanning on request bodies. |
| `SOULGATE_AUDIT_BATCH_SIZE` | int | `50` | Number of audit entries batched before DB flush. |
| `SOULGATE_AUDIT_FLUSH_INTERVAL` | int | `5` | Seconds between automatic audit log flushes. |
| `SOULGATE_COT_POLICY_ENABLED` | bool | `false` | Enable chain-of-thought policy enforcement. |
| `SOULGATE_COT_POLICY_DIR` | string | `policies/cot` | Directory containing CoT policy YAML files. |

#### 15.2.2 Deploy with Docker Compose

Add the SoulGate service to your `docker-compose.yml`:

```yaml
soulgate:
  image: tiresias/soulgate:3.0
  ports:
    - "8002:8002"
  environment:
    SOULGATE_DATABASE_URL: "postgresql+asyncpg://user:pass@db:5432/tiresias"
    SOULGATE_SOULAUTH_BASE_URL: "http://soulauth:8000"
    SOULGATE_SOULWATCH_BASE_URL: "http://soulwatch:8001"
    SOULGATE_INTERNAL_API_KEY: "${SOULGATE_INTERNAL_API_KEY}"
    SOULGATE_PROMPT_GUARD_ENABLED: "true"
    SOULGATE_MAX_REQUEST_BODY_BYTES: "10485760"
  depends_on:
    - soulauth
    - soulwatch
    - db
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8002/health"]
    interval: 30s
    timeout: 5s
    retries: 3
```

#### 15.2.3 Deploy on GCP Cloud Run

```bash
gcloud run deploy soulgate \
  --image gcr.io/tiresias-prod/soulgate:3.0 \
  --port 8002 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 1 \
  --set-env-vars "SOULGATE_DATABASE_URL=...,SOULGATE_SOULAUTH_BASE_URL=...,SOULGATE_SOULWATCH_BASE_URL=..." \
  --set-secrets "SOULGATE_INTERNAL_API_KEY=soulgate-internal-key:latest"
```

#### 15.2.4 Validate Deployment

After deployment, verify the health endpoint:

```bash
curl -s http://localhost:8002/health | jq .
```

Expected response:

```json
{
  "status": "healthy",
  "service": "soulgate",
  "version": "1.0.0",
  "mode": "gateway",
  "checks": {
    "database": {"status": "healthy"},
    "soulauth": {"status": "healthy"},
    "soulwatch": {"status": "healthy"},
    "upstreams": {},
    "circuit_breakers": {"total": 0, "open": 0, "open_upstreams": []},
    "audit_queue": {"size": 0, "status": "healthy"}
  }
}
```

The health endpoint checks six components: database connectivity, SoulAuth reachability, SoulWatch reachability, per-upstream health endpoints, circuit breaker summary, and audit queue depth. Overall status is `unhealthy` if any component reports unhealthy.

---

### 15.3 Upstream Service Management

Upstream services are the backend targets that SoulGate proxies requests to (LLM providers, agent APIs, internal services). Each upstream is registered per-tenant and stored in the `_soulgate_upstreams` table.

#### 15.3.1 Register an Upstream

**API Endpoint:** `POST /gate/v1/proxy/` (via upstream registry)

Register upstreams through the database or management API. Each upstream has the following configuration:

**Upstream Configuration Fields**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `tenant_id` | UUID | (required) | Owning tenant. |
| `name` | string | (required) | Unique upstream identifier used in proxy routes. |
| `base_url` | string | (required) | Base URL for the upstream service (e.g., `https://api.openai.com`). |
| `health_endpoint` | string | `/health` | Path to probe for health checks. Set to `null` to disable. |
| `timeout_ms` | int | `30000` | Per-request timeout in milliseconds. |
| `retries` | int | `1` | Number of retry attempts on failure. |
| `strip_prefix` | bool | `true` | Whether to strip the `/gate/v1/proxy/{name}/` prefix before forwarding. |
| `circuit_breaker_enabled` | bool | `true` | Enable circuit breaker protection for this upstream. |
| `status` | string | `active` | Upstream status: `active`, `draining`, or `disabled`. |

**Example: Register an OpenAI upstream**

```python
import httpx

resp = httpx.post("http://soulgate:8002/gate/v1/upstreams", json={
    "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "openai",
    "base_url": "https://api.openai.com",
    "health_endpoint": null,
    "timeout_ms": 60000,
    "circuit_breaker_enabled": true
})
```

#### 15.3.2 Route Requests Through an Upstream

All proxy requests follow the URL pattern:

```
/gate/v1/proxy/{upstream_name}/{path}
```

SoulGate matches `upstream_name` against the in-memory cache of registered upstreams. If no match is found, a `404` is returned. If the upstream status is not `active`, a `503` is returned.

**Supported HTTP Methods:** `GET`, `POST`, `PUT`, `DELETE`, `PATCH`

**Example: Proxy a chat completion request to OpenAI**

```bash
curl -X POST http://soulgate:8002/gate/v1/proxy/openai/v1/chat/completions \
  -H "X-API-Key: sg_a1b2c3d4..." \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4", "messages": [{"role": "user", "content": "Hello"}]}'
```

SoulGate builds the upstream URL by concatenating the upstream's `base_url` with the remaining `path`. In this example, the request is forwarded to `https://api.openai.com/v1/chat/completions`.

#### 15.3.3 Upstream Status Transitions

| Status | Behavior |
|--------|----------|
| `active` | Requests are routed normally through the security pipeline. |
| `draining` | New requests are rejected with `503`. Existing in-flight requests complete. |
| `disabled` | Upstream is removed from the routing cache. Returns `503` if targeted. |

To drain an upstream before maintenance:

```bash
curl -X PUT http://soulgate:8002/gate/v1/upstreams/{upstream_id} \
  -H "Content-Type: application/json" \
  -d '{"status": "draining"}'
```

#### 15.3.4 Connection Pooling

SoulGate maintains a shared `httpx.AsyncClient` with the following connection pool settings:

| Setting | Value | Description |
|---------|-------|-------------|
| Max connections | 100 | Maximum total connections across all upstreams. |
| Max keepalive connections | 20 | Maximum idle connections kept alive. |
| Follow redirects | Disabled | Upstream redirects are returned to the caller as-is. |

The connection pool is created lazily on first request and reused for the lifetime of the process. It is closed gracefully on shutdown.

---

### 15.4 API Key Management

SoulGate issues its own API keys for gateway-level authentication, separate from SoulAuth SoulKeys. API keys use bcrypt hashing and prefix-indexed lookup for secure, efficient validation.

#### 15.4.1 API Key Format

```
sg_<96 hex characters>
```

- Prefix: `sg_` (identifies the key as a SoulGate key)
- Key body: 48 random bytes encoded as 96 hex characters
- Prefix index: First 8 characters used for fast database lookup
- Storage: Only the bcrypt hash is stored; the raw key is displayed once at issuance

#### 15.4.2 Issue an API Key

**Endpoint:** `POST /gate/v1/apikeys`

```bash
curl -X POST http://soulgate:8002/gate/v1/apikeys \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
    "label": "production-agent-key",
    "scopes": ["proxy:read", "proxy:write"],
    "expires_at": "2027-01-01T00:00:00Z",
    "created_by": "admin@company.com"
  }'
```

Response:

```json
{
  "raw_key": "sg_a1b2c3d4e5f6...",
  "key": {
    "id": "key-uuid",
    "tenant_id": "550e8400-...",
    "label": "production-agent-key",
    "key_prefix": "sg_a1b2c",
    "status": "active",
    "scopes": ["proxy:read", "proxy:write"],
    "created_at": "2026-04-02T12:00:00Z"
  }
}
```

> **IMPORTANT:** The `raw_key` field is returned only once. Store it securely immediately. It cannot be retrieved after this response.

**API Key Request Body Fields**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tenant_id` | UUID | Yes | Tenant this key belongs to. |
| `label` | string | Yes | Human-readable label for identification. |
| `scopes` | list[string] | No | Permission scopes granted to this key. |
| `rate_limit_override` | object | No | Custom rate limit for this specific key. |
| `created_by` | string | No | Audit trail: who created this key. |
| `expires_at` | datetime | No | Automatic expiration timestamp. |

#### 15.4.3 Rotate an API Key

Rotation generates new credentials for the same key record. The old key stops working immediately.

**Endpoint:** `POST /gate/v1/apikeys/{key_id}/rotate`

```bash
curl -X POST http://soulgate:8002/gate/v1/apikeys/{key_id}/rotate
```

The response includes the new `raw_key`. The `rotated_at` timestamp is updated on the key record.

#### 15.4.4 Revoke an API Key

**Endpoint:** `DELETE /gate/v1/apikeys/{key_id}`

```bash
curl -X DELETE http://soulgate:8002/gate/v1/apikeys/{key_id}
```

Revocation sets the key status to `revoked` and records the `revoked_at` timestamp. Revoked keys cannot be rotated or reactivated.

#### 15.4.5 List and Filter API Keys

**Endpoint:** `GET /gate/v1/apikeys`

| Query Parameter | Type | Description |
|-----------------|------|-------------|
| `tenant_id` | UUID | Filter by tenant. |
| `status` | string | Filter by status (`active`, `revoked`, `expired`). |

```bash
curl "http://soulgate:8002/gate/v1/apikeys?tenant_id=550e8400-...&status=active"
```

#### 15.4.6 View API Key Statistics

**Endpoint:** `GET /gate/v1/apikeys/stats`

```bash
curl "http://soulgate:8002/gate/v1/apikeys/stats?tenant_id=550e8400-..."
```

Response:

```json
{
  "total": 15,
  "by_status": {
    "active": 12,
    "revoked": 2,
    "expired": 1
  }
}
```

---

### 15.5 Security Headers

SoulGate injects OWASP-recommended security headers on every response through the `SecurityHeadersMiddleware`. These headers are applied after CORS middleware, ensuring pre-flight responses also receive them.

**Injected Headers**

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Force HTTPS for 1 year, eligible for HSTS preload. |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME-type sniffing. |
| `X-Frame-Options` | `DENY` | Block all framing (legacy compatibility). |
| `X-XSS-Protection` | `0` | Explicitly disabled (deprecated header; intentional). |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Strip referrer on cross-origin navigation. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Opt out of powerful browser features. |
| `Content-Security-Policy` | See below | Restrict resource loading. |

**Content Security Policy:**

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
font-src 'self';
connect-src 'self';
frame-ancestors 'none'
```

---

### 15.6 Monitor Gateway Health

#### 15.6.1 Health Check Endpoint

**Endpoint:** `GET /health`

Returns aggregated health status for all gateway components. No authentication required.

**Component Checks:**

| Component | Check Method | Healthy Condition |
|-----------|-------------|-------------------|
| `database` | `SELECT 1` query | Query succeeds. |
| `soulauth` | HTTP GET to `/health` | Returns `200`. |
| `soulwatch` | HTTP GET to `/health` | Returns `200`. |
| `upstreams` | HTTP GET to each upstream's `health_endpoint` | Returns `200`. |
| `circuit_breakers` | In-memory state inspection | No circuits in `open` state. |
| `audit_queue` | In-memory queue depth | Queue size below `audit_batch_size * 10`. |

#### 15.6.2 Prometheus Metrics Endpoint

**Endpoint:** `GET /gate/metrics`

**Authentication:** Requires `X-Internal-Key` header or `Authorization: Bearer` matching `SOULGATE_INTERNAL_API_KEY`. Authentication is disabled when `SOULGATE_DEBUG=true`.

**Available Metrics:**

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `soulgate_requests_total` | Counter | `method`, `upstream`, `status`, `blocked` | Total requests processed. |
| `soulgate_request_duration_seconds` | Histogram | (none) | Request latency distribution. Buckets: 5ms to 10s. |
| `soulgate_blocks_total` | Counter | `reason` | Total blocked requests. Reasons: `auth_failed`, `tier_denied`, `ip_denied`, `rate_limited`, `circuit_open`, `payload_too_large`, `prompt_injection`, `scan_failed`, `upstream_timeout`, `upstream_unreachable`. |
| `soulgate_rate_limit_hits_total` | Counter | (none) | Total rate limit rejections. |
| `soulgate_circuit_state` | Gauge | `upstream` | Circuit breaker state per upstream (0=closed, 1=half_open, 2=open). |
| `soulgate_upstream_health` | Gauge | `upstream` | Upstream health status (1=healthy, 0=unhealthy). |
| `soulgate_active_api_keys` | Gauge | (none) | Number of active API keys. |
| `soulgate_audit_queue_size` | Gauge | (none) | Current audit log queue depth. |

**Example: Scrape with curl**

```bash
curl -H "X-Internal-Key: your-internal-key" http://soulgate:8002/gate/metrics
```

**Example: Prometheus scrape config**

```yaml
scrape_configs:
  - job_name: soulgate
    scrape_interval: 15s
    static_configs:
      - targets: ["soulgate:8002"]
    metrics_path: /gate/metrics
    authorization:
      type: Bearer
      credentials: "your-internal-key"
```

---

### 15.7 Troubleshoot Gateway Errors

| Status Code | Block Reason | Cause | Resolution |
|-------------|-------------|-------|------------|
| `401` | `auth_failed` | No valid credentials or credentials rejected. | Verify the `X-API-Key`, `Authorization`, or `X-SoulKey` header. Check key status and expiration. Confirm SoulAuth is reachable. |
| `402` | `tier_denied` | Tenant subscription tier does not include the requested feature. | Upgrade the tenant subscription or adjust the tier-to-feature mapping. |
| `403` | `ip_denied` | Source IP blocked by deny rule or not in allowlist. | Check access rules for the tenant. Verify client IP and `X-Forwarded-For` headers. |
| `404` | (not a block) | Upstream name not found in registry. | Verify the upstream name in the URL matches a registered upstream. |
| `413` | `payload_too_large` | Request body exceeds `SOULGATE_MAX_REQUEST_BODY_BYTES`. | Reduce payload size or increase the limit. |
| `429` | `rate_limited` | Request exceeded the rate limit policy. | Wait for `Retry-After` seconds. Adjust rate limit policy if legitimate. |
| `400` | `prompt_injection` | Prompt injection pattern detected in request body. | See Chapter 16 for false positive handling. |
| `400` | `scan_failed` | Invalid JSON payload or null bytes detected. | Fix the request payload format. |
| `502` | `upstream_unreachable` | Cannot connect to the upstream service. | Verify upstream `base_url`, network connectivity, and firewall rules. |
| `503` | `circuit_open` | Circuit breaker is open for the target upstream. | Wait for cooldown or manually reset the circuit. See Chapter 17. |
| `503` | (not a block) | Upstream status is `draining` or `disabled`. | Re-enable the upstream or route to an active upstream. |
| `504` | `upstream_timeout` | Upstream did not respond within `timeout_ms`. | Increase timeout or investigate upstream performance. |

**Diagnostic Steps:**

1. Check the audit log for the specific request: query `_soulgate_request_log` by timestamp and source IP.
2. Inspect the `block_reason` and `threat_flags` columns for detailed block information.
3. Check the health endpoint for component status.
4. Review structured logs for entries matching the request timeframe (`structlog` JSON format).

---

## Chapter 16: Prompt Injection Detection

SoulGate includes a built-in prompt injection detection engine that scans every request body for patterns aligned with the OWASP LLM Top 10. The engine uses 48 compiled regex patterns across eight attack categories, a weighted risk scoring model, and configurable thresholds for warn and block decisions.

---

### 16.1 Prompt Injection Threat Model

The detection engine covers the following attack categories, mapped to the OWASP LLM Top 10 taxonomy:

**Attack Category Taxonomy**

| Category ID | Category Name | OWASP Reference | Description | Pattern Count |
|-------------|--------------|-----------------|-------------|---------------|
| `direct_injection` | Direct Injection | LLM01 | Explicit commands to override, ignore, or replace system instructions. | 9 |
| `indirect_injection` | Indirect Injection | LLM01 | Hidden instructions embedded in data that trigger on specific conditions. | 6 |
| `jailbreak` | Jailbreak | LLM01 | Attempts to escape safety constraints through role-play, mode switching, or persona assumption. | 11 |
| `prompt_extraction` | System Prompt Extraction | LLM01 | Attempts to exfiltrate the system prompt or internal instructions. | 5 |
| `context_escape` | Delimiter/Context Escape | LLM01 | Injection of special tokens, XML tags, or markdown to break context boundaries. | 5 |
| `encoding_evasion` | Encoding Evasion | LLM01 | Use of base64, hex, unicode, or HTML entities to bypass text-based filters. | 6 |
| `data_exfiltration` | Data Exfiltration | LLM02/LLM06 | Commands to fetch external resources, send data to external URLs, or extract credentials. | 5 |
| `privilege_escalation` | Privilege Escalation | LLM01 | Requests for elevated access, safety bypass, or restriction removal. | 4 |

**Severity Levels**

| Severity | Weight | Typical Patterns |
|----------|--------|------------------|
| `critical` | 0.40 | Ignore previous instructions, DAN mode, bypass safety, system prompt extraction, special token injection |
| `high` | 0.25 | New instructions, pretend/act-as, reveal instructions, data exfiltration, fetch external URL |
| `medium` | 0.15 | Switch-to-mode, hypothetical scenarios, markdown heading injection, encoding detection |
| `low` | 0.05 | ROT13 references, other low-confidence indicators |

A single `critical` match produces a risk score of 0.40. Two `critical` matches produce 0.80, exceeding the default block threshold (0.70). This means even a single `critical` pattern with `action: block` will trigger a block, because any match with `action == "block"` forces the block decision regardless of score.

---

### 16.2 Built-In Detection Rules

The following table lists all 48 built-in detection rules, grouped by category.

#### Direct Injection (OWASP LLM01)

| Rule Name | Pattern (simplified) | Severity | Action |
|-----------|---------------------|----------|--------|
| `ignore_previous_instructions` | `ignore (all )?previous instructions` | critical | block |
| `ignore_above_instructions` | `ignore (everything\|all\|the) (above\|before)` | critical | block |
| `disregard_instructions` | `disregard (all )?(previous\|prior\|above) (instructions\|rules\|guidelines)` | critical | block |
| `forget_instructions` | `forget (all )?(previous\|prior\|your) (instructions\|training\|rules)` | critical | block |
| `override_instructions` | `override (your\|all\|previous) instructions` | critical | block |
| `new_instructions` | `new instructions?:` | high | block |
| `new_system_prompt` | `(new\|updated\|revised) system prompt` | critical | block |
| `from_now_on` | `from now on ... (you\|your\|ignore\|forget\|disregard)` | high | block |
| `stop_being` | `stop being a/an ... and/to` | high | block |

#### Indirect Injection (OWASP LLM01)

| Rule Name | Pattern (simplified) | Severity | Action |
|-----------|---------------------|----------|--------|
| `when_user_asks` | `when (the )?user asks\|says\|types\|mentions` | high | block |
| `if_asked_about` | `if asked\|prompted\|questioned about` | high | block |
| `hidden_instruction` | `HIDDEN\|INVISIBLE\|SECRET INSTRUCTION\|COMMAND\|DIRECTIVE` | critical | block |
| `ai_instruction_marker` | `[INST\|SYSTEM\|ADMIN\|TOOL_CALL]` | high | block |
| `prompt_injection_marker` | `PROMPT INJECTION\|INJECT PROMPT` | critical | block |
| `embedded_instruction` | `IMPORTANT\|NOTE\|ATTENTION: ignore\|disregard\|override\|forget` | critical | block |

#### Jailbreak (OWASP LLM01)

| Rule Name | Pattern (simplified) | Severity | Action |
|-----------|---------------------|----------|--------|
| `dan_mode` | `DAN\|D.A.N. (mode\|prompt\|jailbreak)?` | critical | block |
| `developer_mode_enable` | `enable\|enter\|activate\|unlock developer\|debug\|admin\|root\|god mode` | critical | block |
| `do_anything_now` | `do\|can anything now` | critical | block |
| `pretend_to_be` | `pretend to be\|you are\|you have\|that you` | high | block |
| `you_are_now` | `you are now a\|an\|free\|unbound\|unrestricted` | critical | block |
| `act_as` | `act\|behave\|function\|operate as a\|an\|if\|though` | high | block |
| `roleplay_as` | `roleplay\|role-play\|role play as` | high | block |
| `assume_role` | `assume the role\|identity\|persona of` | high | block |
| `switch_to_mode` | `switch to ... mode` | medium | flag |
| `no_ethical_guidelines` | `without\|no\|ignore ethical\|moral\|safety guidelines\|constraints\|rules` | critical | block |
| `hypothetical_scenario` | `hypothetically\|imagine a scenario where you\|there` | medium | flag |

#### System Prompt Extraction (OWASP LLM01)

| Rule Name | Pattern (simplified) | Severity | Action |
|-----------|---------------------|----------|--------|
| `system_prompt_extraction` | `show\|reveal\|display\|print\|output (your )?system prompt` | critical | block |
| `reveal_instructions` | `reveal\|show\|display\|print\|tell\|leak\|expose (your\|the) instructions\|rules\|guidelines\|prompt` | high | block |
| `what_are_instructions` | `what are\|were your (original )?instructions\|rules\|directives` | high | block |
| `repeat_above` | `repeat (the )? text\|words\|instructions\|everything above` | high | block |
| `initial_prompt` | `initial\|original\|first\|starting (system )?prompt` | medium | flag |

#### Delimiter/Context Escape (OWASP LLM01)

| Rule Name | Pattern (simplified) | Severity | Action |
|-----------|---------------------|----------|--------|
| `triple_backtick_escape` | ` ```system\|assistant\|user\|end\|tool ` | high | block |
| `xml_tag_injection` | `</?system\|assistant\|user\|prompt\|instruction\|message\|tool_call\|function_call>` | high | block |
| `special_token_injection` | `<\|system\|im_start\|im_end\|endoftext\|pad\|sep\|>` | critical | block |
| `markdown_heading_inject` | `# SYSTEM\|INSTRUCTIONS\|PROMPT\|OVERRIDE` | medium | flag |
| `separator_injection` | `-----\|=====\|***** END\|BEGIN\|SYSTEM\|NEW\|OVERRIDE` | medium | flag |

#### Encoding Evasion (OWASP LLM01)

| Rule Name | Pattern (simplified) | Severity | Action |
|-----------|---------------------|----------|--------|
| `base64_instruction` | `decode\|base64\|atob(` | medium | flag |
| `base64_decode_request` | `base64\|b64 decode\|decrypt\|decipher this\|the following\|:` | high | block |
| `hex_escape_sequence` | `\xNN\xNN\xNN\xNN+` (4+ consecutive hex escapes) | medium | flag |
| `unicode_escape` | `\uNNNN\uNNNN\uNNNN\uNNNN+` (4+ consecutive unicode escapes) | medium | flag |
| `html_entity_sequence` | `&#xNN;\|&#NN;` (4+ consecutive entities) | medium | flag |
| `rot13_reference` | `rot13\|caesar cipher\|decode this` | low | flag |

#### Data Exfiltration (OWASP LLM02/LLM06)

| Rule Name | Pattern (simplified) | Severity | Action |
|-----------|---------------------|----------|--------|
| `fetch_external_url` | `fetch\|curl\|wget\|request\|load\|get\|access (from )?https?://...` | high | block |
| `send_to_url` | `send\|post\|transmit\|forward\|upload\|exfiltrate data\|info\|... to` | high | block |
| `exfil_webhook` | `webhook\|callback url\|endpoint:=` | medium | flag |
| `make_http_request` | `make\|send\|issue a GET\|POST\|PUT\|DELETE\|PATCH\|HTTP request\|call` | medium | flag |
| `api_key_extraction` | `api_key\|password\|secret\|token\|credential:=...` | high | block |

#### Privilege Escalation (OWASP LLM01)

| Rule Name | Pattern (simplified) | Severity | Action |
|-----------|---------------------|----------|--------|
| `sudo_admin` | `sudo\|admin\|root\|superuser access\|privilege\|permission\|rights` | high | block |
| `bypass_safety` | `bypass\|disable\|turn off\|ignore\|circumvent\|skip safety\|security\|filter\|guardrail\|content filter\|moderation` | critical | block |
| `remove_restrictions` | `remove\|lift\|disable\|eliminate (all )?restrictions\|limitations\|constraints\|boundaries\|safeguards` | critical | block |
| `unlock_capabilities` | `unlock\|enable\|activate (all )?hidden\|restricted\|locked\|advanced capabilities\|features\|functions\|abilities` | high | block |

All patterns are compiled with `re.IGNORECASE | re.MULTILINE` flags, making them case-insensitive and capable of matching across multi-line content.

---

### 16.3 Configure Detection Thresholds

The prompt guard uses a composite risk scoring model with two configurable thresholds.

#### 16.3.1 Risk Scoring Model

The risk score is calculated as the sum of severity weights for all matched patterns, capped at 1.0:

```
risk_score = min(1.0, sum(SEVERITY_WEIGHTS[match.severity] for match in matches))
```

**Severity Weights:**

| Severity | Weight |
|----------|--------|
| `low` | 0.05 |
| `medium` | 0.15 |
| `high` | 0.25 |
| `critical` | 0.40 |

**Score Examples:**

| Matches | Score | Decision |
|---------|-------|----------|
| 1 low | 0.05 | allow |
| 2 medium | 0.30 | warn |
| 1 high + 1 medium | 0.40 | warn (but blocked if either has `action: block`) |
| 1 critical | 0.40 | block (due to `action: block` on pattern) |
| 2 critical | 0.80 | block |
| 3 high | 0.75 | block |

#### 16.3.2 Decision Logic

The decision is determined by two factors:

1. **Risk score thresholds:** If the score meets or exceeds the block threshold, the request is blocked. If it meets or exceeds the warn threshold but is below the block threshold, a warning is logged.

2. **Explicit block action:** If any matched pattern has `action == "block"`, the request is blocked regardless of the risk score. This means a single `critical` pattern match (which always has `action: block`) will block the request even though the score (0.40) is below the default block threshold (0.70).

**Default Thresholds:**

| Threshold | Default | Description |
|-----------|---------|-------------|
| `THRESHOLD_WARN` | `0.30` | Minimum risk score for a `warn` decision. |
| `THRESHOLD_BLOCK` | `0.70` | Minimum risk score for a `block` decision. |

#### 16.3.3 Adjust Thresholds

Thresholds are configured in the `prompt_guard.py` module constants. To adjust for your environment:

- **Lower `THRESHOLD_WARN`** (e.g., to `0.15`) to increase visibility of low-confidence matches in logs. This does not block requests -- it only generates warning-level audit entries.
- **Lower `THRESHOLD_BLOCK`** (e.g., to `0.50`) to enforce stricter blocking. Use this in high-security environments where false positives are acceptable.
- **Raise `THRESHOLD_BLOCK`** (e.g., to `0.90`) to reduce false positive blocks. Use this when legitimate prompts frequently trigger medium-severity patterns.

> **Note:** The explicit `action: block` on individual patterns overrides the score threshold. Even with `THRESHOLD_BLOCK=0.90`, a single `critical`/`block` pattern match still blocks the request. To change this behavior, modify pattern actions from `block` to `flag`.

#### 16.3.4 Disable Prompt Guard

To disable prompt injection scanning entirely, set the environment variable:

```
SOULGATE_PROMPT_GUARD_ENABLED=false
```

When disabled, request bodies are not scanned for prompt injection patterns, but other payload inspections (JSON validation, null byte detection, size limits) remain active.

---

### 16.4 Write Custom Prompt Injection Rules

The detection engine accepts custom patterns in addition to the 48 built-in rules. Custom patterns can be passed at scan time or stored in the `_soulgate_threat_patterns` database table.

#### 16.4.1 Custom Pattern Format

Each custom pattern is a tuple of four fields:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique identifier for the pattern. |
| `pattern` | string | Python regex pattern (compiled with `re.IGNORECASE \| re.MULTILINE`). |
| `severity` | string | One of: `low`, `medium`, `high`, `critical`. |
| `action` | string | One of: `block`, `flag`, `sanitize`. |

#### 16.4.2 Add Custom Patterns via API

Custom threat patterns are stored per-tenant in the `_soulgate_threat_patterns` table.

**Database Schema: `_soulgate_threat_patterns`**

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key. |
| `tenant_id` | UUID | Owning tenant. |
| `name` | string(255) | Pattern name. |
| `pattern_type` | string(20) | `regex` or `keyword`. |
| `pattern` | text | Regex pattern or keyword string. |
| `severity` | string(20) | `low`, `medium`, `high`, or `critical`. |
| `action` | string(20) | `block`, `flag`, or `sanitize`. |
| `enabled` | bool | Whether this pattern is active. |
| `created_at` | datetime | Creation timestamp. |

**Example: Detect organization-specific threat patterns**

```python
# Custom patterns for a financial services tenant
custom_patterns = [
    (
        "wire_transfer_instruction",
        r"(?:wire|transfer|send)\s+\$?\d+(?:,\d{3})*(?:\.\d{2})?\s+to\s+(?:account|routing)",
        "critical",
        "block"
    ),
    (
        "internal_system_reference",
        r"(?:access|query|connect\s+to)\s+(?:SWIFT|FedWire|ACH)\s+(?:gateway|system|api)",
        "high",
        "block"
    ),
    (
        "competitor_data_request",
        r"(?:list|provide|show)\s+(?:all\s+)?(?:client|customer|account)\s+(?:data|records|information)\s+(?:for|from)\s+(?:competitor|rival)",
        "high",
        "flag"
    ),
]
```

#### 16.4.3 Pattern Authoring Guidelines

1. **Use non-capturing groups** `(?:...)` instead of capturing groups `(...)` for performance.
2. **Anchor patterns appropriately.** Most injection patterns should match anywhere in the text, so avoid `^` and `$` anchors.
3. **Test patterns against legitimate traffic** before deploying with `action: block`. Start with `action: flag` and monitor the audit log for false positives.
4. **Keep patterns specific.** Overly broad patterns like `r"ignore"` will match legitimate text and cause false positives.
5. **Invalid regex patterns are logged and skipped** -- they do not crash the scanner. Check logs for `prompt_guard.invalid_pattern` entries.

---

### 16.5 Review Blocked Requests

When a request is blocked by the prompt guard, the audit log (`_soulgate_request_log`) records:

| Column | Value |
|--------|-------|
| `blocked` | `true` |
| `block_reason` | `prompt_injection: {pattern_name}` |
| `threat_flags` | JSON array of all matched patterns |

**Threat Flag Structure:**

```json
[
  {
    "pattern_name": "ignore_previous_instructions",
    "severity": "critical",
    "action": "block",
    "matched_text": "ignore all previous instructions",
    "category": "direct_injection"
  }
]
```

The `matched_text` field is truncated to 200 characters to prevent log injection and keep log entries manageable.

**Query blocked requests:**

```sql
SELECT id, source_ip, path, block_reason, threat_flags, created_at
FROM _soulgate_request_log
WHERE blocked = true
  AND block_reason LIKE 'prompt_injection%'
  AND tenant_id = '550e8400-...'
ORDER BY created_at DESC
LIMIT 50;
```

---

### 16.6 Handle False Positives

False positives occur when legitimate prompts trigger detection patterns. Common causes:

| Cause | Example | Solution |
|-------|---------|----------|
| Legitimate role-play instructions in a creative writing application | `"Pretend to be a medieval knight"` triggers `pretend_to_be` | Change the pattern action from `block` to `flag`, or add a tenant-specific allowlist pattern. |
| Security training content | `"Here is an example of prompt injection: ignore previous instructions"` triggers `ignore_previous_instructions` | Use `action: flag` for training environments. |
| Developer documentation | `"The system prompt should include..."` triggers `initial_prompt` | This pattern defaults to `flag` (not `block`), so no action needed unless threshold is lowered. |

**Mitigation Strategies:**

1. **Demote pattern action.** Change high-false-positive patterns from `block` to `flag` for specific tenants using custom pattern overrides.

2. **Raise the block threshold.** Increase `THRESHOLD_BLOCK` so that single medium-severity matches do not trigger blocks.

3. **Use scan-and-score in warn mode.** The `scan_and_score()` function returns the full result including all matches and the risk score. Log the result without blocking, review matches in the audit log, and then selectively enable blocking for confirmed patterns.

4. **Review flagged requests.** Query the audit log for requests with `threat_flags IS NOT NULL AND blocked = false` to see matches that were flagged but not blocked:

   ```sql
   SELECT id, source_ip, path, threat_flags, created_at
   FROM _soulgate_request_log
   WHERE threat_flags IS NOT NULL
     AND blocked = false
     AND tenant_id = '550e8400-...'
   ORDER BY created_at DESC;
   ```

---

### 16.7 Monitor Detection Efficacy

Track prompt injection detection performance using the following metrics and queries.

**Prometheus Metrics:**

| Metric | What It Tells You |
|--------|-------------------|
| `soulgate_blocks_total{reason="prompt_injection"}` | Total requests blocked by prompt injection. |
| `soulgate_requests_total{blocked="true"}` | Total blocked requests across all reasons. |

**Detection Rate Query:**

```sql
SELECT
  DATE_TRUNC('day', created_at) AS day,
  COUNT(*) FILTER (WHERE block_reason LIKE 'prompt_injection%') AS injection_blocks,
  COUNT(*) FILTER (WHERE threat_flags IS NOT NULL AND blocked = false) AS injection_warns,
  COUNT(*) AS total_requests
FROM _soulgate_request_log
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY day
ORDER BY day;
```

**Top Triggered Patterns:**

```sql
SELECT
  elem->>'pattern_name' AS pattern,
  elem->>'category' AS category,
  elem->>'severity' AS severity,
  COUNT(*) AS hit_count
FROM _soulgate_request_log,
  LATERAL jsonb_array_elements(threat_flags::jsonb) AS elem
WHERE threat_flags IS NOT NULL
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY pattern, category, severity
ORDER BY hit_count DESC
LIMIT 20;
```

**Coverage Gap Analysis:**

Compare the categories of your custom patterns against the eight built-in categories. If your environment uses custom protocols or non-English prompts, consider adding patterns for:

- Non-English injection attempts (translated versions of "ignore previous instructions")
- Organization-specific command syntax
- Custom tool-call formats specific to your agent framework

---

## Chapter 17: Traffic Management

This chapter covers rate limiting, circuit breakers with anti-weaponization safeguards, IP and geographic access control, and request size enforcement.

---

### 17.1 Rate Limiting Policies

SoulGate enforces rate limits using a sliding window algorithm with burst allowance. Policies are stored in the database and loaded into memory at startup and on policy changes.

#### 17.1.1 Sliding Window Algorithm

The rate limiter uses a 60-second sliding window. Each request timestamp is stored in memory. On each new request:

1. Timestamps older than 60 seconds are pruned.
2. The current count is compared against `requests_per_minute + burst_size`.
3. If the count exceeds the effective limit, the request is rejected with `429` and a `Retry-After` header.
4. If allowed, the current timestamp is appended.

**Effective Limit Formula:**

```
effective_limit = requests_per_minute + burst_size
```

The `burst_size` provides headroom for short spikes above the sustained rate. For example, with `requests_per_minute=60` and `burst_size=10`, the effective limit is 70 requests per 60-second window. This allows a burst of 70 requests in rapid succession, but the sustained rate over time cannot exceed 60 RPM.

#### 17.1.2 Rate Limit Policy Configuration

Policies are stored in the `_soulgate_rate_limits` table.

**Database Schema: `_soulgate_rate_limits`**

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | UUID | auto | Primary key. |
| `tenant_id` | UUID | (required) | Owning tenant. |
| `soulkey_id` | UUID | null | Restrict to a specific agent. If null, applies to all agents in the tenant. |
| `persona_id` | string | null | Restrict to a specific persona. |
| `endpoint_pattern` | string | `*` | Glob pattern for endpoint matching (e.g., `/v1/chat/*`). |
| `requests_per_minute` | int | 60 | Sustained request rate. |
| `burst_size` | int | 10 | Additional burst allowance above RPM. |
| `window_type` | string | `sliding` | Window algorithm type. Currently `sliding` is supported. |
| `enabled` | bool | true | Whether this policy is active. |

#### 17.1.3 Policy Specificity and Matching

When multiple policies match a request, the most specific policy wins. Specificity is scored as follows:

| Match Dimension | Specificity Points |
|-----------------|-------------------|
| Tenant match (required) | +1 |
| SoulKey match | +2 |
| Endpoint pattern match (non-wildcard) | +1 |

**Example: Policy priority resolution**

Given these policies for tenant T1:

| Policy | SoulKey | Endpoint | RPM | Specificity |
|--------|---------|----------|-----|-------------|
| A | (any) | `*` | 60 | 1 |
| B | (any) | `/v1/chat/*` | 30 | 2 |
| C | SK-123 | `*` | 120 | 3 |
| D | SK-123 | `/v1/chat/*` | 50 | 4 |

A request from SoulKey SK-123 to `/v1/chat/completions` matches Policy D (specificity 4). A request from SoulKey SK-456 to `/v1/chat/completions` matches Policy B (specificity 2).

When no policy matches, the global defaults apply:

| Setting | Default |
|---------|---------|
| `SOULGATE_DEFAULT_RATE_LIMIT_RPM` | 60 |
| `SOULGATE_DEFAULT_BURST_SIZE` | 10 |

#### 17.1.4 Create a Rate Limit Policy

**Endpoint:** `POST /gate/v1/ratelimits`

```bash
curl -X POST http://soulgate:8002/gate/v1/ratelimits \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
    "soulkey_id": null,
    "endpoint_pattern": "/v1/chat/*",
    "requests_per_minute": 30,
    "burst_size": 5,
    "window_type": "sliding",
    "enabled": true
  }'
```

The engine automatically reloads policies from the database after any create, update, or delete operation.

#### 17.1.5 Update a Rate Limit Policy

**Endpoint:** `PUT /gate/v1/ratelimits/{policy_id}`

```bash
curl -X PUT http://soulgate:8002/gate/v1/ratelimits/{policy_id} \
  -H "Content-Type: application/json" \
  -d '{
    "requests_per_minute": 120,
    "burst_size": 20
  }'
```

Only the fields provided in the request body are updated; other fields retain their current values.

#### 17.1.6 Delete a Rate Limit Policy

**Endpoint:** `DELETE /gate/v1/ratelimits/{policy_id}`

```bash
curl -X DELETE http://soulgate:8002/gate/v1/ratelimits/{policy_id}
```

After deletion, requests that previously matched this policy will fall through to a less-specific policy or the global defaults.

#### 17.1.7 List Rate Limit Policies

**Endpoint:** `GET /gate/v1/ratelimits`

| Query Parameter | Type | Description |
|-----------------|------|-------------|
| `tenant_id` | UUID | Filter by tenant. |

```bash
curl "http://soulgate:8002/gate/v1/ratelimits?tenant_id=550e8400-..."
```

#### 17.1.8 Rate Limit Response Headers

When a request is rate-limited, the response includes:

| Header | Value | Description |
|--------|-------|-------------|
| `Retry-After` | integer (seconds) | Time to wait before the next request will be accepted. Calculated from the oldest timestamp in the current window. |

```json
{
  "detail": "Rate limit exceeded",
  "retry_after": 12
}
```

---

### 17.2 Circuit Breaker Model

SoulGate implements a three-state circuit breaker per upstream to prevent cascading failures when an upstream service is degraded or unavailable.

#### 17.2.1 State Machine

```
                    failure_threshold
                    reached (with
         +---------  anti-weaponization  --------+
         |           checks passing)             |
         v                                       |
    +----------+     cooldown        +----------+
    |   Open   |  -- elapsed -->     | Half-Open|
    +----------+                     +----------+
         ^                               |
         |      probe failed             |
         +-------------------------------+
         |                               |
         |      probe succeeded          |
         |                               v
         |                          +----------+
         +--------------------------| Closed   |<---(initial state)
              manual trip           +----------+
```

**State Descriptions**

| State | Behavior |
|-------|----------|
| **Closed** | Normal operation. Requests flow to the upstream. Failures are counted. |
| **Open** | All requests are rejected with `503 Service Unavailable`. A cooldown timer starts. |
| **Half-Open** | After the cooldown elapses, one probe request is allowed through. If it succeeds, the circuit closes. If it fails, the circuit reopens. |

#### 17.2.2 Configuration

| Parameter | Default | Environment Variable | Description |
|-----------|---------|---------------------|-------------|
| `failure_threshold` | 5 | `SOULGATE_CIRCUIT_FAILURE_THRESHOLD` | Consecutive failures required to open the circuit. |
| `cooldown_seconds` | 30 | `SOULGATE_CIRCUIT_COOLDOWN_SECONDS` | Duration of the open state before allowing a half-open probe. |
| `min_request_threshold` | 20 | (code constant) | Minimum total requests before the circuit can open. See Section 17.3.1. |
| `max_source_failure_ratio` | 0.60 | (code constant) | Maximum fraction of failures attributable to a single source. See Section 17.3.2. |

#### 17.2.3 Failure Recording

The circuit breaker counts a failure for:

- Upstream HTTP responses with status `>= 500` (server errors)
- `httpx.TimeoutException` (upstream did not respond within `timeout_ms`)
- `httpx.ConnectError` (upstream is unreachable)

Upstream responses with status `200-499` are recorded as successes. This means client errors (4xx) from the upstream do not contribute to circuit opening -- only server errors and connectivity failures do.

---

### 17.3 Anti-Weaponization Safeguards

Traditional circuit breakers are vulnerable to weaponization: an attacker can deliberately cause failures to trip the circuit and deny service to all legitimate users. SoulGate includes three safeguards to prevent this.

#### 17.3.1 Minimum Request Threshold

The circuit will not open until at least `min_request_threshold` (default: 20) total requests have been recorded. This prevents low-volume tripping where an attacker sends a small number of deliberately failing requests to open the circuit.

**Scenario Without Protection:**

1. Attacker sends 5 requests with malformed headers that cause upstream 500 errors.
2. Circuit opens after 5 failures (default `failure_threshold`).
3. All legitimate users are denied service for `cooldown_seconds`.

**Scenario With Protection:**

1. Attacker sends 5 failing requests.
2. Failure threshold (5) is reached, but total requests (5) are below `min_request_threshold` (20).
3. Circuit stays closed. Legitimate traffic continues.
4. Only after 20+ total requests with 5+ failures does the circuit consider opening.

The following log entry indicates a deferred open:

```json
{
  "event": "circuit.open_deferred",
  "upstream": "openai",
  "reason": "below_min_request_threshold",
  "total_requests": 5,
  "min_required": 20
}
```

#### 17.3.2 Per-Source Failure Tracking

Failures are tracked per source (identified by IP address or SoulKey). If a single source is responsible for more than `max_source_failure_ratio` (default: 60%) of all failures, the circuit will not open.

**Scenario Without Protection:**

1. Attacker from IP 192.168.1.100 sends 5 requests that all return 500.
2. 100 legitimate users each send 1 successful request.
3. Failure count reaches 5 (threshold) with 105 total requests.
4. Circuit opens, affecting all 100 legitimate users.

**Scenario With Protection:**

1. Same attack: 5 failures from one IP.
2. Source ratio: 5/5 = 1.00, which exceeds `max_source_failure_ratio` (0.60).
3. Circuit stays closed. The attacker's failures are isolated.

The following log entry indicates a blocked open:

```json
{
  "event": "circuit.open_blocked",
  "upstream": "openai",
  "reason": "single_source_dominance",
  "dominant_source": "192.168.1.100",
  "source_ratio": 1.0,
  "threshold": 0.6
}
```

> **Recommendation:** When you see `circuit.open_blocked` entries, investigate the dominant source. This may indicate an attack or a misconfigured agent. Consider adding the source to an IP deny rule (see Section 17.5).

#### 17.3.3 Admin Lock

The admin lock prevents all automatic state transitions. When a circuit is locked:

- If closed: It stays closed regardless of failure count.
- If open: It stays open regardless of cooldown expiration. No half-open probes are allowed.
- If half-open: Probe results (success or failure) do not trigger transitions.

Use the admin lock during active incident response to prevent the circuit from closing prematurely while the upstream is still under attack.

---

### 17.4 Circuit Breaker Operations

#### 17.4.1 View Circuit Breaker States

**Endpoint:** `GET /gate/v1/circuits`

```bash
curl http://soulgate:8002/gate/v1/circuits
```

Response:

```json
{
  "circuits": [
    {
      "upstream_id": "upstream-uuid",
      "state": "closed",
      "failure_count": 2,
      "success_count": 150,
      "total_requests": 152,
      "failure_threshold": 5,
      "cooldown_seconds": 30,
      "min_request_threshold": 20,
      "admin_locked": false
    }
  ],
  "total": 1
}
```

**Endpoint:** `GET /gate/v1/circuits/{upstream_id}`

Returns the circuit breaker state for a single upstream.

#### 17.4.2 Manually Trip a Circuit

Force-open a circuit to immediately block all traffic to an upstream. This also sets the admin lock, preventing automatic transitions.

**Endpoint:** `POST /gate/v1/circuits/{upstream_id}/trip`

```bash
curl -X POST http://soulgate:8002/gate/v1/circuits/{upstream_id}/trip \
  -H "X-Internal-Key: your-internal-key"
```

> **Authentication:** All circuit breaker control operations require the `X-Internal-Key` header matching `SOULGATE_INTERNAL_API_KEY`.

#### 17.4.3 Manually Reset a Circuit

Force-close a circuit and clear all counters. This also removes the admin lock.

**Endpoint:** `POST /gate/v1/circuits/{upstream_id}/reset`

```bash
curl -X POST http://soulgate:8002/gate/v1/circuits/{upstream_id}/reset \
  -H "X-Internal-Key: your-internal-key"
```

#### 17.4.4 Lock a Circuit

Lock the circuit in its current state, preventing all automatic transitions.

**Endpoint:** `POST /gate/v1/circuits/{upstream_id}/lock`

```bash
curl -X POST http://soulgate:8002/gate/v1/circuits/{upstream_id}/lock \
  -H "X-Internal-Key: your-internal-key"
```

#### 17.4.5 Unlock a Circuit

Remove the admin lock, allowing automatic state transitions to resume.

**Endpoint:** `POST /gate/v1/circuits/{upstream_id}/unlock`

```bash
curl -X POST http://soulgate:8002/gate/v1/circuits/{upstream_id}/unlock \
  -H "X-Internal-Key: your-internal-key"
```

#### 17.4.6 Prometheus Monitoring

The `soulgate_circuit_state` gauge reports circuit states for alerting:

```
soulgate_circuit_state{upstream="openai"} 0   # closed
soulgate_circuit_state{upstream="openai"} 1   # half_open
soulgate_circuit_state{upstream="openai"} 2   # open
```

**Recommended Alertmanager Rule:**

```yaml
groups:
  - name: soulgate_circuits
    rules:
      - alert: CircuitBreakerOpen
        expr: soulgate_circuit_state == 2
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: "Circuit breaker open for upstream {{ $labels.upstream }}"
          description: "The circuit breaker has been open for more than 1 minute."

      - alert: CircuitBreakerOpenExtended
        expr: soulgate_circuit_state == 2
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Extended circuit open for upstream {{ $labels.upstream }}"
          description: "The circuit breaker has been open for 5+ minutes. Manual investigation required."
```

---

### 17.5 IP and Geographic Access Control

SoulGate enforces IP and geographic access rules per tenant. Rules are stored in the `_soulgate_access_rules` table and evaluated on every request at pipeline stage 2, after authentication but before rate limiting.

#### 17.5.1 Rule Types

| Rule Type | Value Format | Description |
|-----------|-------------|-------------|
| `ip_allow` | CIDR or single IP | Only IPs matching an allow rule are permitted. If any `ip_allow` rules exist, all non-matching IPs are denied. |
| `ip_deny` | CIDR or single IP | Matching IPs are explicitly denied. Deny rules are evaluated before allow rules. |
| `geo_allow` | ISO 3166-1 alpha-2 code | Only listed countries are permitted. If any `geo_allow` rules exist, unlisted countries are denied. |
| `geo_deny` | ISO 3166-1 alpha-2 code | Listed countries are explicitly denied. |

**CIDR Format Examples:**

| Value | Matches |
|-------|---------|
| `192.168.1.0/24` | All IPs in the 192.168.1.0 - 192.168.1.255 range. |
| `10.0.0.5` | Single IP 10.0.0.5 (equivalent to `10.0.0.5/32`). |
| `2001:db8::/32` | IPv6 range. |

#### 17.5.2 Rule Evaluation Order

Rules are evaluated in strict priority order (lowest priority number first). Within the same priority level, deny rules take precedence over allow rules.

**Evaluation Logic:**

1. **IP deny rules**: If any `ip_deny` rule matches the source IP, the request is blocked.
2. **IP allow rules**: If any `ip_allow` rules exist for the tenant and the source IP does not match any of them, the request is blocked.
3. **Geo deny rules**: If the source IP resolves to a denied country, the request is blocked.
4. **Geo allow rules**: If `geo_allow` rules exist and the source IP does not resolve to an allowed country, the request is blocked.

If no rules are configured for a tenant, all IPs are allowed.

> **Note on geo resolution:** SoulGate currently uses a placeholder GeoIP implementation. Private, loopback, and reserved IP addresses skip geo checks entirely. For production geo-blocking, integrate MaxMind GeoLite2 or your cloud provider's IP metadata service into `src/access/geo.py`.

#### 17.5.3 Create an Access Rule

**Endpoint:** `POST /gate/v1/access`

**Block a specific IP:**

```bash
curl -X POST http://soulgate:8002/gate/v1/access \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
    "rule_type": "ip_deny",
    "value": "203.0.113.50",
    "priority": 10,
    "enabled": true,
    "created_by": "admin@company.com"
  }'
```

**Allow only a corporate CIDR range:**

```bash
curl -X POST http://soulgate:8002/gate/v1/access \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
    "rule_type": "ip_allow",
    "value": "10.0.0.0/8",
    "priority": 100,
    "enabled": true,
    "created_by": "admin@company.com"
  }'
```

**Block traffic from a country:**

```bash
curl -X POST http://soulgate:8002/gate/v1/access \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
    "rule_type": "geo_deny",
    "value": "KP",
    "priority": 50,
    "enabled": true,
    "created_by": "admin@company.com"
  }'
```

**Access Rule Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tenant_id` | UUID | Yes | Owning tenant. |
| `rule_type` | string | Yes | One of: `ip_allow`, `ip_deny`, `geo_allow`, `geo_deny`. |
| `value` | string | Yes | IP/CIDR or ISO 3166-1 alpha-2 country code. |
| `priority` | int | No | Evaluation order (lower = higher priority). Default: 100. |
| `enabled` | bool | No | Whether this rule is active. Default: true. |
| `created_by` | string | No | Audit trail: who created this rule. |

#### 17.5.4 Update an Access Rule

**Endpoint:** `PUT /gate/v1/access/{rule_id}`

```bash
curl -X PUT http://soulgate:8002/gate/v1/access/{rule_id} \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
    "rule_type": "ip_deny",
    "value": "203.0.113.0/24",
    "priority": 10,
    "enabled": true
  }'
```

#### 17.5.5 Delete an Access Rule

**Endpoint:** `DELETE /gate/v1/access/{rule_id}`

```bash
curl -X DELETE http://soulgate:8002/gate/v1/access/{rule_id}
```

#### 17.5.6 List Access Rules

**Endpoint:** `GET /gate/v1/access`

| Query Parameter | Type | Description |
|-----------------|------|-------------|
| `tenant_id` | UUID | Filter by tenant. |
| `rule_type` | string | Filter by rule type (`ip_allow`, `ip_deny`, `geo_allow`, `geo_deny`). |

```bash
curl "http://soulgate:8002/gate/v1/access?tenant_id=550e8400-...&rule_type=ip_deny"
```

Rules are returned sorted by priority (ascending).

#### 17.5.7 Source IP Resolution

SoulGate extracts the client IP from the request using the following precedence:

1. `X-Forwarded-For` header (first IP in the comma-separated list)
2. `request.client.host` (direct connection IP)
3. `"unknown"` (fallback if neither is available)

> **IMPORTANT:** When deploying behind a reverse proxy (e.g., Cloud Run, nginx, load balancer), ensure the proxy correctly sets the `X-Forwarded-For` header. If the header is spoofable, IP access rules can be bypassed. Use trusted proxy configuration to validate the header chain.

---

### 17.6 Request Size Limits

SoulGate enforces a maximum request body size to prevent resource exhaustion attacks.

#### 17.6.1 Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SOULGATE_MAX_REQUEST_BODY_BYTES` | `10485760` (10 MB) | Maximum request body size. Requests exceeding this are rejected with `413 Payload Too Large`. |

The size check occurs at pipeline stage 5, after authentication, access control, rate limiting, and circuit breaker checks have passed. This ordering ensures that unauthenticated or unauthorized requests are rejected before the body is read, saving resources.

#### 17.6.2 Payload Validation

In addition to size limits, the request scanner (`inspection/scanner.py`) performs two validation checks on request bodies with the methods `POST`, `PUT`, and `PATCH`:

| Check | Rejection | Reason |
|-------|-----------|--------|
| JSON validation | `400 Bad Request` | If the body appears to be JSON (starts with `{` or `[`) but fails `json.loads()` parsing. Malformed JSON can cause upstream parser crashes or partial-parse injection attacks. |
| Null byte detection | `400 Bad Request` | If the body contains `\x00` bytes. Null bytes indicate binary injection, polyglot attacks, or attempts to truncate strings in C-backed libraries. |

Bodies with `GET`, `HEAD`, `OPTIONS`, and `DELETE` methods are not scanned.

#### 17.6.3 Adjust Size Limits

For tenants that process large documents or images through LLM APIs, increase the limit:

```
SOULGATE_MAX_REQUEST_BODY_BYTES=52428800  # 50 MB
```

For security-sensitive environments where prompts should be small, reduce the limit:

```
SOULGATE_MAX_REQUEST_BODY_BYTES=1048576  # 1 MB
```

---

### 17.7 Troubleshoot Traffic Management Issues

#### 17.7.1 False Circuit Opens

**Symptom:** Circuit breaker opens unexpectedly, blocking legitimate traffic.

**Diagnostic Steps:**

1. Check circuit state: `GET /gate/v1/circuits/{upstream_id}`
2. Review the `failure_count` and `total_requests` fields.
3. If `total_requests` is low relative to `failure_count`, the failures may be from a single source. Check logs for `circuit.open_blocked` entries.
4. Verify the upstream health endpoint returns `200`. A failing health check counts as a failure.
5. Check if the upstream `timeout_ms` is too low for the actual response time.

**Resolution:**

- Increase `SOULGATE_CIRCUIT_FAILURE_THRESHOLD` if the upstream occasionally returns 5xx errors under normal load.
- Increase the upstream `timeout_ms` if timeouts are the primary failure source.
- Lock the circuit in closed state during known maintenance: `POST /gate/v1/circuits/{id}/lock`

#### 17.7.2 Rate Limit Misconfiguration

**Symptom:** Legitimate agents are rate-limited unexpectedly.

**Diagnostic Steps:**

1. List all rate limit policies for the tenant: `GET /gate/v1/ratelimits?tenant_id=...`
2. Check if multiple policies overlap on the same endpoint pattern.
3. Verify which policy wins using the specificity scoring rules in Section 17.1.3.
4. Check the Prometheus metric `soulgate_rate_limit_hits_total` for the rate of rejections.

**Resolution:**

- If the wrong policy is winning, adjust the `soulkey_id` or `endpoint_pattern` fields to change specificity.
- Increase `requests_per_minute` or `burst_size` for the matching policy.
- If the agent has legitimate burst patterns, increase `burst_size` to accommodate the spike duration.

#### 17.7.3 IP Access Rule Conflicts

**Symptom:** Requests are unexpectedly blocked or allowed despite configured rules.

**Diagnostic Steps:**

1. List all access rules for the tenant: `GET /gate/v1/access?tenant_id=...`
2. Confirm the `enabled` flag is `true` for the relevant rules.
3. Check rule priorities -- lower numbers are evaluated first.
4. If using `ip_allow` rules, remember that any `ip_allow` rule for a tenant makes the allowlist mandatory: only explicitly allowed IPs will pass.
5. Verify the source IP being evaluated. If behind a proxy, check `X-Forwarded-For`.

**Resolution:**

- To allow a new IP without removing the allowlist, add a new `ip_allow` rule.
- To temporarily disable access control, set `enabled=false` on all rules for the tenant.
- Check the audit log for `block_reason: ip_denied` entries to confirm which rule triggered the block.
