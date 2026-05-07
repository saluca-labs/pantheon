# Tiresias SaaS Licensing Guide

**For Platform Companies, System Integrators, and OEM Partners**

Saluca LLC | Version 1.0 | 2026-04-06

---

## 1. Who This Guide Is For

This guide is for organizations that want to integrate Tiresias into their own product or service offering and deliver it to their customers. If your question is "How do I embed agent security into MY platform and sell it to MY customers?", this document answers it.

**Target audience:**

- **SaaS platforms adding agent security to their offering.** Agent workflow platforms (Gumloop, Zapier, Make, n8n) that want governance built into every workflow their users create.
- **Multi-agent framework companies.** Framework providers (CrewAI, LangChain, AutoGen) that want identity, monitoring, and policy enforcement as a native capability in their SDK.
- **System integrators building managed AI services.** Consulting and services firms packaging AI infrastructure for enterprise clients, where agent security is a required component.
- **AI consulting firms packaging security into client engagements.** Firms delivering AI strategy or implementation that need a turnkey governance layer for each client deployment.
- **MSSPs scaling to dozens or hundreds of customer tenants.** Managed security service providers extending their SOC practice to cover AI agent infrastructure across their client base.

**This guide is NOT for:**
- Individual enterprises deploying Tiresias for internal use (see the Enterprise License Agreement)
- Developers evaluating Tiresias for a single project (see tiresias.network/pricing)
- Resellers referring customers without embedding the product (see the Partner Program One-Pager)

---

## 2. Licensing Models

Tiresias offers three licensing models for SaaS partners. The right model depends on how deeply you integrate and how you want to handle billing.

### Model A: Embedded / OEM License

Tiresias components run inside the partner's infrastructure. The partner's customers interact with Tiresias capabilities through the partner's own UI. Tiresias branding is fully removed.

| Property | Detail |
|----------|--------|
| Integration depth | Deep. SoulAuth, SoulWatch, and/or SoulGate run as services within the partner's stack. |
| Customer experience | White-label. End users see the partner's brand, not Tiresias. |
| Billing | Custom OEM agreement, typically volume-based (per-tenant or per-agent-band). |
| Pricing range | $49,999 to $199,999/mo depending on volume and scope. Multi-year terms. |
| Branding | Tiresias branding fully removed per OEM agreement. "Powered by" attribution negotiable. |
| Support | Dedicated partner success manager. Engineering integration support during buildout. |

**Use case:** "We want SoulAuth built into our agent platform so our customers get identity management natively, without knowing Tiresias exists."

**Best for:** Tier 1 agent platforms (10,000+ end users), framework companies embedding governance into their SDK, enterprise platforms where security must be invisible.

### Model B: Managed Service / Resale (MSSP)

The partner operates Tiresias as a managed service for their customers. The partner handles deployment, configuration, tenant provisioning, and first-line support. Tiresias provides the platform; the partner provides the service layer.

| Property | Detail |
|----------|--------|
| Integration depth | Operational. Partner deploys and manages Tiresias infrastructure. |
| Customer experience | Partner-branded via white-label configuration (custom CSS, logo, display name). |
| Billing | MSSP tier: $4,999/mo base + $199/tenant/mo. Volume discounts available. |
| Branding | "Powered by Tiresias" attribution required (negotiable at scale). |
| Support | Dedicated partner success manager. Partner handles L1 support; Saluca provides L2/L3. |
| Tenant provisioning | Via API (`POST /v1/mssp/tenants`) or Partner Portal. |

**Use case:** "We want to offer Tiresias as part of our managed security service. We deploy it, configure it per client, and bill our clients directly."

**Best for:** MSSPs adding agent security to their practice, managed AI services firms, consulting companies with ongoing client relationships.

### Model C: Referral / Integration Partner

The partner integrates with Tiresias APIs, but customers subscribe to Tiresias directly. The partner earns revenue share on referred customers.

| Property | Detail |
|----------|--------|
| Integration depth | Light. Partner's product connects to Tiresias via REST APIs. |
| Customer experience | Customers use Tiresias directly (Tiresias-branded). |
| Billing | Customers subscribe at standard tier pricing. Partner earns rev-share. |
| Rev-share | Default 25% of referred customer MRR (range: 10-40% based on volume). |
| Attribution | Lifetime. No cap, no sunset. Partner earns as long as the customer subscribes. |
| Support | Saluca handles all customer support. Partner provides integration guidance. |

