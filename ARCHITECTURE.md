# Tiresias Platform Architecture

Enterprise Agent Identity, Zero-Trust Authorization, and Runtime Security Platform.

**Deployed at:** https://tiresias.network
**Current version:** v3.4.4

---

## Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [Service Overview](#service-overview)
3. [SoulAuth (Identity and Authorization)](#soulauth-identity-and-authorization)
4. [SoulGate (API Security Gateway)](#soulgate-api-security-gateway)
5. [SoulWatch (Runtime Security Monitoring)](#soulwatch-runtime-security-monitoring)
6. [Portal (Web Dashboard)](#portal-web-dashboard)
7. [tiresias-exec (CLI Shim)](#tiresias-exec-cli-shim)
8. [Python SDK](#python-sdk)
9. [Middleware Pipeline](#middleware-pipeline)
10. [Data Flow Diagrams](#data-flow-diagrams)
11. [Authentication Architecture](#authentication-architecture)
12. [Database Schema](#database-schema)
13. [Deployment Architecture](#deployment-architecture)
14. [Security Architecture](#security-architecture)
15. [Monitoring Architecture](#monitoring-architecture)

---

## High-Level Architecture

```
                              tiresias.network
                                    |
                          +---------+---------+
                          |   GKE Ingress     |
                          |  (Google L7 LB)   |
                          |  TLS termination  |
                          +---+---+---+---+---+
                              |   |   |   |
              +---------------+   |   |   +----------------+
              |                   |   |                    |
         /gate/*             /auth/*  /watch/*         /* (catch-all)
         /gate/*             /tokens/* /watch/*         /api/*
              |              /policies/*                    |
              |              /tenants/*                     |
              |              /admin/*                       |
              |              /sdk/*                         |
              |              /health                        |
              |              /metrics                       |
              |                   |                         |
     +--------v------+   +-------v--------+   +------v----------+
     |   SoulGate    |   |   SoulAuth     |   |    Portal       |
     |   :8002       |   |   :8000        |   |    :3000        |
     |   API Gateway |   |   Identity &   |   |    Next.js 16   |
     |               |   |   AuthZ        |   |    React 19     |
     +-------+-------+   +-------+--------+   +--------+-------+
             |                    |                      |
             +--------+-----------+----------------------+
                      |
             +--------v---------+
             |  Cloud SQL Proxy |
             |  :3307 sidecar   |
             +--------+---------+
                      |
             +--------v---------+
             |  PostgreSQL 16   |
             |  Cloud SQL       |
             +------------------+

     +--------v------+
     |   SoulWatch   |
     |   :8001       |
     |   Behavioral  |
     |   Analytics   |
     +---------------+
```

All four services share the same PostgreSQL 16 instance via Cloud SQL Proxy sidecars.
Inter-service communication uses cluster-internal DNS (`*.tiresias.svc.cluster.local`).

---

## Service Overview

| Service     | Language   | Port | Role                              |
|-------------|------------|------|-----------------------------------|
| SoulAuth    | Python/FastAPI | 8000 | Identity, PDP, tokens, policy, audit, billing, partners, contracts, teams, SIEM config, notifications |
| SoulGate    | Python/FastAPI | 8002 | API proxy, rate limiting, circuit breaker, prompt injection scanning |
| SoulWatch   | Python/FastAPI | 8001 | Anomaly detection, Sigma rules, quarantine, dashboards, WebSocket |
| Portal      | Next.js 16 / React 19 | 3000 | Web dashboard, Stripe billing, local/LDAP/OIDC auth |
| tiresias-exec | Go        | --   | CLI shim (policy gate, sanitizer, telemetry, offline mode) |
| SDK         | Python     | --   | `tiresias-sdk` PyPI package        |

---

## SoulAuth (Identity and Authorization)

Core platform service. FastAPI application in `src/`.

### Module Inventory

| Directory | Modules | Responsibility |
|-----------|---------|---------------|
| `auth/` | soulkey.py, pdp.py, rbac.py, oidc_provider.py, oidc_router.py, oidc_exchange.py, identity.py, delegation.py, jit_provisioning.py, oidc_session.py, domain_resolution.py, local_router.py, local_bootstrap.py, ldap_router.py, rate_limit.py, router.py, schemas.py, user_context.py, coexistence.py | SoulKey identity resolution, PDP evaluation, RBAC, OIDC provider, JIT provisioning, domain-based IdP resolution, delegation/escalation, local email/password auth, LDAP/AD auth, login rate limiting |
| `aletheia/` | chain.py, cot_enforcer.py, cot_policy.py, encryption.py, extractors.py, models.py, sanitizer_engine.py, sanitizer_patterns.py, sanitizer_decoder.py, storage.py, tool_evaluate_router.py, tool_policy.py, tool_policy_engine.py, router.py | Chain-of-thought audit trail, CoT policy enforcement, secret sanitization, tool evaluation, encrypted CoT storage |
| `analytics/` | detector.py (AnomalyDetector), baseline.py (BaselineEngine, 7-day sliding window), alerts.py (AlertRouter: Prometheus, Telegram, Slack), router.py | Behavioral anomaly detection, baseline computation, multi-channel alerting |
| `detection/` | sigma_engine.py (SigmaEngine), playbooks.py (PlaybookEngine), router.py | Sigma-based threat detection, automated response playbooks |
| `enforcement/` | quarantine.py (QuarantineEngine), router.py | Automated and manual agent quarantine |
| `tokens/` | capability.py | ES256 JWT capability token issuance and validation |
| `database/` | connection.py (asyncpg/aiosqlite), models.py (SQLAlchemy ORM), local_schema.py, local.py, session.py | Async database layer, ORM models, local dev SQLite fallback |
| `audit/` | logger.py | Immutable hash-chained audit log with encrypted columns |
| `mssp/` | isolation.py, models.py, router.py | Multi-tenant MSSP isolation and hierarchy |
| `policy/` | loader.py, git_sync.py | Policy-as-code loading, Git repository sync |
| `email/` | sender.py, templates.py, triggers.py | Transactional email (trial verification, notifications) |
| `siem/` | _state.py, cef.py, syslog_transport.py, webhook.py, router.py | CEF formatting, syslog transport, webhook forwarding, per-tenant SIEM connector configuration |
| `integrations/` | cef.py, config.py, forwarder.py, notifications.py, siem.py | SIEM event forwarding (Splunk, Elastic, Syslog, Webhook, Azure Sentinel) |
| `notifications/` | router.py, sink.py | Per-tenant notification channel configuration and delivery |
| `trial/` | service.py, email.py, router.py | Self-service trial registration and verification |
| `saas/` | billing.py, metering.py, trial_expiry.py, master.py, router.py | Stripe billing, usage metering, trial expiry automation, SaaS master router |
| `billing/` | portal.py, grace.py, upgrade.py, router.py | Billing portal, grace periods, tier upgrade flows |
| `partner/` | commissions.py, connect.py, invitation.py, promo.py, router.py | Partner program with Stripe Connect, commission calculations, invitation management, promo codes |
| `contracts/` | chain.py, review.py, router.py | Contract management with hash chain verification and review workflow |
| `teams/` | router.py | Team RBAC management (create, assign roles, membership) |
| `investigation/` | router.py, schemas.py, tokens.py | Investigation tokens for forensic audit access |
| `license/` | validator.py, relay.py | License JWT validation, relay/phone-home for non-NFR licenses |
| `middleware/` | pep.py, tenant.py, feature_gate.py, model_router.py, rbac.py, rate_limit.py, security_headers.py, usage_limit.py | Full middleware stack (see [Middleware Pipeline](#middleware-pipeline)) |
| `monitoring/` | health.py, metrics.py | Health check endpoints, Prometheus metrics, gauge updater |
| `support/` | linear.py, models.py, notifications.py, router.py | Support ticket integration (Linear), notification routing |
| `chatbot/` | actions.py, context.py, escalation.py, history.py, knowledge.py, router.py | In-app support chatbot with knowledge base and escalation |
| `admin/` | router.py | Tenant admin API (SoulKey lifecycle, policy sync, audit reports) |
| `tenant/` | router.py, schemas.py | Tenant CRUD and configuration |
| `idp/` | encryption.py, router.py, schemas.py, wellknown.py | Identity provider management, OIDC well-known endpoints |
| `sdk/` | client.py, exceptions.py, models.py | Embedded SDK client library |
| `waitlist/` | email.py, router.py | Waitlist registration and notification |
| `usage/` | router.py | Usage tracking and reporting |
| `compatibility/` | adapter.py | Backward compatibility adapter for API versioning |
| `keys/` | router.py | SoulKey management API |
| `security/` | -- | Security utilities |
| `prh/` | -- | Prompt risk heuristics engine |
| `tiresias/` | -- | Core platform utilities |
| `main.py` | -- | FastAPI app init, lifespan (license, analytics, detection, SIEM, policy sync), middleware setup, 23 routers |
| `cli.py` | -- | Click CLI: health, register, token, audit, policy test, whoami, init, dev, playground, status |
| `tier.py` | -- | Tier definitions (community, starter, pro, enterprise, mssp, saas) |

### CLI Commands

```
soulauth health                           # Service health check
soulauth register --tenant-id ... --agent-id ...  # Register SoulKey
soulauth token request --soulkey ...      # Request capability token
soulauth token validate --soulkey ...     # Validate token
soulauth audit --tenant-id ... --limit N  # Query audit log
soulauth policy test --soulkey ...        # Test policy evaluation
soulauth whoami                           # Inspect current identity
soulauth init                             # One-command local setup
soulauth dev                              # Start local dev server
soulauth playground                       # Interactive agent REPL
soulauth status                           # Local instance status
```

---

## SoulGate (API Security Gateway)

Security proxy in `soulGate/src/`. Sits in front of upstream LLM providers and internal services. Supports configurable Postgres/SQLite dual-backend database.

### Module Inventory

| Directory | Responsibility |
|-----------|---------------|
| `proxy/` | Upstream configuration, request routing, HTTP client management |
| `ratelimit/` | Policy-driven rate limiting engine and management API |
| `auth/` | API key validation and management |
| `access/` | Access control lists and IP allowlisting |
| `circuit/` | Circuit breaker for upstream fault tolerance |
| `audit/` | Request/response audit logging |
| `inspection/` | **Prompt injection detection** (prompt_guard.py, sanitizer.py, scanner.py) |
| `monitoring/` | Prometheus metrics and MetricsMiddleware |
| `security_headers.py` | OWASP security headers middleware |
| `database/` | Database connection (Postgres or SQLite) |

### Key Capabilities

- Reverse proxy with configurable upstream routing
- Per-key and per-IP rate limiting
- Circuit breaker pattern for upstream resilience
- Real-time prompt injection scanning (pattern-based and heuristic)
- Request/response audit trail
- API key lifecycle management

---

## SoulWatch (Runtime Security Monitoring)

Behavioral analytics and threat detection in `soulWatch/src/`.

### Module Inventory

| Directory | Responsibility |
|-----------|---------------|
| `analytics/` | AnomalyDetector, BaselineEngine (7-day sliding window), AlertRouter (Prometheus, Telegram, Slack) |
| `detection/` | SigmaEngine (YAML rule loading and matching), PlaybookEngine (automated response) |
| `enforcement/` | QuarantineEngine (automatic and manual agent quarantine) |
| `integrations/` | SIEM event forwarding to external systems |
| `pipeline/` | Event ingestion (ingestion.py) and processing pipeline (processor.py) |
| `dashboard/` | Precomputed dashboard data and API |
| `reports/` | Scheduled and on-demand security reports |
| `websocket/` | Live event streaming via WebSocket |
| `aletheia/` | Chain-of-thought audit relay |
| `monitoring/` | Prometheus metrics and MetricsMiddleware |
| `security_headers.py` | OWASP security headers middleware |
| `database/` | Database connection (shared Postgres) |

---

## Portal (Web Dashboard)

Next.js 16 application with React 19 and Stripe integration. Located in `portal/`.

### Dashboard Pages (`portal/src/app/dashboard/`)

```
overview/          # Main dashboard
agents/            # Agent inventory and status
aletheia/          # CoT audit trail viewer
analytics/         # Behavioral analytics charts
audit/             # Audit log explorer
contracts/         # Contract management and verification
costs/             # Cost tracking and metering
detection/         # Sigma rule matches and management
investigation/     # Forensic investigation tools
mssp/              # MSSP multi-tenant management
partner/           # Partner program management
playground/        # Interactive agent testing
policies/          # Policy editor and viewer
providers/         # IdP configuration (OIDC, LDAP)
quarantine/        # Quarantine management
sessions/          # Active session browser
settings/          # User, org, SIEM, SSO, notification, billing settings
soulgate/          # Gateway metrics and config
soulwatch/         # SoulWatch dashboard
support/           # Support ticket management
traces/            # Distributed trace viewer
welcome/           # Onboarding flow
```

### Portal API Routes (`portal/src/app/api/`)

```
auth/              # Authentication endpoints (local, LDAP, OIDC)
billing/           # Stripe webhook handlers
session/           # Backend session management
```

---

## tiresias-exec (CLI Shim)

Go binary in `cmd/tiresias-exec/`. Wraps CLI agent invocations with policy enforcement.

| File | Responsibility |
|------|---------------|
| main.go | Entry point, command dispatch |
| config.go | Configuration loading |
| executor.go | Process execution wrapper |
| identity.go | SoulKey identity resolution |
| policy.go | Policy gate (pre-execution check) |
| sanitizer.go | Output sanitization |
| reporter.go | Telemetry reporting |
| offline.go | Offline mode (cached policies) |

---

## Python SDK

Standalone package in `sdk/` (published as `tiresias-sdk` on PyPI).

| File | Responsibility |
|------|---------------|
| client.py | SoulAuthClient -- async HTTP client for all SoulAuth endpoints |
| exceptions.py | Typed exception hierarchy (SoulAuthError, etc.) |
| models.py | Pydantic request/response models |

---

## Middleware Pipeline

Middleware executes in reverse registration order (last registered runs first on the request path). The actual stack from `src/main.py`:

```
Request
  |
  v
[1] MetricsMiddleware          # Request duration tracking (Prometheus histograms)
  |
  v
[2] TenantContextMiddleware    # Extracts tenant from X-Tenant-ID header or SoulKey
  |
  v
[3] SoulAuthPEPMiddleware      # Policy Enforcement Point -- validates capability tokens
  |                             # on protected prefixes (/v1/memory/, /v1/vault/, /v1/mesh/)
  v
[4] FeatureGateMiddleware      # Tier-based feature access enforcement (HTTP 402)
  |
  v
[5] ModelRoutingMiddleware     # Per-persona model access policy enforcement
  |
  v
[6] UsageLimitMiddleware       # Tier request limits (soft block at 100-109%, hard block at 110%+, HTTP 429)
  |
  v
[7] CORSMiddleware             # Origin validation (production + dev origins)
  |
  v
  Route Handler
  |
  v
Response (reverse order)
```

Additional middleware modules (used conditionally or by companion services):
- `rate_limit.py` -- IP-based sliding window rate limiter (trial registration anti-abuse, disposable email blocking, configurable login rate limiting)
- `security_headers.py` -- OWASP headers (HSTS, CSP, X-Content-Type-Options, X-Frame-Options)
- `rbac.py` -- Re-exports RBAC functions (AdminRole, require_permission, resolve_soulkey_role)

---

## Data Flow Diagrams

### Authentication Flow (SoulKey)

```
Agent/CLI                     SoulAuth                        Database
   |                             |                               |
   |-- X-SoulKey header -------->|                               |
   |                             |-- SHA-512 lookup ------------>|
   |                             |<-- tenant_id, persona, status-|
   |                             |                               |
   |                             |-- Check active/suspended      |
   |                             |-- Resolve RBAC role           |
   |                             |-- Load policy (cache/git)     |
   |                             |                               |
   |                             |-- PDP evaluate:               |
   |                             |   resource + action + context |
   |                             |                               |
   |                             |-- Issue ES256 capability JWT  |
   |<-- Capability token --------|                               |
   |                             |-- Audit log (hash-chained) -->|
```

### Authentication Flow (Local)

```
Browser                    Portal                    SoulAuth             Database
   |                          |                          |                    |
   |-- email + password ----->|                          |                    |
   |                          |-- POST /auth/local/login |                    |
   |                          |------------------------>|                    |
   |                          |                          |-- bcrypt verify -->|
   |                          |                          |<-- user record ----|
   |                          |                          |-- Issue session    |
   |                          |<-- session token --------|                    |
   |<-- Set cookie -----------|                          |                    |
```

### Authentication Flow (LDAP)

```
Browser                    Portal                    SoulAuth        LDAP/AD Server
   |                          |                          |                |
   |-- username + password -->|                          |                |
   |                          |-- POST /auth/ldap/login  |                |
   |                          |------------------------>|                |
   |                          |                          |-- LDAP bind -->|
   |                          |                          |<-- bind OK ----|
   |                          |                          |-- search user->|
   |                          |                          |<-- user attrs--|
   |                          |                          |-- JIT provision|
   |                          |<-- session token --------|                |
   |<-- Set cookie -----------|                          |                |
```

### Authentication Flow (Portal / OIDC)

```
Browser                    Portal                    SoulAuth            Google/IdP
   |                          |                          |                    |
   |-- /login --------------->|                          |                    |
   |                          |-- OIDC redirect -------->|                    |
   |                          |                          |-- authorize ------>|
   |<-- IdP consent screen ---|                          |                    |
   |-- OAuth callback ------->|                          |                    |
   |                          |-- token exchange ------->|                    |
   |                          |                          |-- PKCE verify      |
   |                          |                          |-- JIT provision    |
   |                          |<-- session token --------|                    |
   |<-- Set cookie -----------|                          |                    |
```

### Policy Evaluation

```
Request (with capability token)
   |
   v
PEP Middleware
   |-- Validate JWT signature (ES256 public key)
   |-- Check expiration, jti replay
   |-- Extract scopes, targets, tenant_id
   |
   v
PDP (/v1/auth/evaluate)
   |-- Load policy from cache or git-synced YAML
   |-- Evaluate against:
   |     - resource (memory, vault, mesh, api)
   |     - action (read, write, execute)
   |     - context (IP, user-agent, node affinity, time)
   |     - conditions and approval chains
   |
   +-- GRANT --> issue short-lived capability token (5-15 min TTL)
   +-- DENY  --> HTTP 403 + audit log entry
```

### Anomaly Detection Pipeline

```
SoulAuth Events           SoulWatch Pipeline         Alert Sinks
       |                         |                        |
       |-- audit events -------->|                        |
       |                         |-- BaselineEngine       |
       |                         |   (7-day sliding       |
       |                         |    window rebuild      |
       |                         |    every 6h)           |
       |                         |                        |
       |                         |-- AnomalyDetector      |
       |                         |   (compare vs baseline)|
       |                         |                        |
       |                         |-- SigmaEngine          |
       |                         |   (YAML rule matching) |
       |                         |                        |
       |                         |-- PlaybookEngine       |
       |                         |   (automated response) |
       |                         |                        |
       |                         |-- AlertRouter -------->|
       |                         |     |                  |-- Prometheus
       |                         |     |                  |-- Telegram
       |                         |     |                  |-- Slack
       |                         |     |                  |-- SIEM connectors
       |                         |     |                  |-- Notification channels
       |                         |                        |
       |                         |-- QuarantineEngine     |
       |                         |   (auto-quarantine     |
       |                         |    on critical match)  |
       |                         |                        |
       |                         |-- WebSocket push ----->| Live dashboard
```

### Chain-of-Thought (Aletheia) Audit

```
Agent Execution              SoulAuth Aletheia           Database
       |                         |                          |
       |-- CoT submission ------>|                          |
       |                         |-- cot_enforcer.py        |
       |                         |   (policy check)         |
       |                         |                          |
       |                         |-- sanitizer_engine.py    |
       |                         |   (pattern-based secret  |
       |                         |    scrubbing + decoder)  |
       |                         |                          |
       |                         |-- encryption.py          |
       |                         |   (encrypt CoT payload)  |
       |                         |                          |
       |                         |-- chain.py               |
       |                         |   (append to hash chain) |
       |                         |                          |
       |                         |-- storage.py ----------->|
       |                         |   (persist to            |
       |                         |    _soul_aletheia_cot)   |
       |                         |                          |
       |-- tool_evaluate ------->|                          |
       |                         |-- tool_policy_engine.py  |
       |                         |   (pre-exec tool policy) |
       |                         |                          |
       |<-- allow/deny + audit --|                          |
```

### Partner and Commissions Flow

```
Partner                      SoulAuth                      Stripe
   |                            |                             |
   |-- Accept invitation ------>|                             |
   |                            |-- Create Stripe Connect --->|
   |                            |<-- Connected account -------|
   |                            |                             |
   |   (customer referred)      |                             |
   |                            |-- Calculate commission      |
   |                            |-- Create transfer --------->|
   |                            |                             |
   |                            |-- Contract hash chain       |
   |                            |   (immutable record)        |
```

---

## Authentication Architecture

### Current State (v3.4.4)

| Method | Status | Details |
|--------|--------|---------|
| Local accounts (email/password) | **LIVE** | bcrypt hashing, bootstrap admin, self-service password reset, configurable login rate limiter |
| LDAP / Active Directory | **LIVE** | Full LDAP adapter, LDAPS with self-signed cert support, JIT provisioning |
| Google OAuth / OIDC (Portal + Backend) | **LIVE** | Generic OIDC provider. PKCE, JIT provisioning, domain-based IdP resolution, session management. |
| SoulKey (API) | **LIVE** | SHA-512 hashed keys in `_soulkeys`. X-SoulKey header. ES256 capability tokens. |

### Auth Module Structure

```
src/auth/
  soulkey.py              # SoulKey identity resolution (SHA-512 lookup)
  pdp.py                  # Policy Decision Point evaluation
  rbac.py                 # Role-based access control (7 roles)
  local_router.py         # Local email/password login, password reset
  local_bootstrap.py      # Bootstrap admin account on first startup
  ldap_router.py          # LDAP/AD authentication adapter
  rate_limit.py           # Configurable login rate limiter
  oidc_provider.py        # OIDC provider configuration and discovery
  oidc_router.py          # /authorize, /token, /userinfo, /callback endpoints
  oidc_exchange.py        # Token exchange (authorization code -> access token)
  oidc_session.py         # OIDC session lifecycle management
  jit_provisioning.py     # Just-in-time user creation on first login
  domain_resolution.py    # Map email domain -> IdP configuration
  coexistence.py          # Parallel operation with SoulKey auth
  identity.py             # Identity resolution utilities
  delegation.py           # Delegation and escalation
  user_context.py         # User context extraction
  router.py               # Core auth router
  schemas.py              # Pydantic schemas
```

### Database IdP Enum

The `_soul_idp_configs` table supports provider types: `google`, `okta`, `azure_ad`, `oidc`.

---

## Database Schema

PostgreSQL 16 on Cloud SQL. 19 Alembic migrations in `alembic/versions/`.

### Migration History

| Migration | Tables/Changes |
|-----------|---------------|
| `0001_initial_schema` | `_soul_tenants`, `_soulkeys`, `_soul_policies`, `_soul_audit_log`, `_soul_capabilities`, `_soulwatch_events` |
| `0002_add_waitlist_table` | `_soul_waitlist` |
| `0002_mssp_tenant_hierarchy` | MSSP parent/child tenant relationships |
| `0003_add_aletheia_cot_tables` | `_soul_aletheia_cot`, `_soul_aletheia_chains` (CoT storage and hash chains) |
| `0004_audit_prev_hash_column` | `prev_hash` column on `_soul_audit_log` (immutable hash chain integrity) |
| `0005_oidc_sso` | `_soul_users`, `_soul_idp_configs`, `_soul_oidc_sessions` |
| `0006_local_auth` | `password_hash` column on `_soul_users`, local auth settings |
| `0007_standardize_metadata_column` | Standardize `metadata_` column mapping across tables |
| `0008_add_split_token_columns` | Split token columns for session management |
| `0009_normalize_tier_default` | Normalize tier default values across tenants |
| `0010_add_licenses_table` | `_soul_licenses` table for JWT license validation |
| `0011_add_investigation_tokens` | `_soul_investigation_tokens` for forensic audit access |
| `0012_add_stripe_customer_id_column` | `stripe_customer_id` on tenant records |
| `0013_add_partners_table` | `_soul_partners` for partner program (Stripe Connect, commissions) |
| `0014_add_contracts_table` | `_soul_contracts` with hash chain verification |
| `0015_add_siem_connectors_table` | `_soul_siem_connectors` per-tenant SIEM configuration |
| `0016_add_notification_channels_table` | `_soul_notification_channels` per-tenant notification config |
| `0017_drop_jwt_signature_column` | Remove vestigial `jwt_signature` column from licenses |
| `0018_add_encrypted_columns_to_audit_log` | Encrypted payload columns on `_soul_audit_log` |
| `0019_team_rbac` | `_soul_teams`, `_soul_team_members` with role assignments |

### Core Tables

```
_soul_tenants              Tenant registry (id, name, tier, status, config, stripe_customer_id)
_soulkeys                  Agent identity keys (SHA-512 hash, tenant_id, persona_id, status, role)
_soul_policies             Policy-as-code cache (tenant_id, policy YAML, version, hash)
_soul_audit_log            Immutable audit trail (event_type, tenant_id, soulkey_id, prev_hash, encrypted payload)
_soul_capabilities         Issued capability tokens (jti, soulkey_id, scopes, targets, expires_at)
_soulwatch_events          Security events from SoulWatch pipeline
_soul_waitlist             Trial waitlist registrations
_soul_aletheia_cot         Encrypted chain-of-thought records
_soul_aletheia_chains      CoT hash chain heads per agent
_soul_users                User accounts (local, LDAP, OIDC-provisioned, password_hash)
_soul_idp_configs          IdP configurations per tenant (provider type, client_id, discovery URL)
_soul_oidc_sessions        Active OIDC sessions (token, refresh, expiry)
_soul_licenses             JWT license records
_soul_investigation_tokens Investigation tokens for forensic access
_soul_partners             Partner program records (Stripe Connect account, commission rate, status)
_soul_contracts            Contracts with hash chain verification
_soul_siem_connectors      Per-tenant SIEM connector configuration
_soul_notification_channels Per-tenant notification channel configuration
_soul_teams                Team definitions within tenants
_soul_team_members         Team membership and role assignments (7 roles)
```

---

## Deployment Architecture

### GKE Cluster

- **Project:** salucainfrastructure (GCP)
- **Cluster:** tiresias-v2
- **Region:** us-central1
- **Namespace:** tiresias
- **Container Registry:** us-central1-docker.pkg.dev/salucainfrastructure/tiresias/

### Service Topology

```
Namespace: tiresias
+------------------------------------------------------------------+
|                                                                  |
|  Deployment: soulauth (2 replicas)     Service: soulauth:80     |
|    image: .../soulauth:v3.4.4          -> :8000                  |
|    + cloud-sql-proxy sidecar (:3307)                             |
|                                                                  |
|  Deployment: soulgate (2 replicas)     Service: soulgate:80     |
|    image: .../soulgate:v3.4.4          -> :8002                  |
|    + cloud-sql-proxy sidecar (:3307)                             |
|                                                                  |
|  Deployment: soulwatch (2 replicas)    Service: soulwatch:80    |
|    image: .../soulwatch:v3.4.4         -> :8001                  |
|    + cloud-sql-proxy sidecar (:3307)                             |
|                                                                  |
|  Deployment: portal (2 replicas)       Service: portal:80       |
|    image: .../portal:v3.4.4            -> :3000                  |
|                                                                  |
+------------------------------------------------------------------+
```

### Ingress Routing

GKE Ingress with Google-managed TLS certificate at `tiresias.network`.
HTTP-to-HTTPS redirect via FrontendConfig (`MOVED_PERMANENTLY_DEFAULT`).

| Path | Backend Service | Port |
|------|----------------|------|
| `/gate/*` | soulgate | 80 |
| `/watch/*` | soulwatch | 80 |
| `/health` | soulauth | 80 |
| `/auth/*` | soulauth | 80 |
| `/tokens/*` | soulauth | 80 |
| `/policies/*` | soulauth | 80 |
| `/tenants/*` | soulauth | 80 |
| `/admin/*` | soulauth | 80 |
| `/sdk/*` | soulauth | 80 |
| `/metrics` | soulauth | 80 |
| `/api/*` | portal | 80 |
| `/*` (catch-all) | portal | 80 |

### Autoscaling (HPA)

All four services use identical HPA configuration:

| Parameter | Value |
|-----------|-------|
| Min replicas | 2 |
| Max replicas | 10 |
| CPU target | 70% average utilization |
| Scale-up | +2 pods per 60s, 60s stabilization |
| Scale-down | -1 pod per 120s, 300s stabilization |

### Pod Disruption Budgets

All services: `minAvailable: 1` (at least one pod always available during voluntary disruptions).

### Rolling Update Strategy

All services: `maxSurge: 0`, `maxUnavailable: 1` (replace one pod at a time, never exceed desired count).

---

## Security Architecture

### Container Hardening

Every container in the platform runs with identical security constraints:

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 1000
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    drop: [ALL]
  seccompProfile:
    type: RuntimeDefault
```

Writable paths: `/tmp` only (emptyDir backed by Memory, 64Mi limit).
Portal additionally mounts `/app/.next/cache` for ISR caching.

### Network Policy

Strict NetworkPolicy per service. All services share the same pattern:

**SoulAuth** (`soulauth-netpol`):
- Ingress: port 8000 from tiresias namespace pods + GCE health probers (130.211.0.0/22, 35.191.0.0/16)
- Egress: DNS (53/UDP+TCP), Cloud SQL Proxy (3307/TCP), GKE metadata (169.254.0.0/16:80), HTTPS (443/TCP)

**SoulGate** (`soulgate-netpol`):
- Ingress: port 8002 from tiresias namespace pods + GCE health probers
- Egress: DNS, Cloud SQL Proxy, GKE metadata, SoulAuth (8000), SoulWatch (8001), HTTPS

**SoulWatch** (`soulwatch-netpol`):
- Ingress: port 8001 from tiresias namespace pods + GCE health probers
- Egress: DNS, Cloud SQL Proxy, GKE metadata, SoulAuth (8000), HTTPS

**Portal** (`portal-netpol`):
- Ingress: port 3000 (open) + GCE health probers
- Egress: DNS, GKE metadata, all tiresias services (8000, 8001, 8002), HTTPS

### Secret Management

Kubernetes Secrets mounted as environment variables (never files):
- `database-url` -- Cloud SQL connection string
- `jwt-private-key` / `jwt-public-key` -- ES256 key pair for capability tokens
- Per-service secrets (SIEM credentials, Stripe keys, OAuth client secrets, LDAP bind credentials)

Secrets reference: `k8s/secrets.yaml.example`

### HTTP Security Headers

Applied by `SecurityHeadersMiddleware` on SoulGate and SoulWatch (and available for SoulAuth):

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
                         img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'
```

### License Validation

On startup, SoulAuth validates `TIRESIAS_LICENSE_KEY` (ES256-signed JWT):
- **INVALID** + `license_required=true` -> hard exit (code 2)
- **MISSING** + `license_required=true` -> hard exit (code 2)
- **Valid non-NFR** -> license relay phone-home for renewal verification
- **Valid NFR** -> no phone-home

License state stored on `app.state.license` for middleware access.

---

## Monitoring Architecture

### Prometheus Metrics

Each service exposes `/metrics` with `MetricsMiddleware`:

**Request metrics (per-service prefixed):**
- `soulauth_request_duration_seconds` (histogram, labels: method, path_template, status_code)
- `soulgate_request_duration_seconds` (histogram, labels: method, upstream, status)
- `soulgate_requests_total` (counter, labels: method, upstream, status, blocked)

**Business metrics (SoulAuth):**
- Authentication success/failure counters
- Policy evaluation latency histogram
- Token issuance volume
- Anomaly detection alert counters

**Background gauges:**
- Updated every 60 seconds via `start_gauge_updater()`
- Active SoulKeys, tenant counts, policy cache size

### Prometheus Stack

- **Prometheus 2.51.0** -- scrapes all pods via `prometheus.io/*` annotations
- **Alertmanager 0.27.0** -- alert routing to Telegram, Slack, PagerDuty

### Health Checks

All services expose health endpoints used by Kubernetes probes:

**SoulAuth:**
- Liveness: `GET /health` (initialDelaySeconds: 10, period: 30s)
- Readiness: `GET /health` (initialDelaySeconds: 5, period: 10s)
- Detailed: `GET /health?detail=true` -- returns component status (database latency, JWT key status, policy sync state)

**SoulGate / SoulWatch / Portal:** Equivalent health endpoints on their respective ports.

### Alert Routing

The `AlertRouter` in SoulAuth and SoulWatch supports pluggable sinks:
- `PrometheusAlertSink` -- always enabled, exposes alert metrics
- `TelegramAlertSink` -- enabled when `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set (critical-only threshold)
- `SlackAlertSink` -- available for Slack workspace integration
- SIEM connector sinks -- wired to per-tenant SIEM connectors
- Notification channel sinks -- wired to per-tenant notification channels

### Structured Logging

All services use `structlog` with:
- JSON output in production, console rendering in debug mode
- ISO timestamps
- Contextvar-based correlation IDs
- Stack info and exception rendering
- Configurable log level via `SOULAUTH_LOG_LEVEL`

---

## Roadmap

- **Cloud KMS BYOK**: AWS KMS, Google Cloud KMS, Azure Key Vault, HashiCorp Vault providers for customer-managed encryption keys
- **Granular data access**: Field-level masking, role-based data filtering, access levels (full, read-only, hash-only, report-download)
- **Team-scoped queries**: Detection events, investigations, and quarantine records filtered by team membership
- **Admin-configurable RBAC**: Per-tenant role customization and permission policies
