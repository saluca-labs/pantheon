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
      WEB["platform-web\n(Next.js 16, :3000)\nDashboard UI + BFF"]
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
