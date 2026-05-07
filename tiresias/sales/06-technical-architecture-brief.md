# Tiresias v3.6.1 - Technical Architecture Brief

**For CISOs, Security Architects, and Engineering Leaders**

---

## Zero-Knowledge Architecture

Tiresias is built on a foundational principle: **we see threats, never data**.

The platform operates exclusively on metadata - agent identities, policy decisions, behavioral patterns, and traffic metrics. Agent payloads never touch our infrastructure. This is not a configuration option. It is the architecture.

### Data Flow Model

```
Your Infrastructure                          Tiresias Platform
+------------------+                        +---------------------------+
|                  |                        |                           |
|  AI Agent Fleet  |--- metadata only ----->|  SoulAuth (Identity)      |
|                  |                        |  SoulWatch (Monitoring)   |
|  (payloads stay  |<-- allow/deny ---------|  SoulGate (Gateway)       |
|   local)         |                        |  Tiresias Proxy (LLM Obs) |
+------------------+                        +---------------------------+
```

What flows to Tiresias:
- Agent identity assertions (soulkey hashes)
- Policy evaluation requests (action + resource metadata)
- Behavioral telemetry (call frequency, timing patterns, error rates)
- Traffic metadata (source, destination, method, status codes)

What never leaves your infrastructure:
- Agent payloads and prompt content
- User data processed by agents
- API response bodies
- Internal business logic

---

## Platform Components

### SoulAuth - Identity & Authorization Layer (176 API Endpoints)

**Purpose**: Establish and verify agent identity, evaluate authorization policy in real-time

**Architecture**:
- Soulkey identity system (SHA-512 cryptographic hashes)
- Just-in-time Policy Decision Point (JIT PDP)
- Capability token issuer (JWT ES256, short-lived)
- Policy-as-code engine with git sync
- Per-tenant rate limiting middleware with tier-based limits (60/min community through 1,000/min MSSP, owner unlimited)
- OIDC with PostgreSQL-backed nonce store (migration 0023) and state secret enforcement
- Password complexity enforcement (10+ chars, character classes, 500+ common password blocklist)
- Data export API (3 streaming endpoints: audit, keys, policies -- enterprise+ gated)

**Database**: PostgreSQL 16 with row-level security (RLS)
- Alembic-managed migrations (through migration 0023)
- Full tenant isolation via RLS policies
- Audit hash chain integrity (prev_hash column, assertion at startup)
- OIDC nonce table (`_soul_oidc_nonces`)
- Team RBAC tables (`_soul_teams`, `_soul_team_members`, `_soul_user_invites`)

**Key Design Decisions**:
- No standing permissions - every request evaluated at decision time
- Tokens scoped to action + resource, auto-expire
- Policies are YAML, versioned in git, deployed via sync
- Delegation chains maintain audit trail through full depth
- Failed auth attempts written to audit trail (3 event types: login, OIDC, LDAP)
- Investigation tokens hardened: secrets.token_urlsafe, TTL capped to 60 min, rate-limited, HMAC-verified
- Session cookies set httpOnly, secure, sameSite
- Stripe webhook endpoint secured with dual-mode auth

### SoulWatch - Monitoring & Detection Layer (55 API Endpoints)

**Purpose**: Real-time behavioral monitoring, anomaly detection, and automated response

**Architecture**:
- Async event pipeline for high-throughput ingestion
- Behavioral baseline engine (per-agent learning)
- 18-type anomaly detector (behavioral, temporal, volumetric)
- Sigma-compatible rule engine (7 rules, 3 playbooks)
- Risk scoring engine (composite 0-100)
- Quarantine orchestrator (7 response levels)
- Aletheia module: tool invocation audit, CoT chain verification

**Integration**:
- SIEM forwarding: Splunk HEC, Elastic, Azure Sentinel, Syslog, Webhook
- Notifications: PagerDuty, Slack, Teams, OpsGenie
- Dead letter queue for SIEM delivery reliability
- WebSocket live feed for real-time dashboards

**Key Design Decisions**:
- SoulWatch reads SoulAuth audit data but never writes to SoulAuth tables
- Quarantine orchestration calls SoulAuth admin API (not direct DB)
- Quarantine thresholds are policy-owner configurable, not hardcoded
- Compliance reports map to SOC2, ISO 27001, NIST 800-53

### SoulGate - Gateway & Enforcement Layer (~32 API Endpoints)

**Purpose**: API perimeter security with agent-aware request processing

**Architecture**:
- Reverse proxy with 7-step security pipeline
- Prompt injection detector (40+ OWASP patterns)
- Sliding window rate limiter (memory + DB, per-tenant/soulkey/endpoint)
- Circuit breaker (3-state: closed/open/half-open, anti-weaponization)
- API key manager (bcrypt hashing, rotation, revocation)
- IP/CIDR access controls (stdlib ipaddress)
- CoT policy enforcement

**Request Pipeline**:
```
Request -> Auth -> IP Check -> Rate Limit -> Circuit Breaker -> Inspect -> Proxy -> Audit
```

**Key Design Decisions**:
- SoulGate never writes to SoulAuth or SoulWatch tables
- Token validation: ES256 local verification + SoulAuth callback
- Audit logging is async and batched for performance
- Circuit breakers are per-upstream to prevent cascade failures

### Tiresias Proxy - LLM Observability Layer

**Purpose**: Multi-provider LLM proxy with cost tracking and session management

**Architecture**:
- Multi-provider support: Anthropic, OpenAI, Gemini, Groq, Ollama
- Cascade failover routing
- Envelope encryption (AES-256-GCM)
- Session tracking and replay
- Dashboard analytics (spend, latency, traces, sessions)
- Cross-tenant subtree expansion for all dashboard endpoints (MSSP visibility)
- Generic API proxy mode

