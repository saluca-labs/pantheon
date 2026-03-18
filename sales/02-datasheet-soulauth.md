# SoulAuth - Product Datasheet

**Agent Identity & Zero-Trust Authorization**

---

## Overview

SoulAuth is a zero-trust identity and authorization system purpose-built for AI agents. It provides cryptographic agent identity, just-in-time policy evaluation, and short-lived capability tokens - ensuring every agent request is verified against real-time policy before execution.

SoulAuth operates on a zero-knowledge architecture: it verifies identities and evaluates policies using metadata only. Agent payloads never touch the platform.

**Status**: Generally Available
**Version**: 1.0
**Deployment**: Docker, Kubernetes, or standalone

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

### Multi-Tenancy
- Row-level security (RLS) for complete tenant isolation
- Per-tenant policy namespaces and key hierarchies
- Independent audit trails per tenant

---

## Technical Specifications

| Specification | Detail |
|---|---|
| API | RESTful, 35+ endpoints |
| Authentication | Soulkey + capability tokens |
| Token Format | JWT ES256 |
| Identity Hash | SHA-512 |
| Database | PostgreSQL 16 with RLS |
| Policy Format | YAML with git sync |
| SDK | Python (SoulAuthClient) |
| CLI | 12 commands |
| Migrations | Alembic |
| Monitoring | Prometheus metrics, Grafana dashboards |
| Container | Docker Compose |
| Orchestration | Kubernetes-ready |

---

## Integration Points

- **SIEM**: Splunk, Elastic, Microsoft Sentinel, Syslog, Webhook
- **Notifications**: PagerDuty, Slack, Teams, OpsGenie
- **Source Control**: Git-based policy sync (GitHub, GitLab, Bitbucket)
- **Compliance**: SOC2, ISO 27001, NIST 800-53 report generation
- **Detection**: Sigma-compatible rule engine (7 built-in rules, 3 playbooks)

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
| **Community** | Free | 1 agent, 1,000 API calls/mo, basic policy, local SQLite, Python SDK + CLI |
| **Pro** | $15/agent/mo | Unlimited agents, 50K API calls/mo, full policy engine + git sync, capability tokens, key lifecycle, delegation, managed Postgres, email support (24h) |
| **Enterprise** | Custom | Unlimited API calls, user-agent ABAC with clearance hierarchy, SSO/SAML, custom policy consulting, on-premise option, dedicated account manager, 99.99% SLA |

Annual billing: 20% discount on all tiers.

---

## Use Cases

**Multi-Agent Orchestration** - Secure agent-to-agent communication with verified identities and scoped delegation chains.

**Compliance-Driven Environments** - Meet audit requirements with immutable policy versioning, full audit trails, and compliance report generation.

**Fleet Management at Scale** - Manage hundreds of agents with centralized policy, per-agent risk scoring, and automated quarantine for compromised agents.

**Zero-Trust Migration** - Replace implicit trust and long-lived API keys with cryptographic identity and just-in-time authorization.

---

*Saluca LLC | tiresias.saluca.com/platform/soulauth*
