# Tiresias - Technical Architecture Brief

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
|   local)         |                        |                           |
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

### SoulAuth - Identity & Authorization Layer

**Purpose**: Establish and verify agent identity, evaluate authorization policy in real-time

**Architecture**:
- Soulkey identity system (SHA-512 cryptographic hashes)
- Just-in-time Policy Decision Point (JIT PDP)
- Capability token issuer (JWT ES256, short-lived)
- Policy-as-code engine with git sync

**Database**: PostgreSQL 16 with row-level security (RLS)
- 6 tables: _soul_tenants, _soulkeys, _soulauth_audit, _soulauth_trials, etc.
- Alembic-managed migrations
- Full tenant isolation via RLS policies

**Key Design Decisions**:
- No standing permissions - every request evaluated at decision time
- Tokens scoped to action + resource, auto-expire
- Policies are YAML, versioned in git, deployed via sync
- Delegation chains maintain audit trail through full depth

### SoulWatch - Monitoring & Detection Layer

**Purpose**: Real-time behavioral monitoring, anomaly detection, and automated response

**Architecture**:
- Async event pipeline for high-throughput ingestion
- Behavioral baseline engine (per-agent learning)
- 8-type anomaly detector (behavioral, temporal, volumetric)
- Sigma-compatible rule engine (7 rules, 3 playbooks)
- Risk scoring engine (composite 0-100)
- Quarantine orchestrator (7 response levels)

**Database**: PostgreSQL 16 (shared cluster, isolated table prefix)
- 8 tables: baselines, anomalies, detections, quarantines, DLQ, custom rules, ingestion state, risk scores

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

### SoulGate - Gateway & Enforcement Layer

**Purpose**: API perimeter security with agent-aware request processing

**Architecture**:
- Reverse proxy with 7-step security pipeline
- Prompt injection detector (36 patterns)
- Sliding window rate limiter (memory + DB)
- Circuit breaker (3-state: closed/open/half-open)
- API key manager (bcrypt hashing, rotation, revocation)
- IP/CIDR access controls (stdlib ipaddress)

**Database**: PostgreSQL 16 (shared cluster, isolated table prefix)
- 7 tables: api_keys, rate_limits, access_rules, upstreams, request_log, circuit_states, threat_patterns

**Request Pipeline**:
```
Request -> Auth -> IP Check -> Rate Limit -> Circuit Breaker -> Inspect -> Proxy -> Audit
```

**Key Design Decisions**:
- SoulGate never writes to SoulAuth or SoulWatch tables
- Token validation: ES256 local verification + SoulAuth callback
- Audit logging is async and batched for performance
- Circuit breakers are per-upstream to prevent cascade failures

---

## Deployment Architecture

### Production Topology

```
+-------------------+     +-------------------+
|  staging-tiresias |     |  staging-infra    |
|  (100.116.160.125)|     |  (100.101.95.99)  |
|                   |     |                   |
|  Docker:          |     |  PostgreSQL 16    |
|  - SoulAuth :8000 |---->|  - soulauth DB    |
|  - SoulWatch:8001 |---->|  - RLS enabled    |
|  - SoulGate :8002 |---->|  - 23 tables      |
|  - Caddy   :8080  |     |                   |
+--------+----------+     +-------------------+
         |
  Cloudflare Tunnel
         |
  tiresias.network (HTTPS)
```

### Container Stack
- `soulauth-soulauth-1` - Core identity and auth service
- `soulauth-soulwatch-1` - Monitoring sidecar
- `soulauth-soulgate-1` - API gateway sidecar
- `soulauth-caddy-1` - Reverse proxy (routes /watch/*, /gate/*)

### On-Premise Option (Enterprise)
The entire stack runs as Docker Compose or Kubernetes manifests. Enterprise customers can deploy within their own infrastructure with no external dependencies.

---

## Security Design Principles

1. **Zero Knowledge** - Payloads never transit the platform. Verification uses cryptographic proofs and metadata.

2. **Defense in Depth** - Three independent security layers (identity, monitoring, gateway) with clean separation of concerns.

3. **Least Privilege** - JIT authorization with short-lived tokens. No standing permissions. No implicit trust.

4. **Data Isolation** - Multi-tenant RLS. Each product uses its own table prefix. Cross-product communication uses APIs, not shared tables.

5. **Audit Everything** - Every authorization decision, anomaly detection, quarantine action, and API request is logged with immutable audit trails.

6. **Privacy by Design** - GDPR Article 25 principles. Metadata-only processing. No data retention beyond audit logs.

---

## Database Schema (23 Tables)

| Product | Tables | Prefix |
|---|---|---|
| SoulAuth | 6 | _soul*, _soulauth_* |
| SoulWatch | 8 | _soulwatch_* |
| SoulGate | 7 | _soulgate_* |
| Shared | 2 | _soul_tenants, migrations |

All tables enforce RLS for tenant isolation. Cross-product data access is API-only.

---

## Observability

- **Prometheus Metrics** - SoulAuth + SoulWatch + SoulGate expose standard /metrics endpoints
- **Grafana Dashboards** - Pre-built dashboards for all three products
- **Health Checks** - /health endpoint per service with dependency checks
- **Structured Logging** - JSON-formatted logs with correlation IDs

---

## Compliance Readiness

| Framework | Coverage |
|---|---|
| **SOC 2** | Audit logging, access controls, policy versioning, monitoring |
| **ISO 27001** | Annex A control mapping, risk scoring, incident response |
| **NIST 800-53** | Security control families, continuous monitoring, quarantine |
| **GDPR Art. 25** | Privacy by design, metadata-only processing, data minimization |

SoulWatch generates exportable compliance reports mapped to each framework.

---

*Saluca LLC | contact@saluca.com | tiresias.network*
