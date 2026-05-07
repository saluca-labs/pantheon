# Tiresias App Proxy -- Configuration Reference

All settings are managed via Pydantic BaseSettings. Every field can be set through an environment variable with the `APP_PROXY_` prefix. The prefix is case-insensitive.

## Loading Order

Settings are resolved in this order (last wins):

1. Field defaults in `config.py`
2. `.env` file in the working directory (UTF-8 encoded)
3. Environment variables

## .env File Support

Place a `.env` file in the App Proxy's working directory:

```env
APP_PROXY_PROXY_PORT=9090
APP_PROXY_DATABASE_URL=sqlite+aiosqlite:///data/app_proxy.db
APP_PROXY_API_KEY_HASH=a1b2c3d4e5f6...
APP_PROXY_ADMIN_KEY=supersecret
APP_PROXY_POLICY_ENFORCEMENT_MODE=strict
```

The file is loaded automatically at startup. Lines starting with `#` are treated as comments.

## Docker Environment Variables

Pass settings via `-e` flags or a mounted `.env` file:

```bash
docker run -d \
  --name app-proxy \
  -p 8081:8081 \
  -e APP_PROXY_PROXY_PORT=8081 \
  -e APP_PROXY_DATABASE_URL="sqlite+aiosqlite:///data/app_proxy.db" \
  -e APP_PROXY_API_KEY_HASH="$(echo -n 'your-api-key' | sha256sum | cut -d' ' -f1)" \
  -e APP_PROXY_ADMIN_KEY="your-admin-key" \
  -e APP_PROXY_POLICY_ENFORCEMENT_MODE=strict \
  -e APP_PROXY_RETENTION_DAYS=90 \
  -v $(pwd)/plugins:/app/plugins \
  -v $(pwd)/policies:/app/policies/cedar \
  tiresias/app-proxy
```

Or mount the `.env` file:

```bash
docker run -d \
  --name app-proxy \
  -p 8081:8081 \
  --env-file .env \
  -v $(pwd)/plugins:/app/plugins \
  -v $(pwd)/policies:/app/policies/cedar \
  tiresias/app-proxy
```

---

## Settings Reference

### Core

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `APP_PROXY_TENANT_ID` | UUID | Auto-generated (UUIDv4) | Unique tenant identifier for multi-tenant isolation. Set this explicitly in production to ensure consistency across restarts. |

**Example:**

```env
APP_PROXY_TENANT_ID=550e8400-e29b-41d4-a716-446655440000
```

---

### Network

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `APP_PROXY_PROXY_PORT` | int | `8081` | Port the App Proxy HTTP server listens on. |

**Example:**

```env
APP_PROXY_PROXY_PORT=9090
```

---

### Storage

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `APP_PROXY_DATABASE_URL` | string | `sqlite+aiosqlite:///app_proxy.db` | Async SQLAlchemy database URL. Supports SQLite (via aiosqlite) and PostgreSQL (via asyncpg). |

**Examples:**

```env
# SQLite (default, suitable for single-node deployments)
APP_PROXY_DATABASE_URL=sqlite+aiosqlite:///data/app_proxy.db

# PostgreSQL (recommended for production multi-node)
APP_PROXY_DATABASE_URL=postgresql+asyncpg://user:pass@db.internal:5432/app_proxy
```

---

### Paths

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `APP_PROXY_PLUGINS_DIR` | path | `plugins` | Directory containing MCP plugin manifest files. Each subdirectory or JSON file defines a plugin with its transport config and tool list. |
| `APP_PROXY_POLICIES_DIR` | path | `policies/cedar` | Directory containing `.cedar` policy files. All files are loaded recursively. |
| `APP_PROXY_CEDAR_SCHEMA_PATH` | path | `src/app_proxy/policy/schema.json` | Path to the Cedar schema definition file. Defines entity types, actions, and context shape for policy validation. |

**Examples:**

```env
APP_PROXY_PLUGINS_DIR=/etc/app-proxy/plugins
APP_PROXY_POLICIES_DIR=/etc/app-proxy/policies
APP_PROXY_CEDAR_SCHEMA_PATH=/etc/app-proxy/cedar-schema.json
```

---

### Timeouts

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `APP_PROXY_MCP_SERVER_TIMEOUT_SECONDS` | int | `30` | Maximum seconds to wait for an MCP plugin to respond before the call is treated as timed out. Increase for slow plugins (e.g., long-running data queries). |

**Example:**

```env
APP_PROXY_MCP_SERVER_TIMEOUT_SECONDS=60
```

---

### Policy

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `APP_PROXY_POLICY_ENFORCEMENT_MODE` | `"strict"` or `"advisory"` | `"strict"` | Controls how policy decisions are applied. **strict**: denied actions return HTTP errors and are blocked. **advisory**: denied actions are logged but permitted to execute. Use `advisory` during initial rollout to observe policy behavior without blocking agents. |

**Example:**

```env
# Production
APP_PROXY_POLICY_ENFORCEMENT_MODE=strict

# Policy tuning / dry-run
APP_PROXY_POLICY_ENFORCEMENT_MODE=advisory
```

---