---

## API Surface

| Component | Documented Endpoints | OpenAPI Spec |
|---|---|---|
| SoulAuth | 176 operations | `soulauth-v3.4.4.yaml` (11,015 lines) |
| SoulWatch | 55 operations | `soulwatch-v3.4.4.yaml` (1,641 lines) |
| SoulGate | ~32 operations | `soulgate-v3.4.4.yaml` (863 lines) |
| **Total** | **~263 operations** | Fully documented via OpenAPI |

---

## Deployment Architecture

### SaaS Topology (GCP Cloud Run)

```
+-------------------+     +-------------------+
|  Cloud Run        |     |  Cloud SQL        |
|                   |     |  (PostgreSQL 16)  |
|  - Portal         |---->|  - 47 tables      |
|  - SoulAuth :8000 |---->|  - RLS enabled    |
|  - SoulWatch:8001 |---->|  - Alembic mgmt   |
|  - SoulGate :8002 |     |                   |
|  - Proxy          |     +-------------------+
+---------+---------+
          |
   Domain Mapping + Cloudflare
          |
   tiresias.network (HTTPS)
```

### Docker Hub Images (v3.6.1)

All images published to Docker Hub under `salucalabs/`:
- `salucalabs/tiresias-portal`
- `salucalabs/tiresias-soulauth`
- `salucalabs/tiresias-soulwatch`
- `salucalabs/tiresias-soulgate`
- `salucalabs/tiresias-proxy`

### On-Premise Deployment

The entire stack runs as Docker Compose or Kubernetes manifests. Enterprise customers deploy within their own infrastructure with no external dependencies:

```bash
docker compose pull    # pulls v3.6.1 images from Docker Hub
docker compose up -d   # full platform running in under 15 minutes
```

Feature gate behavior: when licensing is disabled (self-hosted), install-tier caps are automatically skipped.

---

## Multi-Tenant Hierarchy (v3.6.1)

Tiresias supports a full tenant hierarchy for MSSP and SaaS deployments:

- **Hierarchy-aware provisioning**: parent-child tenant relationships with tier-based creation matrix
- **Cross-tenant subtree expansion**: admin endpoints (keys, audit) and proxy dashboards (spend, requests, latency) expand across child tenants
- **Tenant switcher UI**: dashboard header component for MSSP/SaaS/Owner tiers
- **Security hardening**: cycle detection, sibling guard, parent-chain walk (MAX_WALK=10)
- **Depth enforcement**: maximum hierarchy depth enforced per tier configuration

---

## Security Design Principles

1. **Zero Knowledge** - Payloads never transit the platform. Verification uses cryptographic proofs and metadata.

2. **Defense in Depth** - Four independent security layers (identity, monitoring, gateway, proxy) with clean separation of concerns.

3. **Least Privilege** - JIT authorization with short-lived tokens. No standing permissions. No implicit trust.

4. **Data Isolation** - Multi-tenant RLS. Each product uses its own table prefix. Cross-product communication uses APIs, not shared tables.

5. **Audit Everything** - Every authorization decision, anomaly detection, quarantine action, and API request is logged with tamper-evident audit trails (hash chain integrity with prev_hash).

6. **Privacy by Design** - GDPR Article 25 principles. Metadata-only processing. No data retention beyond audit logs.

---

## Database Schema (47 Tables)

| Product | Prefix |
|---|---|
| SoulAuth | _soul*, _soulauth_*, _soul_oidc_nonces, _soul_teams, _soul_team_members, _soul_user_invites |
| SoulWatch | _soulwatch_* |
| SoulGate | _soulgate_* |
| Aletheia | _aletheia_* |
| Proxy | tiresias_* |
| Shared | _soul_tenants, migrations |

All tables enforce RLS for tenant isolation. Cross-product data access is API-only.

---

## Observability

- **Prometheus Metrics** - All services expose standard /metrics endpoints
- **Grafana Dashboards** - Pre-built dashboards for all products
- **Health Checks** - /health endpoint per service with dependency checks
- **Structured Logging** - JSON-formatted logs with correlation IDs

---

## Compliance & Enterprise Readiness

### SaaS Production Readiness: 32/32 Checklist Items

| Framework | Coverage |
|---|---|
| **SOC 2** | Audit logging (hash-chain), access controls, policy versioning, monitoring, data export |
| **ISO 27001** | Annex A control mapping, risk scoring, incident response, password policy |
| **NIST 800-53** | Security control families, continuous monitoring, quarantine, failed auth tracking |
| **GDPR Art. 25** | Privacy by design, metadata-only processing, data minimization |

### Key Enterprise Controls (v3.6.1)
- Audit hash chain integrity (prev_hash assertion at startup, SystemExit if missing)
- Per-tenant rate limiting with tier-based configuration
- Password complexity (10+ chars, character classes, 500+ blocklist)
- Failed authentication audit trail
- OIDC nonce hardening (DB-backed, no in-memory state)
- Investigation token hardening (HMAC, TTL cap, rate limit)
- Session cookie security (httpOnly, secure, sameSite)
- Data export streaming API (enterprise+ gated)
- Stripe webhook dual-mode authentication

### Operational Documentation (8 Docs)
- OpenAPI specs (3 services, 263+ operations)
- Aletheia Guide (16 endpoints, 4 DB tables)
- CLI Reference (2 tools)
- SDK Reference (10 methods, 12 models)
- SIEM Integration Guide (5 connectors)
- Runbooks (8 failure-mode procedures)

---

*Saluca LLC | contact@saluca.com | https://tiresias.network | v3.6.1*
