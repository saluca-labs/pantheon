# Tiresias v3.6.1 - Sales Playbook

**For Sales Engineers and Sales Executives**

---

## What Is Tiresias?

Tiresias is a zero-knowledge security platform for AI agent infrastructure. Named after the blind prophet of Greek mythology who could see what others could not, Tiresias sees threats without ever seeing data.

Four products. One platform:
- **SoulAuth** - Agent identity and zero-trust authorization (176 API endpoints)
- **SoulWatch** - Runtime security monitoring and threat detection (55 API endpoints)
- **SoulGate** - API security gateway with prompt injection protection (~32 API endpoints)
- **Tiresias Proxy** - Multi-provider LLM observability with cost tracking

**Company**: Saluca LLC (sole founder: Cristian)
**Website**: https://tiresias.network
**Contact**: contact@saluca.com
**Docker Hub**: salucalabs/* (v3.6.1)

---

## Ideal Customer Profile (ICP)

### Primary Targets
- **Enterprise AI/ML teams** deploying autonomous agents in production
- **Security teams** responsible for AI infrastructure governance
- **Platform engineering teams** building internal agent frameworks
- **Regulated industries** (finance, healthcare, government) with compliance mandates
- **MSSPs** managing agent security across multiple customer tenants

### Buyer Personas

| Persona | Title | Cares About | Product Focus |
|---|---|---|---|
| Security Champion | CISO, VP Security | Risk reduction, compliance, audit trails | Full platform |
| Platform Builder | VP Engineering, CTO | Developer experience, integration, scale | SoulAuth + SoulGate |
| SOC Lead | Security Operations Manager | Detection, SIEM integration, MTTR | SoulWatch |
| Compliance Lead | GRC Manager, Audit Lead | SOC2, ISO 27001, NIST reporting | SoulWatch + SoulAuth |
| MSSP Director | VP Managed Services | Multi-tenant, per-tenant billing, hierarchy | MSSP tier |

### Qualification Signals
- Running 10+ AI agents in production
- Evaluating or building agent-to-agent communication
- Active compliance requirements (SOC2, ISO, NIST)
- Security concerns about LLM/agent deployments
- Budget for agent infrastructure tooling
- Using Splunk, Elastic, or Sentinel (SoulWatch lands easily)
- Managing multiple customer environments (MSSP opportunity)

---

## Discovery Questions

### Opening
1. "How many AI agents are you running in production today? How do you expect that to grow?"
2. "How do your agents authenticate to each other and to external services?"
3. "What visibility do you have into what your agents are actually doing at runtime?"

### Pain Discovery
4. "If an agent was compromised today, how would you know? How quickly could you isolate it?"
5. "How are you managing API keys across your agent fleet? Who has access to rotate them?"
6. "What does your agent authorization model look like? Standing permissions, or something more dynamic?"
7. "How does your security team get visibility into agent behavior today? Does it flow to your SIEM?"

### Compliance & Governance
8. "What compliance frameworks are you subject to? SOC2, ISO, NIST?"
9. "How do you demonstrate agent governance to auditors today?"
10. "Is privacy a concern with your current agent security tools? Do they inspect payloads?"
11. "Do you have a password policy for service accounts and agent credentials? How do you enforce it?"

### Technical Depth
12. "What does your agent deployment look like? Kubernetes? Docker? Serverless?"
13. "Do your agents delegate tasks to other agents? How do you trace those chains?"
14. "What SIEM or observability platform does your SOC use?"
15. "Do you need to manage agent security across multiple customer tenants?"

---

## Positioning by Persona

### For CISOs / VP Security
**Lead with**: Risk reduction, enterprise readiness, and zero-knowledge architecture
**Key message**: "Tiresias gives you complete visibility into your AI agent fleet without creating a new data exposure risk. Zero-knowledge means we verify identities and detect threats using metadata only - your agent payloads never touch our platform. We pass 32/32 on our SaaS production readiness checklist."
**Proof points**: Automated quarantine (7 levels), compliance reports, tamper-evident audit trails with hash-chain integrity, per-tenant rate limiting, password complexity enforcement, failed auth audit trail

### For CTOs / VP Engineering
**Lead with**: Developer experience, API completeness, and deployment simplicity
**Key message**: "Deploy in under 15 minutes with Docker. 176 API endpoints documented via OpenAPI. Python SDK, YAML policies synced from git. Your developers define authorization policies the same way they define infrastructure."
**Proof points**: Python SDK, git-sync policies, Docker Compose (`docker compose pull && up`), 263+ REST APIs across 3 OpenAPI specs, 8 operational docs

### For SOC Managers
**Lead with**: SIEM integration, Sigma rules, and behavioral baselines
**Key message**: "SoulWatch plugs directly into your existing SOC workflow. Native Splunk, Elastic, and Sentinel connectors. Sigma-compatible detection rules your team already knows how to write. Per-agent behavioral baselines detect anomalies before they become incidents."
**Proof points**: 5 SIEM connectors, 7 Sigma rules, PagerDuty/Slack/Teams alerts, dead letter queue reliability, 18-type anomaly detection, per-agent behavioral baselines

### For GRC / Compliance
**Lead with**: Compliance reporting, audit trails, and data export
**Key message**: "SoulWatch generates SOC2, ISO 27001, and NIST 800-53 compliance reports from real-time monitoring data. Every authorization decision, every anomaly, every quarantine action is immutably logged with hash-chain integrity. Streaming data export API for enterprise auditors."
**Proof points**: 3 compliance frameworks, tamper-evident audit logs (prev_hash chain), data export API (audit, keys, policies), policy versioning, GDPR Article 25 design, password complexity enforcement

### For MSSP Directors
**Lead with**: Multi-tenant hierarchy and cross-tenant visibility
**Key message**: "Tiresias is built for managed security. Full parent-child tenant hierarchy with cross-tenant visibility into keys, audit, spend, and latency. Tenant switcher UI in the dashboard. Provision new tenants via API. Per-tenant billing from $199/tenant."
**Proof points**: Hierarchy-aware provisioning, cross-tenant subtree expansion, tenant switcher UI, per-tenant rate limiting, white-label branding

---

## Competitive Landscape

### vs. Traditional IAM (Okta, Auth0, Azure AD)
**Their gap**: Built for human users, not AI agents. No concept of agent identity, behavioral monitoring, or prompt injection protection.
**Our advantage**: Purpose-built for agents. Soulkey identity, JIT authorization, runtime monitoring, automated quarantine. Per-agent behavioral baselines. Cedar policy engine.
**Messaging**: "Traditional IAM doesn't know what an AI agent is. Tiresias was built for nothing else."

### vs. API Gateways (Kong, Apigee, AWS API Gateway)
**Their gap**: Traffic management without agent awareness. No behavioral monitoring, no agent identity, no prompt injection detection.
**Our advantage**: Agent-native identity, per-agent behavioral baselines, 40+ prompt injection patterns (OWASP), integrated monitoring, per-tenant rate limiting with tier-based configuration.
**Messaging**: "API gateways manage traffic. SoulGate understands agents."

### vs. Agent Wrappers (Guardrails, LangChain Security)
**Their gap**: Application-layer only. No infrastructure-level identity, no fleet-wide monitoring, no multi-tenant isolation.
**Our advantage**: Infrastructure-level security. Works across any agent framework. Fleet-wide visibility. 176 documented API endpoints. Audit hash chain integrity.
**Messaging**: "Wrappers protect one agent. Tiresias protects the fleet."

### vs. Build-Your-Own
**Their gap**: Months of engineering time, no behavioral monitoring, no compliance reporting.
**Our advantage**: Deploy in 15 minutes. 263+ endpoints across four products. 47 database tables. 8 operational docs. Battle-tested on GCP Cloud Run.
**Messaging**: "You could build this. But should you? And can you maintain it?"

---

## Objection Handling

### "We already have IAM."
"Traditional IAM is great for human users. But your AI agents need agent-native identity - cryptographic soulkeys, just-in-time authorization, behavioral monitoring. Tiresias doesn't replace your IAM, it extends your security perimeter to cover your agent fleet."

### "We're not ready - only running a few agents."
"That's actually the ideal time. Open tier is free forever for up to 25 agents. Start with identity governance now, before your fleet grows and implicit trust becomes technical debt. Most security leaders wish they'd started identity early."

### "We're concerned about adding another data exposure point."
"That's exactly why we built zero-knowledge architecture. Your agent payloads never touch our platform - period. We operate on metadata only. Tiresias is the security tool that can't see your data, by design."

### "The budget isn't there right now."
"Open is free for up to 25 agents. Starter is $49/month flat for 50 agents -- not per agent, per platform. For a 10-agent fleet, that's under $5/agent/month for complete identity, monitoring, and gateway protection."

### "We need to evaluate this with our security team."
"Absolutely. Here's our technical architecture brief [hand over doc 06]. The 14-day trial gives full Pro access to everything with no credit card. Your team can deploy to a staging environment and validate the architecture themselves. We also have full OpenAPI specs for all 263+ endpoints."

### "How is this different from what we could build internally?"
"You could build it - we know because we did. That's 263+ API endpoints, 47 database tables, Sigma rule engine, 5 SIEM integrations, behavioral baseline learning, prompt injection detection, and 8 operational runbooks. The question is: how many months and how many engineers? And who maintains it?"

### "Is it enterprise-ready?"
"We pass 32/32 on our SaaS production readiness checklist, independently verified. That includes: audit hash chain integrity, per-tenant rate limiting, password complexity enforcement with a 500+ common password blocklist, OIDC hardening with DB-backed nonce store, failed auth audit trail, session cookie security, investigation token hardening, and streaming data export API. This is not a beta."

### "What about vendor lock-in?"
"Standard APIs with full OpenAPI documentation. YAML policies stored in your git repo. On-premise deployment via Docker Compose - pull our images from Docker Hub and run entirely in your infrastructure. Your data never leaves your infra."

---

## Sales Motions

### Motion 1: Start with SoulAuth (Land)
**Best for**: Teams just starting agent security
**Path**: Open (free, 25 agents) -> Starter ($49/mo) -> Pro ($199/mo) -> Platform Bundle
**Timeline**: Free to Starter in 30-60 days as agent count grows
**Talk track**: "Start with agent identity. It's the foundation. Everything else builds on it."

### Motion 2: SOC-Led (SoulWatch Entry)
**Best for**: Security teams with existing SIEM
**Path**: Open -> Pro (SIEM integration) -> Full Platform
**Timeline**: Open to Pro in 30 days once SIEM value is proven
**Talk track**: "Let's get your agent fleet feeding into your SOC. Sigma rules, Splunk connector, same workflow your team already runs."

### Motion 3: Platform Deal (Top-Down)
**Best for**: Enterprise with compliance mandate or security initiative
**Path**: Platform Pro trial -> Platform Enterprise
**Timeline**: 14-day trial -> 30-day evaluation -> enterprise contract
**Talk track**: "Full platform. Identity, monitoring, gateway, observability. One vendor, one deployment, one bill. 32/32 enterprise readiness."

### Motion 4: MSSP Expansion
**Best for**: Managed security providers with multiple customer environments
**Path**: Enterprise evaluation -> MSSP tier
**Timeline**: 30-day evaluation -> MSSP contract + tenant provisioning
**Talk track**: "Full tenant hierarchy. Cross-tenant visibility. Per-tenant billing. Your SOC sees everything, your customers see only their tenant."

---

## Trial Mechanics

- **Duration**: 14 days
- **Access**: Full Pro tier across all products
- **Credit card**: Not required
- **Deployment**: Docker Compose (`docker compose pull && docker compose up -d`), under 15 minutes
- **After trial**: Subscribe or continue on Open (free forever, 25 agents)
- **Trial URL**: https://tiresias.network/trial

---

## Revenue Targets (Illustrative)

| Deal Size | Configuration | Monthly | Annual |
|---|---|---|---|
| Small (25 agents) | Open | Free | Free |
| Growth (50 agents) | Starter | $49 | $488 (annual) |
| Mid (250 agents) | Pro | $199 | $1,982 (annual) |
| Enterprise | Enterprise | $2,499 | $24,890 (annual) |
| MSSP (10 tenants) | MSSP base + 10 tenants | $6,989 | ~$70K (annual) |

---

## Key Assets & Links

| Asset | Location |
|---|---|
| Platform One-Pager | 01-tiresias-platform-one-pager.md |
| SoulAuth Datasheet | 02-datasheet-soulauth.md |
| SoulWatch Datasheet | 03-datasheet-soulwatch.md |
| SoulGate Datasheet | 04-datasheet-soulgate.md |
| Pricing Reference | 05-pricing-reference.md |
| Technical Architecture | 06-technical-architecture-brief.md |
| Competitive Battlecard | 08-competitive-battlecard.md |
| Website | https://tiresias.network |
| Trial | https://tiresias.network/trial |
| Docker Hub | hub.docker.com/u/salucalabs |
| Contact | contact@saluca.com |

---

*Saluca LLC | Confidential - For Internal Sales Use Only | v3.6.1*
