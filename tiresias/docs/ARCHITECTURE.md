# Tiresias AI Agent Security Platform -- Architecture Document

> **Version:** 3.3  
> **Date:** April 2026  
> **Classification:** Internal -- Engineering  
> **Status:** L1 Architecture (drill-down documents to follow)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Component Architecture](#2-component-architecture)
3. [Authentication Architecture](#3-authentication-architecture)
4. [Data Flow](#4-data-flow)
5. [Security Architecture](#5-security-architecture) (includes 5.5 Tenant Hierarchy, 5.6 Portal Hardening)
6. [Team RBAC Model](#6-team-rbac-model) (v3.3.0)
7. [Deployment Architecture](#7-deployment-architecture)
8. [Database Schema Overview](#8-database-schema-overview)

---

## 1. System Overview

Tiresias is a purpose-built security platform for AI agent infrastructure. It provides
identity, authorization, behavioral detection, and observability for autonomous LLM
agents operating across enterprise environments.

The platform solves a fundamental gap: traditional IAM and SIEM tools were designed for
human users with predictable session patterns. AI agents operate at machine speed, with
non-deterministic behavior, delegated authority chains, and opaque reasoning. Tiresias
treats these properties as first-class concerns.

### The Four Pillars

| Pillar | Service | Port | Purpose |
|--------|---------|------|---------|
| **Identity & AuthZ** | SoulAuth | 8000 | Soulkey lifecycle, OIDC/SSO, PDP, RBAC, policy engine, capability tokens |
| **Detection & Response** | SoulWatch | 8001 | Behavioral baselines, anomaly detection, Sigma rules, automated response playbooks |
| **API Gateway** | SoulGate | 8002 | Rate limiting, prompt injection scanning, circuit breaking, upstream proxy |
| **Observability** | Tiresias Proxy | -- | LLM request interception, audit trail, cost tracking, chain-of-thought integrity |

All four services share a single PostgreSQL database (namespaced by table prefix) and
communicate over an internal Docker bridge network (`tiresias-net`). Only SoulAuth and
the Portal expose host ports; SoulGate and SoulWatch are internal-only.

---

## 2. Component Architecture

```
                                  +------------------+
                                  |   Cloudflare     |
                                  |   (DNS / WAF)    |
                                  +--------+---------+
                                           |
                            HTTPS (443)    |
                                           v
+-------------+              +-------------+-----------+
|             |   :3000      |                         |
|   Browser   +------------->+   Portal (Next.js)      |
|             |              |   Static + API Routes   |
+-------------+              +-----+-----+-----+------+
                                   |     |     |
                    +--------------+     |     +--------------+
                    |                    |                    |
                    v                    v                    v
          +---------+------+   +--------+-------+   +--------+-------+
          |                |   |                |   |                |
          |   SoulAuth     |   |   SoulWatch    |   |   SoulGate     |
          |   :8000        |   |   :8001        |   |   :8002        |
          |                |   |                |   |                |
          |  - Soulkey mgmt|   |  - Baselines   |   |  - Rate limit  |
          |  - PDP engine  |   |  - Anomaly det |   |  - Circuit brk |
          |  - OIDC/SSO    |   |  - Sigma rules |   |  - Prompt guard|
          |  - RBAC        |   |  - Playbooks   |   |  - Upstream fwd|
          |  - Capability  |   |  - Alerts      |   |  - Payload scan|
          |    tokens      |   |  - SIEM export |   |  - IP filtering|
          +-------+--------+   +-------+--------+   +-------+--------+
                  |                    |                    |
                  |                    |                    |
                  +----------+---------+----+--------------+
                             |              |
                             v              v
                   +---------+------+  +----+-------------+
                   |                |  |                   |
                   |  PostgreSQL    |  |   LLM Providers   |
                   |  (Cloud SQL)   |  |   (via proxy)     |
                   |                |  |                   |
                   +--------+------+  +-------------------+
                            |
                            v
                   +--------+------+
                   |  Prometheus   |
                   |  + Alertmgr   |
                   +---------------+
```

### Service Boundaries

| Service | Language | Framework | Container Image |
|---------|----------|-----------|-----------------|
| SoulAuth | Python 3.12 | FastAPI + SQLAlchemy (async) | `soulauth:v3.3.0` |
| SoulWatch | Python 3.12 | FastAPI + SQLAlchemy (async) | `soulwatch:v3.3.0` |
| SoulGate | Python 3.12 | FastAPI + httpx (async) | `soulgate:v3.3.0` |
| Portal | TypeScript | Next.js 14 (App Router) | `portal:v3.3.0` |
| Database | -- | PostgreSQL 16 Alpine | `postgres:16-alpine` |
| Monitoring | -- | Prometheus + Alertmanager | `prom/prometheus:v2.51.0` |

### Internal Communication

All services run on a shared Docker bridge network (`tiresias-net`). Service-to-service
calls use internal DNS names (e.g., `http://soulauth:8000`). No service-to-service
traffic traverses the public internet.

```
SoulGate  ----> SoulAuth    (token validation, policy checks)
SoulWatch ----> SoulAuth    (audit event consumption, key suspension)
Portal    ----> SoulAuth    (all API calls proxied through Next.js API routes)
Portal    ----> SoulWatch   (dashboard data, anomaly feeds)
Portal    ----> SoulGate    (gateway configuration)
```

---

## 3. Authentication Architecture

Tiresias supports two distinct authentication domains: **agent authentication** (SoulKeys)
and **human authentication** (OIDC/SSO for the portal).

### 3.1 SoulKey Flow (Agent Identity)

SoulKeys are durable, SHA-512-hashed credentials that uniquely identify an AI agent
within a tenant. They are the agent equivalent of API keys but carry identity semantics.

```
+------------------+                          +------------------+
|  Admin Portal    |   POST /api/keys/issue   |                  |
|  (human user)    +------------------------->+   SoulAuth       |
|                  |                          |                  |
|  Receives:       |   Response:              |  1. Generate key |
|  sk_agent_...    |<-------------------------+  2. SHA-512 hash |
|  (shown once)    |   { raw_key, key_id }    |  3. Store hash   |
+------------------+                          |  4. Audit log    |
                                              +------------------+

--- Agent runtime ---

+------------------+                          +------------------+
|  AI Agent        |   Authorization:         |                  |
|                  |   Bearer sk_agent_...    |   SoulAuth PDP   |
|  Requests access +------------------------->+                  |
|  to resource     |                          |  1. Hash key     |
|                  |   Response:              |  2. Lookup hash  |
|                  |<-------------------------+  3. Resolve ID   |
|                  |   { capability_token }   |  4. Eval policy  |
+------------------+                          |  5. Issue cap    |
                                              +------------------+
```

**Key format:** `sk_agent_<tenant_short>_<persona_slug>_<hex64>`

**Lifecycle states:** `active` --> `suspended` --> `active` | `revoked` (terminal)

### 3.2 OIDC/SSO Flow (Human Users)

Portal users authenticate via external IdPs (Google, Okta, Azure AD, generic OIDC).
The flow uses authorization code + PKCE.

```
Browser --> Portal --> IdP (authorization_endpoint)
                         |
                         v  (user authenticates)
                    redirect with ?code=
                         |
Portal <-----------------+
   |
   |  POST token_endpoint (code + code_verifier)
   +---> IdP --> { id_token, access_token }
   |
   |  Validate id_token via JWKS (RS256/ES256)
   |  JIT-provision user in _soul_users
   |  Issue session cookie (httpOnly, secure, sameSite)
   v
Browser (session established)
```

IdP client secrets are stored encrypted using Fernet (AES-128-CBC with HMAC-SHA256),
keyed by `SOULAUTH_OIDC_SECRET_KEY`.

### 3.3 RBAC Model

Tiresias implements a two-layer role model as of v3.3.0:

**Layer 1: Portal-Level Roles.** Human users in the portal are assigned one of four hierarchical roles that govern platform-wide access:

```
  owner
    |--- Full access, billing, tenant deletion, account admin designation
  admin
    |--- Key management, policy CRUD, audit read, detection, enforcement, user/team management
  operator
    |--- Read dashboards, trigger syncs, view audit
  viewer
    |--- Read-only access to all dashboards
```

**Layer 2: Team-Level Roles.** Users are assigned a role within each team they belong to. Team roles control access to team-scoped resources:

```
  team_admin
    |--- Full control of the team: member management, team settings, team-scoped operations
  analyst
    |--- Investigate incidents, manage quarantines, edit detection rules within team scope
  member
    |--- Read-only access to team dashboards and shared resources
```

**Permission format:** `resource:action` (e.g., `keys:create`, `audit:read`, `teams:update`)

| Role | Permissions |
|------|-------------|
| `owner` | `*` (wildcard -- all resources, all actions) |
| `admin` | `keys:*`, `policy:*`, `audit:read`, `tenants:read`, `tenants:update`, `tenants:create`, `hierarchy:manage`, `detection:*`, `enforcement:*`, `analytics:*`, `aletheia:*`, `multi_tenant`, `users:*`, `teams:*`, `invites:*` |
| `operator` | `keys:read`, `policy:read`, `policy:sync`, `audit:read`, `tenants:read`, `detection:read`, `enforcement:read`, `analytics:read`, `aletheia:read`, `users:read`, `teams:read`, `invites:read` |
| `viewer` | `audit:read`, `tenants:read`, `policy:read`, `detection:read`, `analytics:read`, `aletheia:read`, `keys:read`, `enforcement:read`, `users:read`, `teams:read` |

**Permissions added in v3.3.0:**

| Permission | Purpose |
|------------|---------|
| `hierarchy:manage` | View and modify tenant hierarchy relationships, re-parent tenants |
| `tenants:create` | Provision new child tenants within the hierarchy |

**Permissions added in v3.3.0:**

| Permission | Purpose |
|------------|---------|
| `users:*` | Create, read, update, delete portal user accounts |
| `teams:*` | Create, read, update, delete teams and manage team membership |
| `invites:*` | Create, read, update, delete, and accept user invitations |

**Account Admin Designations (v3.3.0):**

| Designation | Purpose |
|-------------|---------|
| `is_account_admin` | Full administrative authority over the tenant account. Can designate secondary admins, manage all users and teams, access billing. |
| `is_secondary_admin` | Delegated administrative authority. Can manage users and teams but cannot modify account admin settings. |

Roles are hierarchical: each role inherits all permissions from roles below it.

### 3.4 Session Management

- **Agent sessions:** Stateless. Each request carries a SoulKey; the PDP issues a
  short-lived ES256 capability token (JWT) scoped to the granted resource/action/scope.
  Revocation is tracked in `_soulauth_revoked_tokens` (JTI-based).

- **Human sessions:** Cookie-based. The portal issues an httpOnly, secure, sameSite
  session cookie after OIDC authentication. Session validation checks the `_soul_users`
  table on each request.

---

## 4. Data Flow

### 4.1 LLM Request Lifecycle

```
AI Agent                SoulGate              SoulAuth           LLM Provider
   |                       |                     |                    |
   |  1. API request       |                     |                    |
   |  + SoulKey/API key    |                     |                    |
   +---------------------->|                     |                    |
   |                       |  2. Validate auth   |                    |
   |                       +-------------------->|                    |
   |                       |  3. Auth result     |                    |
   |                       |<--------------------+                    |
   |                       |                     |                    |
   |                       |  4. Rate limit chk  |                    |
   |                       |  (sliding window)   |                    |
   |                       |                     |                    |
   |                       |  5. Prompt inject   |                    |
   |                       |  scan (40+ rules)   |                    |
   |                       |                     |                    |
   |                       |  6. Circuit breaker |                    |
   |                       |  (check upstream)   |                    |
   |                       |                     |                    |
   |                       |  7. Forward request |                    |
   |                       +-------------------------------------------->
   |                       |                     |                    |
   |                       |  8. LLM response    |                    |
   |                       |<--------------------------------------------
   |                       |                     |                    |
   |                       |  9. Audit log entry |                    |
   |                       +-------------------->|                    |
   |  10. Response         |                     |                    |
   |<----------------------+                     |                    |
```

**SoulGate pipeline stages (in order):**

1. `validate_request_auth` -- SoulKey or API key validation via SoulAuth
2. `check_ip_access` -- IP allowlist/denylist filtering
3. `check_rate_limit` -- Sliding/fixed window rate limiting (per tenant/key/endpoint)
4. `scan_request` -- Payload size limits, content type validation
5. `scan_for_injection` -- 40+ regex patterns covering OWASP LLM Top 10
6. `get_breaker` -- Circuit breaker state check (closed/open/half-open)
7. Forward to upstream via httpx async client (connection pooling, configurable timeout)
8. `enqueue_log_entry` -- Async audit log write

### 4.2 Detection Pipeline

```
Audit Events          SoulWatch Pipeline        Anomaly Engine       Response
     |                       |                       |                  |
     |  1. Ingest event      |                       |                  |
     +---------------------->|                       |                  |
     |                       |  2. Run Sigma rules   |                  |
     |                       |  (YAML detection      |                  |
     |                       |   syntax, field match, |                 |
     |                       |   wildcards, agg)      |                 |
     |                       |                       |                  |
     |                       |  3. Check baselines   |                  |
     |                       +---------------------->|                  |
     |                       |                       |  4. Compare to   |
     |                       |                       |  agent profile:  |
     |                       |                       |  - request rate  |
     |                       |                       |  - resources     |
     |                       |                       |  - actions       |
     |                       |                       |  - time-of-day   |
     |                       |                       |  - denial rate   |
     |                       |                       |  - burst size    |
     |                       |                       |                  |
     |                       |  5. Anomaly detected  |                  |
     |                       |<----------------------+                  |
     |                       |                       |                  |
     |                       |  6. Evaluate quarantine policy          |
     |                       +---------------------------------------->|
     |                       |                       |  7. Automated    |
     |                       |                       |  response:       |
     |                       |                       |  - suspend_key   |
     |                       |                       |  - revoke_key    |
     |                       |                       |  - rate_limit    |
     |                       |                       |  - kill_session  |
     |                       |                       |  - force_reauth  |
     |                       |                       |  - isolate       |
     |                       |                       +----------------->
```

**Anomaly types detected:**

| Category | Types |
|----------|-------|
| Behavioral | `rate_spike`, `off_hours`, `new_resource`, `burst`, `denial_spike`, `scope_escalation` |
| Credential | `credential_stuffing`, `credential_rotation`, `impossible_travel` |
| Advanced Threat | `session_hijack`, `model_abuse`, `token_harvesting`, `data_poisoning` |
| Infrastructure | `lateral_movement`, `persistence`, `evasion`, `supply_chain`, `resource_abuse` |

### 4.3 Policy Decision Point (PDP) Flow

```
Request arrives with SoulKey
         |
         v
  +------+-------+
  | Resolve ID   |  hash key --> lookup in _soulkeys
  +------+-------+
         |
         v
  +------+-------+
  | Check expiry |  key expired? suspended? revoked?
  +------+-------+
         |
         v
  +------+-------+
  | Load policy  |  from _soulauth_policy_cache (synced from git)
  +------+-------+
         |
         v
  +------+--------+
  | Match rule    |  find first matching rule for resource:action:scope
  +------+--------+
         |
    +----+----+
    |         |
  GRANT     DENY
    |         |
    v         v
  Issue     Check delegation
  capability  (escalation path?)
  token       |
  (ES256,     +---> DENY (audit + reason)
   scoped,
   short-lived)
```

---

## 5. Security Architecture

### 5.1 Encryption

| Layer | Mechanism | Key Management |
|-------|-----------|----------------|
| SoulKey storage | SHA-512 one-way hash | Raw key shown once at issuance, never stored |
| IdP client secrets | Fernet (AES-128-CBC + HMAC-SHA256) | `SOULAUTH_OIDC_SECRET_KEY` env var |
| Capability tokens | ES256 (ECDSA P-256) JWT signatures | `SOULAUTH_JWT_PRIVATE_KEY_PATH` / `SOULAUTH_JWT_PUBLIC_KEY_PATH` |
| Database connections | TLS (PostgreSQL `sslmode=require` in production) | Cloud SQL managed certificates |
| Transit | HTTPS via Cloudflare | Cloudflare-managed edge certificates |

### 5.2 Prompt Injection Detection

SoulGate's `prompt_guard` module implements a risk-scoring model against 40+ regex
patterns aligned to the OWASP LLM Top 10:

```
Severity Weights:
  low      = 0.05
  medium   = 0.15
  high     = 0.25
  critical = 0.40

Thresholds:
  WARN  >= 0.30  (flag + audit)
  BLOCK >= 0.70  (reject + audit + alert)
```

Each matched pattern produces a `ThreatMatch` with severity, action (block/flag/sanitize),
category, and truncated matched text (200 char max for logging).

### 5.3 Audit Chain Integrity

The `_soulauth_audit` table maintains a hash chain for tamper evidence:

- Each audit row includes a `prev_hash` column containing the SHA-256 hex digest
  of the previous row in the chain.
- Genesis rows use the sentinel string `"genesis"`.
- Chain verification detects gaps, reordering, or retroactive modification.

### 5.4 Tenant Isolation

- **Database level:** All tables include a `tenant_id` column. Queries are scoped by
  tenant at the ORM layer.
- **API level:** Every authenticated request resolves to a tenant context. Cross-tenant
  access is denied by default.
- **Network level:** SoulGate and SoulWatch have no host port bindings -- they are
  accessible only within the `tiresias-net` Docker bridge.
- **Container hardening:** All containers run with `no-new-privileges`, `read_only`
  filesystem, all capabilities dropped (`cap_drop: ALL`), tmpfs for writable paths.

### 5.5 Tenant Hierarchy Model (v3.3.0)

Tiresias supports hierarchical multi-tenancy, where a parent tenant can provision and
manage child tenants. This enables SaaS and MSSP deployment models.

**Core concepts:**

- **SaaS master tenant:** The root of the hierarchy (`parent_tenant_id: null`,
  `hierarchy_depth: 0`). Tiresias Public operates as the SaaS master.
- **`parent_tenant_id`:** Foreign key on `_soul_tenants` linking a child to its parent.
  Null for root tenants.
- **`hierarchy_depth`:** Integer tracking nesting level. Root = 0, direct children = 1,
  grandchildren = 2, etc. Maximum depth enforced per tier.
- **Tier-based creation matrix:** Defines which tenant tiers can create which child tiers.
  For example, a `saas` tier tenant can create `enterprise`, `professional`, and `mssp`
  children; an `mssp` tenant can create `enterprise` and `professional` children.

**SaaS admin endpoints (`/v1/saas/admin/*`):**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/saas/admin/tenants` | GET | List all tenants in hierarchy |
| `/v1/saas/admin/tenants/provision` | POST | Provision a new child tenant (hierarchy-aware) |
| `/v1/saas/admin/tenants/{id}` | GET | Get tenant details with hierarchy context |
| `/v1/saas/admin/tenants/{id}` | PATCH | Update tenant (tier, settings, status) |
| `/v1/saas/admin/tenants/{id}/children` | GET | List direct children of a tenant |

MSSP provisioning now uses the hierarchy-aware `/v1/saas/admin/tenants/provision`
endpoint instead of the legacy MSSP-specific provisioning path. This unifies tenant
creation under a single code path with hierarchy validation.

### 5.6 Portal Security Hardening (v3.1.0)

The portal underwent a security hardening pass in v3.1.0:

- **Shared server-side libs:** Common authentication, authorization, and data-fetching
  logic extracted into shared modules to eliminate inconsistencies across routes.
- **Session verification on all routes:** Every dashboard route now verifies the session
  server-side before rendering. Previously, some routes relied on client-side checks only.
- **Error boundaries:** React error boundaries added at the layout level to prevent
  unhandled errors from leaking internal state or stack traces to the client.
- **Code rewrite phases:** DRY refactors across the portal codebase, security fixes
  for identified issues, and functional improvements to existing features.

### 5.7 Quarantine Policies

Tenants configure automated response policies in `_soulauth_quarantine_policies`:

| Field | Purpose |
|-------|---------|
| `trigger_type` | Anomaly type: `anomaly_score`, `credential_stuffing`, `scope_escalation`, `rate_spike`, or `any` |
| `threshold` | Numeric threshold for triggering (default: 0.8) |
| `severity_threshold` | Minimum anomaly severity: `low`, `medium`, `high`, `critical` |
| `action` | Comma-separated: `suspend_key`, `revoke_key`, `kill_session`, `force_reauth`, `rate_limit`, `isolate`, `reset_context` |
| `cooldown_minutes` | Minimum time between repeated triggers (default: 15) |
| `auto_release_hours` | Auto-release suspended keys after N hours (default: 1.0) |

### 5.8 Action Pipeline -- Inline Enforcement Between Cognition and Execution

SoulGate's proxy pipeline (5.1) governs requests *to* upstream APIs -- protecting the resources agents consume. The **action pipeline** governs the inverse: actions agents *produce*. When an agent framework decides to post a message, react to a thread, or send a DM, that intent passes through SoulGate before reaching the execution layer. This is an enforcement membrane between cognition and action -- transparent to the agent framework, opaque to the execution layer.

#### Design Rationale

AI agent frameworks combine reasoning with action. A simulation engine decides *what* to do; an execution layer (Slack adapter, API client, workflow runner) carries it out. Without an enforcement boundary between these stages, any action the cognition layer produces is immediately executed -- there is no policy check, no audit trail, no kill switch.

The action pipeline introduces a clean separation of concerns:

- **The agent framework** decides what to do (action intent).
- **SoulGate** decides whether it is allowed (policy evaluation, authentication, audit).
- **The execution layer** carries it out (platform-specific API calls).

This separation means policy changes take effect immediately without modifying agent code, denied actions never reach the execution layer, and every action decision -- permit or deny -- is recorded in the audit trail regardless of outcome.

#### Pipeline Architecture

```
  Agent Framework ──POST action intent──> SoulGate
                                            |
                                       1. Authenticate (soulkey -> SoulAuth)
                                       2. Rate limit check
                                       3. Action policy evaluation
                                       4. Audit log (always)
                                            |
                                +-----------+-----------+
                           [permitted]              [denied]
                                |                       |
                      Forward to action layer    Return denial to caller
                                |                  (policy, rule, reason)
                      Execute (Slack, API, etc)         |
                                |                  Log with full context
                      Return result upstream
```

The pipeline mirrors the 7-stage proxy pipeline in structure but operates on **action intents** rather than API requests. The enforcement point is identical: SoulGate authenticates the caller, evaluates policy, and makes a permit/deny decision before any downstream system is contacted.

#### Canonical Action Schema

All action intents are expressed as a **TiresiasAction** -- a canonical schema that serves as the universal contract between cognition and execution layers. Agent frameworks do not speak Slack API, Microsoft Graph, or any platform-specific protocol to SoulGate. They submit a TiresiasAction; SoulGate evaluates it; the execution layer translates it to platform-native calls.

**Action Types:**

| Type | Description |
|------|-------------|
| `POST_MESSAGE` | Post a message to a channel |
| `REPLY_IN_THREAD` | Reply within an existing thread |
| `REACT` | Add an emoji reaction to a message |
| `DM` | Send a direct message to a user |
| `SHARE_LINK` | Share a URL with optional preview |
| `PIN_MESSAGE` | Pin a message in a channel |
| `CREATE_CHANNEL` | Create a new channel |
| `DO_NOTHING` | Explicit no-op (simulation chose inaction) |

The `DO_NOTHING` type is architecturally significant: it allows cognition engines to record that they evaluated a situation and decided not to act, providing a complete audit trail of agent decision-making -- not just the actions taken.

**Request Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `action_id` | UUID | Unique identifier for this action intent |
| `tenant_id` | string | Tenant context for policy scoping |
| `persona_id` | string | Agent persona submitting the action |
| `action_type` | ActionType | One of the canonical action types above |
| `target` | ActionTarget | Platform, channel, and optional thread identifier |
| `content` | ActionContent | Text, emoji, link URL -- action-type-specific payload |
| `simulation_context` | dict (optional) | Opaque pass-through from the cognition engine |
| `timestamp` | datetime | UTC timestamp of intent creation |

**Target Model:**

| Field | Type | Description |
|-------|------|-------------|
| `platform` | string | Target platform identifier (e.g., `slack`, `teams`) |
| `channel` | string | Target channel or conversation identifier |
| `thread_ts` | string (optional) | Thread timestamp for threaded replies |

**Content Model:**

| Field | Type | Description |
|-------|------|-------------|
| `text` | string (optional) | Message text content |
| `emoji` | string (optional) | Emoji name for reactions |
| `link_url` | string (optional) | URL for link sharing |

The `simulation_context` field is an opaque dictionary passed through the pipeline without inspection. It allows cognition engines to attach metadata (simulation ID, reasoning trace, confidence scores) that the execution layer can use for logging or debugging. SoulGate does not evaluate this field for policy decisions -- it is purely a pass-through.

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `action_id` | UUID | Echo of the submitted action identifier |
| `status` | string | `executed`, `failed`, or `denied` |
| `result` | dict (optional) | Execution result from the action layer |
| `error` | string (optional) | Error description if `failed` |
| `denied_by` | DenialInfo (optional) | Policy name, rule name, level, and reason if `denied` |

#### Policy Evaluation Model

Action policy evaluation determines whether a permitted agent is allowed to perform a specific action at a specific time against a specific target. This is distinct from authentication (which verifies identity) and rate limiting (which caps volume).

**Monitor-Only Mode (Current)**

The action pipeline is currently deployed in **monitor-only mode**. Every action is permitted, and every decision is logged to the audit trail. This phase serves three purposes:

1. **Baseline construction**: Build a behavioral profile of normal action patterns per agent, per tenant, per action type.
2. **Policy development**: Operators review audit data to define appropriate restrictions before enforcement begins.
3. **Integration validation**: Confirm that the pipeline correctly intercepts, logs, and forwards all action types without disrupting agent operation.

Monitor mode is not a temporary state -- it is the first stage of a deliberate progression.

**Enforcement Mode (Planned)**

When enforcement is enabled, policy evaluation applies a **3-level intersection model**:

```
  Effective Policy = Org Policy INTERSECT Project Policy INTERSECT Agent Policy
                     (most restrictive wins)
```

| Level | Scope | Example |
|-------|-------|---------|
| **Organization** | All agents in the tenant | "No agent may create channels" |
| **Project** | Agents in a specific project | "Agents in #security may only post, not DM" |
| **Agent** | A specific persona | "analyst-bot may react and reply, not post" |

Permissions are intersected -- an action must be permitted at all three levels. This follows the same least-privilege principle as the SoulAuth PDP (3.2): authority is narrowed at each level, never broadened.

**Enforcement Progression:**

| Phase | Scope | Description |
|-------|-------|-------------|
| Phase 1 | Slack actions | Message posting, reactions, DMs, channel operations |
| Phase 2 | Workflow actions | Workflow triggers, task creation, status updates |
| Phase 3 | Project access | Cross-project action restrictions |
| Phase 4 | Data access | Content-aware policy (redaction, classification gates) |

Each phase is independently activatable per tenant. Tenants can enforce Slack action policies while leaving workflow actions in monitor mode.

#### Audit Trail

Every action decision is recorded in the **SoulGateActionLog** table -- a dedicated audit surface for action pipeline events. This table participates in the same hash-chain integrity system described in 3.3.

**Captured Fields:**

| Field | Description |
|-------|-------------|
| `tenant_id` | Tenant context |
| `soulkey_id` | Authenticated SoulKey |
| `persona_id` | Agent persona that submitted the action |
| `action_id` | Unique action identifier |
| `action_type` | Canonical action type |
| `target_platform` | Destination platform |
| `target_channel` | Destination channel |
| `decision` | `permit` or `deny` |
| `policy_name` | Policy that governed the decision (if enforced) |
| `rule_name` | Specific rule within the policy |
| `downstream_status` | HTTP status from the execution layer (null if denied) |
| `response_time_ms` | End-to-end pipeline latency |
| `simulation_id` | Correlation ID from the cognition engine |
| `source_ip` | Origin IP of the submitting agent framework |

The audit trail captures every action regardless of policy mode. In monitor mode, all decisions are `permit` with `policy_name: monitor-only`. When enforcement is enabled, denied actions include the full policy chain that produced the denial. This means operators can retroactively analyze what *would have been denied* under a candidate policy by querying monitor-mode logs.

#### Integration Points

**Agent Framework -> SoulGate:**

```
POST /gate/v1/actions/submit
Authorization: Bearer sk_agent_<tenant>_<persona>_<suffix>
Content-Type: application/json

{
  "action_id": "550e8400-e29b-41d4-a716-446655440000",
  "tenant_id": "acme",
  "persona_id": "miroshark-analyst",
  "action_type": "POST_MESSAGE",
  "target": {
    "platform": "slack",
    "channel": "#security-alerts"
  },
  "content": {
    "text": "Anomalous login pattern detected for service account svc-etl-03."
  },
  "simulation_context": {
    "simulation_id": "sim-2026-04-04-1847",
    "confidence": 0.92
  }
}
```

Authentication uses standard SoulKey credentials. The action pipeline reuses the same `validate_request_auth` path as the proxy pipeline -- no separate credential scheme.

**SoulGate -> Execution Layer:**

```
POST /api/v1/actions/execute
X-Tiresias-Token: <shared_token>
X-Tenant-ID: <tenant_id>
X-SoulKey-ID: <soulkey_id>
X-Persona-ID: <persona_id>
X-Forwarded-By: SoulGate/1.0
Content-Type: application/json

<TiresiasAction payload>
```

The execution layer (e.g., PicoClaw for Slack) receives the full TiresiasAction payload with identity headers injected by SoulGate. It authenticates inbound requests via the `X-Tiresias-Token` shared secret -- this token is never exposed to agent frameworks. The execution layer translates the canonical action into platform-native API calls (Slack Web API, Microsoft Graph, etc.).

**SaaS Console Telemetry:**

Action audit events are forwarded to the SaaS console alongside proxy audit events. The Portal provides centralized visibility into action patterns: volume by type, denial rates, latency distributions, and per-agent action histories.

**SoulWatch Integration:**

SoulWatch monitors action audit events using the same detection pipeline applied to proxy events. The behavioral anomaly detector builds action-specific baselines: normal posting frequency per agent, typical channels, expected action types. Deviations -- an agent that normally reacts suddenly posting high-volume messages, or an agent posting to channels it has never accessed -- trigger the standard detection and response pipeline.

---

## 6. Team RBAC Model (v3.3.0)

Tiresias v3.3.0 introduces a team-based organizational layer that sits between tenants and individual users. Teams group portal users for delegated access control and operational coordination.

### 6.1 Two-Layer Role Architecture

The role model operates at two independent layers:

```
Tenant (portal-level role)
  |
  +-- Team A (team-level role)
  |     +-- User 1: portal=admin, team=team_admin
  |     +-- User 2: portal=operator, team=analyst
  |
  +-- Team B (team-level role)
        +-- User 1: portal=admin, team=member
        +-- User 3: portal=viewer, team=analyst
```

**Effective permission resolution:** A user's effective permissions for a team-scoped operation are the intersection of their portal-level role permissions and their team-level role permissions. Portal-level permissions set the ceiling; team-level roles cannot grant more than the portal role allows.

### 6.2 Team Data Model

Three new database tables support the team model:

**`_soul_teams`** -- Team registry

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `tenant_id` | UUID FK | Owning tenant |
| `name` | VARCHAR | Team display name |
| `description` | TEXT | Team description |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last modification |

**`_soul_team_members`** -- Team membership with role

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `team_id` | UUID FK | References `_soul_teams` |
| `user_id` | UUID FK | References `_soul_users` |
| `role` | VARCHAR | Team role: `team_admin`, `analyst`, `member` |
| `joined_at` | TIMESTAMPTZ | When the user joined the team |

**`_soul_user_invites`** -- Pending user invitations

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `tenant_id` | UUID FK | Target tenant |
| `email` | VARCHAR | Invited email address |
| `team_id` | UUID FK | Pre-assigned team (optional) |
| `portal_role` | VARCHAR | Pre-assigned portal role |
| `team_role` | VARCHAR | Pre-assigned team role |
| `invited_by` | UUID FK | Inviting user |
| `status` | VARCHAR | `pending`, `accepted`, `expired`, `revoked` |
| `created_at` | TIMESTAMPTZ | Invitation timestamp |
| `expires_at` | TIMESTAMPTZ | Expiration timestamp |

**New fields on `_soul_users`:**

| Column | Type | Description |
|--------|------|-------------|
| `is_account_admin` | BOOLEAN | Account-level admin designation |
| `is_secondary_admin` | BOOLEAN | Secondary admin designation |
| `primary_team_id` | UUID FK | User's primary team for default context |

### 6.3 Invitation and JIT Provisioning Flow

The invitation system integrates with JIT provisioning to pre-assign team membership and roles:

```
Admin creates invite
  |
  +---> Invite record created (email, team, roles)
  |
  +---> User authenticates via OIDC (first login)
  |       |
  |       +---> JIT provisioning checks for pending invite
  |       |       |
  |       |       +---> Match found: assign pre-configured team + roles
  |       |       +---> No match: assign default role (viewer)
  |       |
  |       +---> Invite status set to "accepted"
  |
  +---> User is active with correct team membership
```

### 6.4 API Endpoint Summary

| Endpoint Group | Count | Description |
|----------------|-------|-------------|
| `/v1/users` | 4 | User CRUD (list, get, update, delete) |
| `/v1/teams` | 4 | Team CRUD (list, create, get, update, delete) |
| `/v1/teams/{id}/members` | 5 | Team member management (list, add, update role, remove) |
| `/v1/invites` | 4 | Invitation lifecycle (list, create, revoke, accept) |

See Chapter 31 (API Reference) for complete endpoint documentation with request/response schemas and curl examples.

---

## 7. Deployment Architecture

### 6.1 Production (GCP Cloud Run)

```
                     +-------------------+
                     |    Cloudflare     |
                     |  tiresias.network |
                     +--------+----------+
                              |
                  +-----------+-----------+
                  |                       |
          +-------v--------+     +-------v--------+
          |  Cloud Run:    |     |  Cloud Run:    |
          |  portal        |     |  soulauth      |
          |  (Next.js SSR) |     |  (FastAPI)     |
          +----------------+     +-------+--------+
                                         |
                              +----------+-----------+
                              |                      |
                     +--------v-------+    +---------v------+
                     |  Cloud Run:   |    |  Cloud Run:    |
                     |  soulwatch    |    |  soulgate      |
                     |  (sidecar)    |    |  (gateway)     |
                     +-------+-------+    +--------+-------+
                             |                     |
                             +----------+----------+
                                        |
                               +--------v--------+
                               |   Cloud SQL     |
                               |   PostgreSQL    |
                               +-----------------+
```

**Container registry:** `us-central1-docker.pkg.dev/salucainfrastructure/tiresias/`

**Build system:** Cloud Build (`cloudbuild.yaml`) builds all four images in parallel
on E2_HIGHCPU_8 machines with a 30-minute timeout.

### 6.2 Local Development (Docker Compose)

Six services orchestrated via `docker-compose.yml`:

| Service | Host Port | Internal Port | Exposed |
|---------|-----------|---------------|---------|
| `postgres` | 127.0.0.1:5432 | 5432 | localhost only |
| `soulauth` | 127.0.0.1:8000 | 8000 | localhost only |
| `soulgate` | -- | 8002 | internal only |
| `soulwatch` | -- | 8001 | internal only |
| `portal` | 127.0.0.1:3000 | 3000 | localhost only |
| `prometheus` | -- | 9090 | internal only |
| `alertmanager` | -- | 9093 | internal only |

All host-bound ports listen on `127.0.0.1` only (not `0.0.0.0`).

### 6.3 Service-to-Service Authentication

- **Internal API key:** SoulGate and SoulWatch authenticate to SoulAuth using
  `INTERNAL_API_KEY` (shared secret via environment variable).
- **Production plan:** Derived soulkeys per service, with per-node tailnet identity
  (not yet implemented -- see MCP Gateway auth roadmap).

### 6.4 DNS and Edge

| Domain | Points To | Purpose |
|--------|-----------|---------|
| `tiresias.network` | Cloudflare | Marketing site + API |
| `api.tiresias.network` | Cloud Run (soulauth) | Public API endpoint |
| `portal.tiresias.network` | Cloud Run (portal) | Management dashboard |

---

## 8. Database Schema Overview

All services share a single PostgreSQL 16 database. Tables are namespaced by prefix.

### 7.1 Table Groups

```
PostgreSQL Database
|
+-- _soul_*              (Shared / core)
|   +-- _soul_tenants         Tenant registry (id, slug, tier, Stripe ID, hierarchy)
|   +-- _soul_users           Human users (OIDC/local auth, role, IdP binding, admin flags)
|   +-- _soul_teams           Team registry (name, tenant, description)
|   +-- _soul_team_members    Team membership (user, team, team-level role)
|   +-- _soul_user_invites    Pending invitations (email, team, pre-assigned roles)
|
+-- _soulkeys                 Agent identity credentials (hash, status, expiry)
|
+-- _soulauth_*           (SoulAuth service)
|   +-- _soulauth_policy_cache    Resolved policies synced from git
|   +-- _soulauth_audit           Immutable audit trail (hash-chained)
|   +-- _soulauth_delegations     Temporary scope expansions
|   +-- _soulauth_quarantine_policies  Automated response configs
|   +-- _soulauth_revoked_tokens  JWT revocation list (JTI-based)
|   +-- _soulauth_trials          Self-service trial provisioning
|   +-- _soulauth_waitlist        Pre-launch email collection
|
+-- _soulwatch_*           (SoulWatch service)
|   +-- _soulwatch_baselines      Behavioral profiles per agent
|   +-- _soulwatch_anomalies      Detected anomalies with status tracking
|
+-- _soulgate_*            (SoulGate service)
    +-- _soulgate_api_keys        API key records (hashed, scoped, rotatable)
    +-- _soulgate_rate_limits     Rate limit policies (per tenant/key/endpoint)
    +-- _soulgate_upstreams       Upstream LLM provider configurations
```

### 7.2 Key Tables -- Detail

**`_soul_tenants`** -- Multi-tenant root

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `slug` | VARCHAR(63) | Unique, URL-safe identifier |
| `tier` | VARCHAR(50) | `community`, `professional`, `enterprise`, `mssp`, `saas` |
| `stripe_customer_id` | VARCHAR(255) | Billing integration |
| `parent_tenant_id` | UUID FK | Hierarchical multi-tenancy |
| `hierarchy_depth` | INT | Nesting level |

**`_soulkeys`** -- Agent identity

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `tenant_id` | UUID FK | Owning tenant |
| `persona_id` | TEXT | Agent persona identifier |
| `key_hash` | TEXT | SHA-512 hash (unique) |
| `status` | TEXT | `active` / `suspended` / `revoked` |
| `expires_at` | TIMESTAMPTZ | Optional TTL |
| `last_used_at` | TIMESTAMPTZ | Updated on each auth |

**`_soulauth_audit`** -- Hash-chained audit log

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `tenant_id` | UUID | Partition key |
| `event_type` | TEXT | e.g., `auth.grant`, `auth.deny`, `key.issued` |
| `soulkey_id` | UUID | Agent that triggered the event |
| `resource` | TEXT | Target resource |
| `decision` | TEXT | `grant` or `deny` |
| `prev_hash` | VARCHAR(64) | SHA-256 of previous row (chain integrity) |
| `context` | JSONB | Arbitrary event metadata |

**`_soulwatch_anomalies`** -- Detection output

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `soulkey_id` | UUID | Agent exhibiting anomaly |
| `anomaly_type` | VARCHAR(50) | e.g., `rate_spike`, `scope_escalation` |
| `severity` | VARCHAR(20) | `low`, `medium`, `high`, `critical` |
| `status` | VARCHAR(30) | `open`, `acknowledged`, `resolved`, `false_positive` |
| `evidence` | JSON | Supporting data for investigation |
| `baseline_value` | TEXT | Expected behavior |
| `observed_value` | TEXT | Actual behavior |

### 7.3 Index Strategy

All tables use targeted indexes for query patterns:

- **Tenant-scoped time queries:** `(tenant_id, timestamp DESC)` on audit tables
- **Key lookup:** `(key_hash)` unique index on `_soulkeys`
- **Active-only scans:** Partial indexes `WHERE status = 'active'`
- **Anomaly triage:** Composite indexes on `(anomaly_type)`, `(severity)`, `(soulkey_id)`

---

## Appendix: Source Tree Reference

```
tiresias-fix/
+-- src/                   SoulAuth application code
|   +-- auth/              Soulkey, OIDC, PDP, RBAC, delegation
|   +-- audit/             Audit logger
|   +-- billing/           Stripe integration, tier management
|   +-- database/          ORM models, connection, migrations
|   +-- detection/         Sigma engine, playbooks
|   +-- enforcement/       Quarantine, automated response
|   +-- idp/               IdP config, secret encryption
|   +-- keys/              Key management API
|   +-- license/           License validation, watchdog
|   +-- policy/            Policy loader, git sync
|   +-- siem/              CEF/syslog export, webhook forwarding
|   +-- tenant/            Tenant CRUD, offboarding
|   +-- tokens/            ES256 capability token issuance
|   +-- main.py            FastAPI app entry point
|
+-- soulGate/              SoulGate application code
|   +-- src/
|       +-- access/        IP allowlist/denylist
|       +-- auth/          Token validation (delegates to SoulAuth)
|       +-- circuit/       Circuit breaker (closed/open/half-open)
|       +-- inspection/    Payload scanner, prompt injection guard
|       +-- proxy/         Upstream gateway, request forwarding
|       +-- ratelimit/     Sliding/fixed window rate limiter
|       +-- audit/         Gateway audit logger
|       +-- monitoring/    Prometheus metrics
|
+-- soulWatch/             SoulWatch application code
|   +-- src/
|       +-- analytics/     Baseline engine, anomaly detector, risk scoring
|       +-- detection/     Sigma rule engine, playbooks
|       +-- pipeline/      Event ingestion and processing
|       +-- dashboard/     Dashboard data aggregation
|       +-- integrations/  External system connectors
|       +-- enforcement/   Automated response execution
|       +-- websocket/     Real-time event streaming
|
+-- portal/                Next.js management dashboard
|   +-- src/app/           App Router pages
|   +-- src/components/    UI components
|   +-- src/lib/           API clients, utilities
|
+-- database/              schema.sql (DDL for all tables)
+-- monitoring/            Prometheus config, alert rules
+-- docker-compose.yml     Local development orchestration
+-- cloudbuild.yaml        GCP Cloud Build pipeline
+-- Dockerfile             SoulAuth container
+-- Dockerfile.proxy       Tiresias Proxy container
```
