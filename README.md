# Tiresias Platform

Enterprise LLM security: identity, policy enforcement, and runtime monitoring for AI agents.

**Version v3.4.4 | License: [BSL 1.1](LICENSE)**

## Products

**SoulAuth** -- Agent identity and zero-trust policy enforcement. SoulKey credentials (SHA-512), 8-stage Policy Decision Point, capability tokens (ES256 JWT, 300-900s TTL), immutable audit hash chain (SHA-256), policy-as-code from YAML/git, multi-tenancy, escalation and delegation, team RBAC with 7 roles, partner program with commissions engine, contract management with hash chain verification.

**SoulGate** -- API security gateway. Token-bucket rate limiting, circuit breaker, deterministic prompt injection detection, HTTP proxy with upstream routing, geo-IP and IP allowlisting, request/response audit logging.

**SoulWatch** -- Behavioral anomaly detection. 7-day sliding window baseline engine, Sigma rule engine, automated response playbooks, quarantine engine, SIEM forwarding (Splunk, Elastic, Syslog, Webhook, Azure Sentinel), CEF formatting, WebSocket live event streaming.

**Aletheia** -- Chain-of-thought audit layer. Cryptographic chains (SHA-512), AES-256-GCM encrypted storage, PII/secrets sanitization, CoT policy enforcement at proxy layer (inject/reject/warn), tool call evaluation.

**Portal** -- Next.js 16 + React 19 dashboard. 60+ pages covering all products, Stripe billing integration, partner management, contract viewer, policy playground, compliance reporting, Obsidian Flux design system.

## Architecture

```
                         +-----------+
                         |  Portal   |  Next.js 16 / React 19
                         +-----+-----+
                               |
              +----------------+----------------+
              |                |                |
        +-----+-----+   +-----+-----+   +------+------+
        |  SoulAuth  |   |  SoulGate  |   |  SoulWatch  |
        | Identity & |   | API Gateway|   |  Behavioral |
        |   Policy   |   | Rate Limit |   |  Monitoring |
        +-----+------+   +-----+-----+   +------+------+
              |                |                |
              |          +-----+-----+          |
              |          |  Aletheia |          |
              |          |  CoT Audit|          |
              |          +-----+-----+          |
              |                |                |
              +----------------+----------------+
                               |
                        +------+------+
                        |  Cloud SQL  |
                        |  PostgreSQL |
                        +-------------+
```

## Feature Matrix

| Capability | Status |
| --- | --- |
| SoulKey identity (SHA-512 credentials) | Built |
| Policy Decision Point (8-stage, YAML policy-as-code) | Built |
| Capability tokens (ES256 JWT, 300-900s TTL) | Built |
| Immutable audit hash chain (SHA-256, encrypted columns) | Built |
| Team RBAC (owner, admin, operator, viewer, team_admin, analyst, member) | Built |
| Delegation with TTL and scope | Built |
| Multi-tenancy and MSSP tenant isolation | Built |
| API gateway (rate limiting, circuit breaker, proxy) | Built |
| Prompt injection detection (rule-based) | Built |
| Geo-IP / IP allowlist enforcement | Built |
| Behavioral anomaly detection (18 types, 7-day baseline) | Built |
| Sigma detection engine | Built |
| SIEM connector configuration (per-tenant, Splunk/Elastic/Syslog/Webhook/Azure Sentinel) | Built |
| Notification channels (per-tenant) | Built |
| Automated response playbooks and quarantine | Built |
| Aletheia CoT chains (SHA-512, AES-256-GCM) | Built |
| CoT policy enforcement at proxy layer | Built |
| Local authentication (email/password, bcrypt, self-service password reset) | Built |
| LDAP / Active Directory authentication (LDAPS, self-signed cert support) | Built |
| Google OAuth / Generic OIDC (any OIDC IdP, PKCE, JIT provisioning) | Built |
| Stripe billing (6 tiers, metering, grace periods, webhooks) | Built |
| Partner program (Stripe Connect, commissions engine, invitations, promo codes) | Built |
| Contracts with hash chain verification and review workflow | Built |
| Investigation tokens (forensic audit access) | Built |
| Configurable login rate limiter | Built |
| Portal dashboard (60+ pages) | Built |
| Python SDK (`tiresias-sdk`, async) | Built |
| Python CLI (`soulauth` command) | Built |
| Go CLI shim (`tiresias-exec`, policy-gated execution) | Built |
| Prometheus metrics + Alertmanager | Built |
| GKE deployment (HPA, PDB, NetworkPolicy, non-root containers) | Built |
| JWT license validation with phone-home relay | Built |
| 19 database migrations (identity through team RBAC) | Built |

## Tech Stack

| Layer | Technology |
| --- | --- |
| Backend services | Python (FastAPI) |
| Portal | Next.js 16, React 19, TypeScript |
| CLI | Python (Click), Go |
| Database | PostgreSQL 16 (Cloud SQL), 19 Alembic migrations |
| Infrastructure | GKE, Cloud Build, Prometheus, Alertmanager |
| Auth | Local (bcrypt), LDAP/Active Directory, OIDC/Google |
| Billing | Stripe (6 tiers, webhooks, Stripe Connect for partners) |
| Container security | Trivy, non-root images |

## Quick Start

See [QUICKSTART.md](QUICKSTART.md) for setup instructions.

## Documentation

- [Architecture](ARCHITECTURE.md)
- [Specification](SPEC.md)
- [Setup Checklist](SETUP_CHECKLIST.md)
- [Changelog](CHANGELOG.md)
- [Security Policy](SECURITY.md)

## Links

- Production: [https://tiresias.network](https://tiresias.network)
- Company: [https://www.saluca.com](https://www.saluca.com)

## Roadmap

- Cloud KMS BYOK providers (AWS KMS, Google Cloud KMS, Azure Key Vault, HashiCorp Vault)
- Granular data access levels (read-only, hash-only, report-download)
- Team-scoped data filtering (detection events, investigations, quarantine)
- Admin-configurable role permissions per tenant
- GitHub and Okta OAuth providers
- LDAP group-based auto-provisioning enhancements

## License

[Business Source License 1.1](LICENSE) -- See LICENSE for details.

Built by [Saluca LLC](https://www.saluca.com)