**Use case:** "We want our platform to connect to Tiresias and recommend it to our users. When they subscribe, we earn a share."

**Best for:** Platforms with existing user bases that benefit from agent security, developer tool companies, complementary security vendors.

### Model Comparison

| Factor | OEM (Model A) | MSSP (Model B) | Referral (Model C) |
|--------|---------------|-----------------|---------------------|
| Revenue potential | Highest (custom pricing) | High (margin on managed service) | Moderate (25% rev-share) |
| Integration effort | High (SDK/API embedding) | Medium (deployment + operations) | Low (API integration) |
| Customer relationship | Partner owns entirely | Partner owns, Saluca supports | Saluca owns, partner refers |
| Time to revenue | 3-6 months | 1-3 months | 2-4 weeks |
| Minimum commitment | Multi-year OEM agreement | MSSP tier subscription | None (standard partner agreement) |

---

## 3. Deployment Architecture for SaaS Partners

Tiresias ships as self-hosted software by default. Every tier, from Open through MSSP, runs on the partner's own infrastructure via Docker Compose. No data leaves the partner's network unless they opt into the cloud proxy add-on.

### Deployment Modes

Tiresias supports three deployment modes, controlled by the `TIRESIAS_MODE` environment variable:

| Mode | Description | Default For | Infrastructure |
|------|-------------|-------------|----------------|
| `onprem` | Self-hosted. Local keys, local database, no cloud dependency. | All tiers (default) | Partner's Docker/K8s environment |
| `dedicated` | Single-tenant cloud pod, Saluca-managed. | Cloud proxy add-on (Enterprise/MSSP) | Saluca GKE cluster, dedicated namespace |
| `saas` | Shared multi-tenant cloud proxy, Saluca-managed. | Cloud proxy add-on (Starter/Pro) | Saluca GKE cluster, shared pool |

**Self-hosted (default):** The partner receives `docker-compose.production.yml` and a license JWT. They run `docker compose up -d` on their own hardware or cloud account. All audit logs, encryption keys, session data, and analytics stay local. License validation is the only external call, with a 72-hour grace period for air-gapped environments.

