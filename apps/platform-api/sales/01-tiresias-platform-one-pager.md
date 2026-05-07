# TIRESIAS PLATFORM

**Zero-Knowledge Agent Security for the Enterprise**

---

**Version 3.6.1 | Generally Available**

## The Problem

AI agents are the new attack surface. Every autonomous agent is an identity without governance - calling APIs, accessing data stores, and communicating with other agents with implicit trust and zero audit trails. Traditional IAM was never built for this.

- 73% of enterprises now deploy AI agents in production
- 12 implicit permissions per agent on average
- Zero visibility into agent-to-agent traffic

## The Solution

Tiresias is a zero-knowledge security platform purpose-built for AI agent infrastructure. Three integrated products deliver end-to-end protection - from identity to runtime monitoring to API enforcement - without ever accessing, storing, or transmitting your agent payloads.

**Metadata flows through. Data never does.**

---

## Three Products. One Platform.

### SoulAuth - Agent Identity & Zero-Trust Authorization
Cryptographic agent identity, just-in-time authorization, and policy-as-code. Every agent request is verified. No standing permissions. No implicit trust.

### SoulWatch - AI Runtime Security Monitoring
Real-time behavioral analytics for your agent fleet. Sigma-compatible detection rules, anomaly scoring, and automated alerting - without reading agent payloads.

### SoulGate - API Security Gateway
Secure the perimeter between your agents and the outside world. Rate limiting, prompt injection detection (40+ OWASP patterns), circuit breakers with anti-weaponization, and CoT policy enforcement at the API layer.

---

## How It Works

```
Agent Request --> SoulAuth (Identity & AuthZ) --> SoulWatch (Monitor) --> SoulGate (Enforce) --> Resource
```

1. **Identity** - Every agent gets a cryptographic soulkey (SHA-512). Hardware-bound, non-extractable, verifiable.
2. **Authorize** - Zero-trust policy evaluation on every request. JIT permissions, no standing access. Policies synced from git.
3. **Protect** - Runtime monitoring, behavioral anomaly detection, and automated quarantine. Seven response actions from alert to full isolation.

---

## Key Differentiators

| Capability | Tiresias | Traditional IAM | Agent Wrappers |
|---|---|---|---|
| Agent-native identity | Yes (Soulkey) | No | No |
| Zero-knowledge architecture | Yes | No | No |
| Runtime behavioral monitoring | Yes (SoulWatch) | No | Partial |
| Policy-as-code (git sync) | Yes | Partial | No |
| Prompt injection detection | Yes (40+ OWASP patterns) | No | Partial |
| SIEM integration | Native (Splunk, Elastic, Sentinel) | N/A | No |
| Sigma detection rules | Yes (SOC-compatible) | N/A | No |
| Automated quarantine | 7 graduated response actions | No | No |
| Multi-tenant with RLS | Yes | Varies | No |

---

## Enterprise Features

- **Policy-as-Code** - YAML policies versioned in git, deployed through CI/CD
- **SIEM Integration** - Native connectors for Splunk, Elastic, Microsoft Sentinel, Syslog, Webhook
- **Sigma Detection Rules** - SOC-compatible rules using your existing detection pipeline
- **Multi-Tenancy** - Tenant isolation with row-level security, per-tenant policy namespaces, hierarchy-aware provisioning
- **Tenant Hierarchy** - Parent-child tenant trees with tier-based creation matrix, cycle detection, and cross-tenant subtree visibility
- **Team RBAC** - Two-layer role model (portal-level + team-level), user management, invitation workflows
- **Per-Tenant Rate Limiting** - Tier-based request throttling from Open (60/min) through MSSP (unlimited)
- **Data Export** - Streaming export of audit logs, keys, and policies (enterprise+ gated)
- **Password Policy** - Enforced complexity (10+ chars, character classes, 500+ common password blocklist)
- **Failed Auth Audit Trail** - All failed login attempts logged (local, OIDC, LDAP)
- **Automated Quarantine** - Seven graduated response actions, policy-driven, audit-logged
- **Compliance Ready** - 31/32 SaaS production checklist items passing. GDPR Article 25 principles, exportable audit logs, SOC2/ISO 27001/NIST reporting
- **OIDC Hardening** - PostgreSQL-backed nonce store, state secret enforcement, session cookie security (httpOnly, secure, sameSite)

---

## Pricing

Products can be purchased independently or bundled for savings.

| Tier | Monthly | Annual | Includes |
|---|---|---|---|
| **Open** | Free | Free | 25 agents, 7-day retention |
| **Starter** | $49/mo | $488/yr ($40.67/mo) | 50 agents, 30-day retention |
| **Pro** | $199/mo | $1,982/yr ($165.17/mo) | 250 agents, 90-day retention |
| **Enterprise** | $2,499/mo | $24,890/yr ($2,074.17/mo) | Unlimited agents, custom retention |
| **MSSP** | $4,999/mo + $199/tenant/mo | Custom | Multi-tenant hierarchy |
| **Platform** | $14,999/mo + $10/tenant | Custom | SaaS embedding |
| **OEM** | $49,999-$199,999/mo | Custom | Full white-label |

Annual billing: 17% discount (2 months free). Startup program available (Platform Pro free for 12 months for qualified startups).

---

## Get Started

- **Free Tier**: Open tier, 25 agents, no credit card required
- **Website**: tiresias.network
- **Contact**: contact@saluca.com
- **Developer Docs**: tiresias.network/developers

---

*Saluca LLC | tiresias.network*
