# SoulAuth - Product Datasheet

**Agent Identity & Zero-Trust Authorization**

---

## Overview

SoulAuth is a zero-trust identity and authorization system purpose-built for AI agents. It provides cryptographic agent identity, just-in-time policy evaluation, and short-lived capability tokens - ensuring every agent request is verified against real-time policy before execution.

SoulAuth operates on a zero-knowledge architecture: it verifies identities and evaluates policies using metadata only. Agent payloads never touch the platform.

**Status**: Generally Available
**Version**: 3.6.1
**Deployment**: Docker, Kubernetes, or standalone
**Docker Hub**: salucalabs/tiresias-soulauth

---

## Core Capabilities

### Soulkey Identity System
- SHA-512 cryptographic agent identities
- Full key lifecycle: issue, rotate, suspend, reinstate, revoke
- Hardware-bound, non-extractable identity credentials
- Agent metadata registration (type, owner, capabilities)

### Zero-Trust Policy Engine
- Just-in-time Policy Decision Point (JIT PDP)
- Attribute-based access control (ABAC)
- Policy-as-code in YAML, version-controlled via git sync
- No standing permissions - every request evaluated in real-time

### Capability Tokens
- Short-lived JWT tokens signed with ES256
- Scoped to specific actions and resources
- Automatic expiration, no token refresh chains
- Verifiable by any service in your infrastructure

### Delegation & Escalation
- Agent-to-agent delegation with policy constraints
- Escalation workflows for elevated permissions
- Full delegation chain audit trail

### Multi-Tenancy & Tenant Hierarchy
- Row-level security (RLS) for complete tenant isolation
- Per-tenant policy namespaces and key hierarchies
- Independent audit trails per tenant
- Parent-child tenant hierarchy with tier-based creation matrix
- Cross-tenant subtree expansion for keys and audit
- Hierarchy permission hardening (cycle detection, sibling guard, parent-chain walk)
- SaaS admin endpoints for tenant lifecycle management
- MSSP provisioning via hierarchy-aware endpoint

### Team RBAC & User Management
- Two-layer role model: portal-level (owner/admin/operator/viewer) + team-level (team_admin/analyst/member)
- User CRUD, team management, and invitation workflows (17 new API endpoints)
- Account admin and secondary admin designations
- JIT user provisioning honors pending team invites

### Per-Tenant Rate Limiting
- Tier-based request throttling (Open 60/min through MSSP unlimited)
- Middleware-enforced, configurable per tier

### Data Export
- 3 streaming export endpoints: audit logs, keys, policies
- Enterprise+ tier gated

### Password Policy & Auth Hardening
- Minimum 10 characters, character class enforcement, 500+ common password blocklist
- Failed auth attempts logged to audit trail (local, OIDC, LDAP)
- Investigation token hardening (cryptographic tokens, 60-min TTL, rate limiter)
- OIDC nonce store backed by PostgreSQL (not in-memory)
- OIDC state secret enforcement at startup
- Session cookie security (httpOnly, secure, sameSite)

---

## Technical Specifications

| Specification | Detail |
|---|---|
| API | RESTful, 176 operations |
| Authentication | Soulkey + capability tokens |
| Token Format | JWT ES256 |
| Identity Hash | SHA-512 |
| Database | PostgreSQL 16 with RLS |
| Policy Format | YAML with git sync |
| Auth Modes | Local, LDAP, OIDC (Google SSO) |
| SDK | Python (SoulAuthClient, 10 methods, 12 models) |
| CLI | 12 commands |
| Migrations | Alembic |
| Monitoring | Prometheus metrics, Grafana dashboards |
| Rate Limiting | Per-tenant, tier-based |
| Container | Docker Compose |
| Orchestration | Kubernetes-ready (GCP Cloud Run verified) |

---

## Integration Points

- **SIEM**: Splunk, Elastic, Microsoft Sentinel, Syslog, Webhook
- **Notifications**: PagerDuty, Slack, Teams, OpsGenie
- **Source Control**: Git-based policy sync (GitHub, GitLab, Bitbucket)
- **Compliance**: SOC2, ISO 27001, NIST 800-53 report generation
- **Detection**: Sigma-compatible rule engine (7 built-in rules, 3 playbooks)
- **Export**: Streaming data export (audit, keys, policies)

---

## Architecture

```
Your Infrastructure                    SoulAuth
+------------------+                  +---------------------------+
|   AI Agent       |--- metadata ---->| Soulkey Verification      |
|   (keeps data)   |                  | Policy Decision Point     |
|                  |<-- allow/deny ---| Capability Token Issuer   |
+------------------+                  | Audit Logger              |
                                      | Anomaly Detection Sidecar |
                                      +---------------------------+
                                               |
                                      +---------------------------+
                                      | PostgreSQL 16 (RLS)       |
                                      | Alembic Migrations        |
                                      +---------------------------+
```

**Key principle**: Agent payloads never leave your infrastructure. SoulAuth operates on metadata only.

---

## Pricing

| Tier | Price | Includes |
|---|---|---|
| **Open** | Free | 25 agents, 7-day retention, basic policy, Python SDK + CLI |
| **Starter** | $49/mo | 50 agents, 30-day retention, rate limiting (60/min), basic team management |
| **Pro** | $199/mo | 250 agents, 90-day retention, full policy engine + git sync, capability tokens, key lifecycle, delegation, managed Postgres, team RBAC, email support (24h) |
| **Enterprise** | $2,499/mo | Unlimited agents, custom retention, user-agent ABAC with clearance hierarchy, SSO/SAML, data export, password policy enforcement, custom policy consulting, on-premise option, dedicated account manager, 99.99% SLA |
| **MSSP** | $4,999/mo + $199/tenant/mo | Multi-tenant hierarchy, cross-tenant visibility, tenant provisioning, per-tenant rate limiting (1,000/min) |

Annual billing: 17% discount (2 months free).

---

## Use Cases

**Multi-Agent Orchestration** - Secure agent-to-agent communication with verified identities and scoped delegation chains.

**Compliance-Driven Environments** - Meet audit requirements with immutable policy versioning, full audit trails, and compliance report generation.

**Fleet Management at Scale** - Manage hundreds of agents with centralized policy, per-agent risk scoring, and automated quarantine for compromised agents.

**Zero-Trust Migration** - Replace implicit trust and long-lived API keys with cryptographic identity and just-in-time authorization.

---

*Saluca LLC | tiresias.network/platform/soulauth*