**Dedicated cloud pod:** For partners that want Saluca to manage infrastructure. Each partner (or each partner's customer) gets an isolated Kubernetes namespace with dedicated secrets, scaling policies, and network policies. Available as an add-on for Enterprise and MSSP tiers.

**Shared SaaS proxy:** For partners whose customers are on Starter or Pro tiers and want a managed cloud experience. Multi-tenant proxy with row-level isolation. Available as an add-on.

### Tenant Routing

All API requests are routed per-tenant using a Tiresias API key:

```
Authorization: Bearer tir_<tenant_slug>_<hex32>
```

Alternatively, if the `Authorization` header is already occupied by the LLM provider key:

```
X-Tiresias-Api-Key: tir_<tenant_slug>_<hex32>
```

The proxy resolves the tenant from the API key, sets tenant context for the request, and all downstream processing (audit logging, encryption, analytics, policy evaluation) is automatically scoped to that tenant.

### Tenant Isolation by Tier

| Tier | Isolation Level | Description |
|------|----------------|-------------|
| Starter/Pro | Row-level (shared database) | Postgres RLS policies enforce tenant boundaries. All queries scoped by `tenant_id`. |
| Enterprise | Schema-level or instance-level | Dedicated schema in shared database, or dedicated Cloud SQL instance per contract. |
| MSSP | Namespace-level | Dedicated Kubernetes namespace with own secrets, scaling, and network policies. |

### Zero-Knowledge Architecture

Tiresias operates exclusively on metadata. Agent payloads never transit Tiresias infrastructure. This is not a configuration option; it is the architecture.

**What flows to Tiresias:** Agent identity assertions (soulkey hashes), policy evaluation requests (action + resource metadata), behavioral telemetry (call frequency, timing, error rates), traffic metadata (source, destination, method, status codes).

**What never leaves the customer's infrastructure:** Agent payloads and prompt content, user data processed by agents, API response bodies, internal business logic.

This holds across all deployment modes. Partners embedding Tiresias can truthfully tell their customers: "Your data never touches our security layer."

---

## 4. Multi-Tenancy and Tenant Provisioning

### Provisioning Model

MSSP partners provision sub-tenants via the Partner Portal or the Tiresias API. Each sub-tenant is a fully isolated Tiresias instance with its own encryption keys, SoulKey scoping, data partitioning, and policy configuration.

**API provisioning:**

```
POST /v1/mssp/tenants
{
  "name": "Acme Corp",
  "slug": "acme-corp",
  "tier": "pro",
  "admin_email": "admin@acme.com"
}
```

**Response:** Tenant ID, admin SoulKey, API key (`tir_acme-corp_<hex32>`), and dashboard URL.

### Tier Constraints

Sub-tenants created by MSSP partners are subject to hard constraints enforced server-side:

| Rule | Enforcement |
|------|-------------|
| Allowed sub-tenant tiers | `open`, `starter`, `pro`, `enterprise` only |
| Blocked sub-tenant tiers | `mssp` and `saas` (hard block, 422 response) |
| Maximum hierarchy depth | 1 level below partner (flat children only, no nesting) |
| Sub-tenant cannot create children | Enforced at API and database level |
| Tier upgrade ceiling | Sub-tenants can upgrade up to `enterprise`, never to `mssp` or `saas` |

These constraints prevent hierarchy abuse and protect the billing model. A partner cannot create a sub-partner, and a sub-tenant cannot create its own sub-tenants.

### Tenant Lifecycle

```
Provision --> Configure --> Active --> Suspend --> Terminate
```

| State | Description |
|-------|-------------|
| Provision | Tenant record created, admin SoulKey issued, encryption keys generated. |
| Configure | Partner or tenant admin sets policies, SIEM destinations, alert channels. |
| Active | Fully operational. Agents authenticate, events are monitored, policies enforced. |
| Suspend | Tenant access disabled. Data preserved. Reactivation available via API or portal. |
| Terminate | Crypto-shredding executed. Encryption keys destroyed. Audit data purged after retention. |

### Per-Tenant Isolation

Each sub-tenant receives:

- **Isolated encryption keys.** Per-tenant Data Encryption Key (DEK) wrapped by the platform Key Encryption Key (KEK). BYOK support at Enterprise tier.
- **SoulKey scoping.** Agent identities are scoped to the tenant. Cross-tenant SoulKey validation is impossible by design.
- **Data partitioning.** Row-level security in Postgres. Every table includes a `tenant_id` column with RLS policies.
- **Independent policy configuration.** Each tenant defines its own cost limits, model restrictions, Sigma rules, and response playbooks.
- **Independent retention.** Data retention periods are per-tenant, enforced by automated purge jobs.

### Metered Billing

MSSP partners are billed via a single Stripe subscription:

```
$4,999/mo base (MSSP platform fee)
+ $199/tenant/mo (metered per active sub-tenant)
```

Each time a sub-tenant is provisioned, the metered usage on the partner's subscription is incremented. Monthly reconciliation verifies metered count matches actual tenant count. Partners set their own prices to end customers.

---

## 5. API Integration Points

Tiresias exposes a comprehensive API surface across its three products. SaaS partners integrate at whatever depth their use case requires.

### SoulAuth API (Agent Identity and Authorization)

| Category | Endpoints | Key Capabilities |
|----------|-----------|------------------|
| Agent Identity | 8+ endpoints | SoulKey registration, rotation, revocation, validation |
| Policy Evaluation | 6+ endpoints | Real-time policy decision point, capability token issuance |
| Authorization | 7+ endpoints | JIT authorization, delegation chains, permission evaluation |
| Audit | 5+ endpoints | Authorization decision logs, tamper-evident audit trails |
| Admin | 9+ endpoints | Tenant management, policy sync, key management |

**Core integration pattern:** Register agents via `POST /v1/soulkeys`, evaluate authorization via `POST /v1/auth/evaluate`, issue capability tokens via `POST /v1/auth/tokens`. All tokens are JWT ES256, short-lived, scoped to action + resource.

### SoulWatch API (Runtime Monitoring and Detection)

| Category | Endpoints | Key Capabilities |
|----------|-----------|------------------|
| Event Ingestion | 4+ endpoints | Behavioral telemetry, async event pipeline |
| Anomaly Detection | 6+ endpoints | 8-type anomaly detector, behavioral baselines |
| Detection Rules | 5+ endpoints | Sigma-compatible rules, custom rule authoring |
| Quarantine | 7+ endpoints | 7-level quarantine orchestration, automated response |
| Compliance | 5+ endpoints | SOC 2, ISO 27001, NIST 800-53 report generation |

**Core integration pattern:** Ingest agent telemetry, configure detection rules, subscribe to anomaly alerts, trigger quarantine actions. SoulWatch reads SoulAuth audit data but never writes to SoulAuth tables.

### SoulGate API (API Gateway and Enforcement)

| Category | Endpoints | Key Capabilities |
|----------|-----------|------------------|
| Request Inspection | 4+ endpoints | 7-step security pipeline, prompt injection detection (36 patterns) |
| Rate Limiting | 3+ endpoints | Sliding window rate limiter, per-tenant burst controls |
| Circuit Breaker | 3+ endpoints | Per-upstream circuit breakers (closed/open/half-open) |
| Access Control | 4+ endpoints | IP/CIDR access rules, API key management |
| Traffic Management | 5+ endpoints | Upstream configuration, request routing |

**Core integration pattern:** Route agent API traffic through SoulGate for inspection, rate limiting, and policy enforcement. SoulGate validates tokens locally (ES256) with SoulAuth callback.

### Cross-Cutting Integration

| Integration | Description |
|-------------|-------------|
| **Webhooks** | Real-time event notifications for anomalies, quarantine actions, policy violations, and tenant lifecycle events. |
| **SIEM Forwarding** | Native connectors for Splunk HEC, Elastic, Azure Sentinel, Syslog, and Webhook. Dead letter queue for delivery reliability. |
| **Notifications** | PagerDuty, Slack, Teams, OpsGenie integration for alerts. |
| **WebSocket** | Live feed for real-time dashboard updates. |
| **Prometheus Metrics** | Standard `/metrics` endpoints on all three services for observability. |
| **Grafana Dashboards** | Pre-built dashboards available for all three products. |

### Authentication

All APIs are authenticated via SoulKey, scoped per tenant. The SoulKey format is `sk_agent_<tenant>_<persona>_<hex32>`, with SHA-512 cryptographic hashing. Admin operations require admin-scoped SoulKeys.

---

## 6. White-Label and Branding

### MSSP Partners (Model B)

MSSP partners configure branding through the Partner Portal at `/dashboard/partner/settings`:

| Element | Customizable | Notes |
|---------|-------------|-------|
| Logo | Yes | Upload via Partner Portal. Displayed in tenant dashboards. |
| Display name | Yes | Replaces "Tiresias" in the UI header and navigation. |
| Custom CSS | Yes | Override colors, fonts, and layout accents. |
| Favicon | Yes | Custom browser tab icon. |
| "Powered by Tiresias" | Required | Small attribution in footer. Negotiable at scale. |
| Custom domain | Available | For dedicated deployment mode. Partner's domain resolves to their Tiresias instance. |

### OEM Partners (Model A)

OEM partners receive full UI customization rights per the OEM agreement:

| Element | Customizable | Notes |
|---------|-------------|-------|
| All branding | Yes | Tiresias branding fully removed. |
| UI/UX | Yes | Partner builds their own frontend against Tiresias APIs. |
| Attribution | Negotiable | "Powered by" not required by default for OEM. |
| Documentation | Yes | Partner writes their own docs referencing Tiresias APIs as internal services. |

### Referral Partners (Model C)

Referral partners do not receive white-label capabilities. Customers interact with the standard Tiresias-branded experience.

---

## 7. Pricing Structure for SaaS Partners

### Published Tiers (for Managed Service / MSSP Model)

| Tier | Monthly | Annual | Agents | Retention | Target |
|------|---------|--------|--------|-----------|--------|
| Open | Free | Free | 25 | 7 days | Evaluation, dev/test |
| Starter | $49/mo | $488/yr ($40.67/mo) | 50 | 30 days | Small teams, early production |
| Pro | $199/mo | $1,982/yr ($165.17/mo) | 250 | 90 days | Mid-market, compliance-conscious |
| Enterprise | $2,499/mo | $24,890/yr ($2,074.17/mo) | Unlimited | Custom | Regulated industries, large teams |
| MSSP | $4,999/mo base | Custom | Unlimited | Per-tenant | Managed security providers |
| SaaS/OEM | Custom | Custom | Unlimited | Custom | Platform companies (contact sales) |

All tiers include the full platform (SoulAuth + SoulWatch + SoulGate) and unlimited seats. Tiers are differentiated by agent capacity, retention, and compliance features.

### MSSP Unit Economics

| Tenant Count | Base | Per-Tenant | Total Monthly | Effective Per-Tenant |
|-------------|------|------------|---------------|---------------------|
| 10 tenants | $4,999 | $1,990 | $6,989 | $699 |
| 25 tenants | $4,999 | $4,975 | $9,974 | $399 |
| 50 tenants | $4,999 | $8,458* | $13,457 | $269 |
| 100 tenants | $4,999 | $14,925* | $19,924 | $199 |

*Volume discounts applied (see below).

### Volume Discounts (OEM/SaaS Partners)

| Tenant Volume | Discount | Effective Per-Tenant |
|--------------|----------|---------------------|
| 1-49 tenants | Standard | $199/tenant/mo |
| 50+ tenants | 15% off per-tenant fees | ~$169/tenant/mo |
| 100+ tenants | 25% off per-tenant fees | ~$149/tenant/mo |
| 500+ tenants | Custom pricing | Dedicated account management |

Volume commitments can be structured as annual or quarterly agreements. OEM pricing is fully custom and negotiated based on scope, volume, and contract term.

### Revenue Share (for Referral / Integration Partners)

| Parameter | Value |
|-----------|-------|
| Default rev-share | 25% of referred customer MRR |
| Range | 10-40% based on volume and engagement level |
| Attribution | Lifetime (no cap, no sunset) |
| Payout frequency | Monthly (minimum $50 threshold) |
| Payout method | Stripe Connect (bank transfer) |

### Channel Partner Margins (for Resellers)

| Tier | Margin |
|------|--------|
| Starter/Pro | 20% |
| Enterprise | 15% |
| Referral (no resale) | 15% of first-year revenue |

---

## 8. Compliance and Security

Tiresias is built for security-conscious buyers. The architecture is designed to satisfy compliance requirements without creating new data exposure risk.

### Compliance Frameworks

| Framework | Coverage | Key Controls |
|-----------|----------|-------------|
| **SOC 2 Type II** | Readiness | Audit logging, access controls, policy versioning, continuous monitoring |
| **ISO 27001** | Alignment | Annex A control mapping, risk scoring, incident response procedures |
| **NIST 800-53** | Controls | Security control families, continuous monitoring, quarantine orchestration |
| **GDPR Article 25** | By Design | Privacy by design, metadata-only processing, data minimization |

SoulWatch generates exportable compliance reports mapped to each framework.

### Security Architecture

| Principle | Implementation |
|-----------|---------------|
| **Zero-knowledge** | Customer payloads never transit Tiresias servers. Verification uses cryptographic proofs and metadata. |
| **Envelope encryption** | AES-256-GCM. Per-tenant Data Encryption Key (DEK) wrapped by Key Encryption Key (KEK). |
| **BYOK encryption** | Enterprise/MSSP tiers. Supports AWS KMS, HashiCorp Vault, Azure Key Vault, GCP Secret Manager. |
| **Tenant isolation** | Row-level security in Postgres. Cross-product communication via API only, never shared tables. |
| **Audit trails** | Immutable, tamper-evident logging of every authorization decision, anomaly detection, and quarantine action. |
| **Crypto-shredding** | On tenant offboarding: DEK destroyed, encrypted fields zeroed, data purged after retention period. |
| **Air-gap support** | License validation with 72-hour grace period. Full functionality without external network access. |

### For Partners Embedding Tiresias

When you embed Tiresias into your platform, the zero-knowledge architecture means you can truthfully represent to your customers that:

1. Their agent payloads never leave their infrastructure (self-hosted) or never leave the security boundary (dedicated cloud).
2. Encryption keys are per-tenant, with BYOK available for customers who require it.
3. Tenant data is cryptographically isolated, not just logically separated.
4. Offboarding includes crypto-shredding, not just soft deletion.

---

## 9. Support and SLA

### Partner Support Tiers

| Partner Model | Support Level | Includes |
|---------------|-------------|----------|
| OEM (Model A) | Dedicated | Named partner success manager, engineering integration support, quarterly business reviews |
| MSSP (Model B) | Dedicated | Named partner success manager, L2/L3 escalation support, monthly operational reviews |
| Referral (Model C) | Standard | Integration documentation, email support, partner portal access |

### SLA Commitments

| Tier | Uptime Target | P0 Response | P1 Response |
|------|--------------|-------------|-------------|
| Enterprise / MSSP / OEM | 99.9% monthly | 4 hours | 8 hours |
| Pro | 99.5% monthly | 1 business day | 2 business days |
| Starter | Best effort | 48 hours (email) | 5 business days |
| Open | Community support | GitHub issues | Community forums  |

### Service Credits

If Saluca fails to meet the applicable uptime target:

| Uptime Achieved | Credit (% of Monthly Fee) |
|----------------|--------------------------|
| 99.0% to < target | 5% |
| 95.0% to < 99.0% | 10% |
| 90.0% to < 95.0% | 20% |
| Below 90.0% | 30% |

Credits must be requested within 30 days. Maximum credit: 30% of monthly fee for the affected period.

### Escalation Path

```
Partner L1 Support --> Saluca Partner Support --> Saluca Engineering --> CTO
```

OEM and MSSP partners have direct access to Saluca engineering for P0 and P1 issues. Dedicated Slack or Teams channel provided during onboarding.

---

## 10. Getting Started

### Step 1: Initial Contact

Reach out to initiate the partnership conversation.

- **Email:** sales@saluca.com
- **Partner portal:** tiresias.network/partners (application form)
- **Existing customer?** Contact your account manager directly.

### Step 2: Technical Scoping Call

A 60-minute call with Saluca engineering to review:

- Your platform architecture and integration requirements
- Deployment model selection (self-hosted, dedicated, shared SaaS)
- Licensing model fit (OEM, MSSP, or Referral)
- Tenant volume projections and pricing structure
- Timeline and resource requirements

### Step 3: Pilot Program

30-day proof-of-concept with dedicated support:

- Full Pro or Enterprise access for the partner tenant
- Up to 5 sub-tenants for testing
- Dedicated engineering contact for integration questions
- Weekly check-in calls
- No commitment required to proceed

### Step 4: License Agreement Execution

Based on the selected licensing model:

- **OEM:** Custom OEM License Agreement (multi-year term)
- **MSSP:** MSSP Addendum to the Enterprise License Agreement
- **Referral:** Standard Partner Agreement (online execution)

### Step 5: Integration and Deployment

Saluca engineering provides hands-on support during buildout:

- Architecture review and deployment planning
- API integration guidance and SDK support
- Tenant provisioning workflow configuration
- White-label branding setup (MSSP/OEM)
- SIEM connector configuration
- Load testing and performance validation

### Step 6: Go-Live and Ongoing Management

- Partner success manager assigned for ongoing relationship
- Monthly (MSSP) or quarterly (OEM) business reviews
- Access to partner portal for tenant management, billing, and analytics
- Early access to new features and roadmap input
- Co-marketing opportunities (case studies, webinars, joint content)

---

## Appendix: Target Integration Scenarios

### Scenario 1: Agent Workflow Platform (Zapier/Make/Gumloop model)

**Partner profile:** SaaS platform where users build automated workflows involving AI agents. Thousands of users, each running multiple agents.

**Licensing model:** OEM (Model A)

**Integration architecture:**
- SoulAuth embedded for agent identity. Every agent spawned in the platform gets a SoulKey automatically.
- SoulWatch embedded for runtime monitoring. Anomaly detection runs on all agent activity, surfaced in the platform's existing monitoring UI.
- SoulGate as the default API gateway for all agent-to-LLM traffic. Prompt injection detection, rate limiting, and cost controls are platform features, not add-ons.

**Customer experience:** Users build workflows as they always have. Agent security is invisible. When they view their dashboard, they see governance metrics alongside performance metrics. They never interact with Tiresias directly.

**Unit economics:** OEM license at $49,999 to $199,999/mo, amortized across the platform's user base. At 10,000 active users, the per-user cost of embedded security is $5 to $20/mo, which the platform absorbs or passes through as a premium tier feature.

### Scenario 2: MSSP Adding Agent Security

**Partner profile:** Managed security provider with 50+ enterprise clients. Runs a 24/7 SOC. Clients are adopting AI agents and asking about governance.

**Licensing model:** MSSP (Model B)

**Integration architecture:**
- Full Tiresias stack deployed on partner infrastructure (Docker Compose or Kubernetes).
- Sub-tenants provisioned per client via the Partner Portal or API.
- Unified SOC dashboard with cross-tenant detection and quarantine views.
- SIEM forwarding configured per client (most use Splunk or Elastic).
- White-label branding so clients see the MSSP's brand.

**Customer experience:** Each client gets their own isolated Tiresias environment, managed by the MSSP. The MSSP handles deployment, policy configuration, and incident response. Clients see agent security as part of their managed service.

**Unit economics:** $4,999/mo base + $199/tenant/mo. At 50 tenants with volume discount: ~$13,457/mo total cost. If the MSSP charges clients $500 to $1,000/mo for agent security as a managed service, the margin is 60% to 80%.

### Scenario 3: AI Consulting Firm

**Partner profile:** Boutique AI consulting firm that delivers security assessments and architecture reviews for enterprise clients deploying agents. 10 to 20 active engagements at any time.

**Licensing model:** Referral (Model C) or MSSP (Model B) depending on engagement model.

**Integration architecture (Referral):**
- Firm recommends Tiresias Enterprise during client engagements.
- Client subscribes directly at Enterprise tier ($2,499/mo).
- Firm earns 25% rev-share ($624.75/mo) for the lifetime of the subscription.
- Firm assists with deployment and configuration as part of their consulting engagement.

**Integration architecture (MSSP):**
- Firm deploys Tiresias and provisions per-client tenants.
- Firm bundles Tiresias into their managed service offering.
- Ongoing monitoring and incident response as part of the retainer.

**Unit economics (Referral):** 15 active clients at Enterprise tier = $9,371/mo in passive rev-share income. No infrastructure cost. No ongoing operational burden.

**Unit economics (MSSP):** 15 tenants at $4,999 + ($199 x 15) = $7,984/mo cost. If the firm charges $2,000/mo per client for managed agent security, revenue is $30,000/mo against $7,984/mo cost.

### Scenario 4: Multi-Agent Framework (CrewAI/LangChain/AutoGen model)

**Partner profile:** Open-source or commercial multi-agent framework. Developers use the framework to build agent systems. The framework wants built-in governance as a differentiator.

**Licensing model:** OEM (Model A) for the commercial distribution; Referral (Model C) for the open-source community.

**Integration architecture:**
- SoulAuth SDK integrated into the framework's agent spawning code. When a developer creates an agent via `Agent(name="researcher")`, the framework automatically registers a SoulKey.
- SoulGate configured as the default API gateway. All agent-to-LLM calls route through SoulGate for inspection and policy enforcement.
- SoulWatch telemetry emitted automatically from the framework's runtime. Developers opt-in to the monitoring dashboard.
- Framework's CLI includes `framework auth setup` command that provisions a Tiresias tenant and configures keys.

**Customer experience:** Developers install the framework and optionally enable governance. When enabled, agent identity, monitoring, and gateway protection are active with zero additional configuration. The framework's documentation includes a "Security" section covering Tiresias-powered governance.

**Unit economics (OEM):** Custom OEM agreement priced on the framework's commercial user count. Open-source users that self-host Tiresias Open incur no cost. Commercial users on paid framework tiers get Tiresias Pro or Enterprise bundled.

**Unit economics (Referral):** Open-source users who upgrade to paid Tiresias tiers through the framework's integration generate 25% rev-share for the framework company. At 500 community-to-paid conversions per year, the framework earns meaningful passive revenue.

---

## Appendix: Key Contacts

| Role | Contact |
|------|---------|
| Sales inquiries | sales@saluca.com |
| Partner applications | tiresias.network/partners |
| Technical questions | contact@saluca.com |
| General information | tiresias.network |

---

*Saluca LLC | Governance-First AI-Security*
*This document is confidential and intended for prospective and current Tiresias SaaS partners.*
