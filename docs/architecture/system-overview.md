# System Overview

## Architecture Diagram

```mermaid
graph TB
  subgraph external["External"]
    BROWSER["Browser / CLI"]
    AGENT["AI Agent"]
  end

  subgraph platform["Tiresias Platform"]
    direction TB

    subgraph apps["Apps (profile: default)"]
      WEB["platform-web\n(Next.js 16, :3000)\nDashboard UI + BFF\n+ Agentic OS layer"]
      API["platform-api\n(FastAPI, :8000)\nSoulAuth + SoulGate + SoulWatch\nBilling + Portal + RBAC"]
    end

    subgraph fullApps["Apps (profile: full)"]
      PROXY["platform-app-proxy\n(:8080)\nAgent-facing proxy + Cedar enforcement"]
      SOV["platform-sovereign\n(:8090)\nOn-premises variant"]
      WORKER["worker\n(Celery/background)"]
    end

    subgraph infra["Infrastructure"]
      DB[("PostgreSQL 16\n:5432")]
      REDIS[("Redis 7\n:6379\nfull profile")]
      MAIL["Mailhog\n:8025\ndev only"]
    end

    subgraph packages["Shared Packages"]
      AUTH_TS["@platform/auth\n(TS)"]
      AUTH_PY["platform-auth\n(Python)"]
      MEMORY["@platform/memory\n(TS)\nvendored elysium"]
      CONFIG["@platform/config"]
      TYPES["@platform/types"]
      OBS["@platform/observability"]
    end

    subgraph infrasvc["Observability (separate compose)"]
      GRAFANA["Grafana + Prometheus\n+ Loki + Promtail"]
    end
  end

  BROWSER -- HTTPS --> WEB
  AGENT -- X-Soulkey --> API
  AGENT -- HTTPS --> PROXY

  WEB -- HTTP BFF --> API
  WEB --> AUTH_TS
  WEB --> MEMORY

  API --> AUTH_PY
  API --- DB
  API --- REDIS

  PROXY --> API
  SOV --> API
  WORKER --- DB

  AUTH_TS --- DB
  AUTH_PY --- DB

  MAIL -. SMTP dev .- WEB
  GRAFANA -. metrics .- API
```

## Component Roles

### apps/platform-web
The primary human-facing surface. A Next.js 16 application acting as:
- **Dashboard UI**: observability, RBAC management, provider health, cost analytics.
- **BFF (Backend-for-Frontend)**: proxies to `platform-api`, enforces session checks, applies permission gates server-side.
- **Auth gateway**: login, register, forgot-password flows using `@platform/auth`.

### apps/platform-api
The core platform backend — **do not modify business logic**:
- **SoulAuth**: Agent identity resolution via SoulKey tokens.
- **SoulGate**: Policy enforcement point (Cedar-backed).
- **SoulWatch**: Anomaly detection and audit trails.
- **Portal + Sales + SupportMCP**: Customer-facing and ops endpoints.
- **Billing**: Usage metering and invoice sync.

### packages/auth
The local-auth implementation replacing WorkOS AuthKit:
- Argon2id password hashing (memory-hard, resistant to GPU attacks).
- Postgres-backed session management with rolling expiry.
- CSRF protection (double-submit cookie).
- In-memory rate limiting (replaceable with Redis).
- Structured audit event emission.

### packages/memory
Vendored from saluca-labs/elysium. Provides agent memory with:
- Topic-indexed FTS using BM25.
- Hybrid vector search with RRF ranking.
- Temporal decay for relevance scoring.
- SQLite (dev) and PostgreSQL (prod) adapters.

### Soul stack (apps/soul-service + apps/soul-mcp)
Two cooperating pods in the `pantheon` namespace, sharing one
`X-Soul-Service-Key` secret:

- **apps/soul-service** — Python/FastAPI deployment of the vendored
  [Soul](https://github.com/cristianxruvalcaba-coder/soul) cryptographic
  memory service. ClusterIP `soul-service:8080`. Surface: `/memory/*`,
  `/tkhr/*`, `/graph/integrity/*`. Tier 0 (SQLite) and Tier 1
  (in-process) always on; Tier 2 (Supabase) opt-in. See
  [`apps/soul-service/README.md`](../../apps/soul-service/README.md).
- **apps/soul-mcp** — Node/Fastify dual-transport adapter that exposes
  the full 22-tool `mcp__soul__*` family (soul + mesh + nexus) over
  MCP-over-stdio (for LLM harnesses) and HTTP REST (for in-cluster
  consumers). ClusterIP `soul-mcp:8090`. Memory tools proxy to
  soul-service; mesh/nexus/session bookkeeping is local SQLite until
  upstream Soul gains first-class backends. See
  [`apps/soul-mcp/README.md`](../../apps/soul-mcp/README.md).

Full topology, storage split, auth, deployment, and external MCP client
wiring: [`docs/architecture/soul-stack.md`](soul-stack.md).

### Agentic OS layer (apps/platform-web)
Nine domain-specific products (Health, Maker, Research, Secure-Dev,
CyberSec, Filmmaker, Autobiographer, Business, Creator) ship inside
`platform-web` on top of the shared shell. The layer adds:

- A central module registry ([ADR-005](../decisions/ADR-005-agentic-os-module-registry.md))
- A cross-OS audit log ([ADR-006](../decisions/ADR-006-cross-os-audit-log.md))
- Per-user feature flags ([ADR-007](../decisions/ADR-007-per-user-feature-flags.md))
- A cross-OS dashboard with live record counts at `/dashboard/os`
- Per-OS BFF routes under `/api/tiresias/agentic-os/<slug>/...`

Full details: [`docs/architecture/agentic-os.md`](agentic-os.md).
Migration topology: [`docs/operations/alembic-branches.md`](../operations/alembic-branches.md).

## Data Flow: Human Auth

```
1. User visits /dashboard
2. middleware.ts checks for platform_session cookie
3. No cookie → redirect /login
4. User submits credentials → loginAction (Server Action)
5. Argon2id verify against password_credentials
6. createSession → insert into sessions table
7. setSessionCookie → httpOnly, secure, sameSite=lax
8. redirect /dashboard
9. (dashboard)/layout.tsx → validateSession (DB lookup)
10. Render with user identity + RBAC context
```

## Data Flow: Agent Auth (unchanged)

```
1. Agent sends request with X-Soulkey header
2. platform-api auth/soulkey.py resolves identity
3. pdp.py evaluates Cedar policy
4. Request forwarded or rejected
```

## Data Flow: Agentic OS write (per-OS)

```
1. User submits a write from /dashboard/os/<slug>/<page>
2. Client POSTs to /api/tiresias/agentic-os/<slug>/...
3. Route validates session via getCurrent<Slug>User()
4. Repo executes the SQL write against agos_<slug>_*
5. recordAudit({ actorId, projectId, osSlug, action, payload })
   inserts a row into agos_audit (best-effort — warns on failure,
   does not roll back the user write)
6. Route returns the new/updated entity
```

The audit row is what the cross-OS viewer at `/dashboard/os/audit`
renders (filtered by the current actor). Per-user feature flags
(`agos_feature_flags`) are read once per request in the dashboard
layout and passed into the sidebar; they gate visibility, not access.