### Auth

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `APP_PROXY_API_KEY_HASH` | string (hex) | `null` | SHA-256 hash of the API bearer token, hex-encoded. When unset, API key authentication is disabled (dev mode -- all requests pass through). Used by Tools and Schedules endpoints. |
| `APP_PROXY_ADMIN_KEY` | string | `null` | Admin key for privileged operations (Admin, Approval approve/deny/list endpoints). Compared via constant-time comparison. When unset, admin auth is disabled (dev mode). |

**Generating an API key hash:**

```bash
# Generate a random key
API_KEY=$(openssl rand -hex 32)
echo "Your API key: $API_KEY"

# Compute the SHA-256 hash for configuration
echo -n "$API_KEY" | sha256sum | cut -d' ' -f1
```

**Examples:**

```env
# SHA-256 of the bearer token
APP_PROXY_API_KEY_HASH=9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08

# Admin key (stored as plaintext in config, compared with constant-time)
APP_PROXY_ADMIN_KEY=your-admin-secret-key
```

**Security notes:**

- The `api_key_hash` stores only the hash, never the raw key. Callers send the raw key in the `Authorization: Bearer <key>` header; the proxy hashes it and compares.
- The `admin_key` is compared directly from the `X-Admin-Key` header using `hmac.compare_digest` (constant-time).
- In production, always set both values. Leaving them unset disables authentication entirely.

---

### Retention

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `APP_PROXY_RETENTION_DAYS` | int | `30` | Number of days to retain audit log records. Records older than this are eligible for deletion by the retention sweeper. Compliance frameworks may require longer retention (SOC2 typically requires 1 year). |

**Example:**

```env
APP_PROXY_RETENTION_DAYS=365
```

---

### Approval Queue

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `APP_PROXY_ENABLE_APPROVAL_QUEUE` | bool | `true` | Whether high-risk actions (flagged by Cedar policy `needs_approval`) require human approval before execution. When `false`, actions that would require approval are denied outright. |
| `APP_PROXY_APPROVAL_TIMEOUT_MINUTES` | int | `30` | Minutes before a pending approval auto-denies. Set based on your operations team's response SLA. |
| `APP_PROXY_APPROVAL_NOTIFY_URL` | string (URL) | `null` | Webhook URL for approval notifications. The proxy sends a POST request with the approval details when a new approval is queued, approved, denied, or expired. |
| `APP_PROXY_APPROVAL_SWEEPER_INTERVAL_SECONDS` | int | `300` | Seconds between approval sweeper runs. The sweeper expires pending approvals that have exceeded `approval_timeout_minutes`. Lower values detect expirations faster but increase background load. |

**Examples:**

```env
APP_PROXY_ENABLE_APPROVAL_QUEUE=true
APP_PROXY_APPROVAL_TIMEOUT_MINUTES=15
APP_PROXY_APPROVAL_NOTIFY_URL=https://hooks.slack.com/services/T00/B00/xxxx
APP_PROXY_APPROVAL_SWEEPER_INTERVAL_SECONDS=60
```

---

## Production Checklist

| Setting | Action |
|---------|--------|
| `APP_PROXY_TENANT_ID` | Set to a fixed UUID for your tenant |
| `APP_PROXY_API_KEY_HASH` | Generate and set a strong API key hash |
| `APP_PROXY_ADMIN_KEY` | Set a strong admin key |
| `APP_PROXY_DATABASE_URL` | Point to PostgreSQL for durability |
| `APP_PROXY_POLICY_ENFORCEMENT_MODE` | Set to `strict` |
| `APP_PROXY_RETENTION_DAYS` | Set to meet your compliance requirements (365+ for SOC2) |
| `APP_PROXY_PLUGINS_DIR` | Mount your plugin manifests |
| `APP_PROXY_POLICIES_DIR` | Mount your Cedar policy files |
| `APP_PROXY_APPROVAL_NOTIFY_URL` | Configure webhook for ops alerting |

## Environment Variable Quick Reference

| Variable | Type | Default |
|----------|------|---------|
| `APP_PROXY_TENANT_ID` | UUID | auto-generated |
| `APP_PROXY_PROXY_PORT` | int | `8081` |
| `APP_PROXY_DATABASE_URL` | string | `sqlite+aiosqlite:///app_proxy.db` |
| `APP_PROXY_PLUGINS_DIR` | path | `plugins` |
| `APP_PROXY_POLICIES_DIR` | path | `policies/cedar` |
| `APP_PROXY_CEDAR_SCHEMA_PATH` | path | `src/app_proxy/policy/schema.json` |
| `APP_PROXY_MCP_SERVER_TIMEOUT_SECONDS` | int | `30` |
| `APP_PROXY_POLICY_ENFORCEMENT_MODE` | string | `strict` |
| `APP_PROXY_API_KEY_HASH` | string | `null` |
| `APP_PROXY_ADMIN_KEY` | string | `null` |
| `APP_PROXY_RETENTION_DAYS` | int | `30` |
| `APP_PROXY_ENABLE_APPROVAL_QUEUE` | bool | `true` |
| `APP_PROXY_APPROVAL_TIMEOUT_MINUTES` | int | `30` |
| `APP_PROXY_APPROVAL_NOTIFY_URL` | string | `null` |
| `APP_PROXY_APPROVAL_SWEEPER_INTERVAL_SECONDS` | int | `300` |
