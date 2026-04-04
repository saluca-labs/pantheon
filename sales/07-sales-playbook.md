# Tiresias - Sales Playbook

**For Sales Engineers and Sales Executives**

---

## What Is Tiresias?

Tiresias is a zero-knowledge security platform for AI agent infrastructure. Named after the blind prophet of Greek mythology who could see what others could not, Tiresias sees threats without ever seeing data.

Three products. One platform:
- **SoulAuth** - Agent identity and zero-trust authorization
- **SoulWatch** - Runtime security monitoring and threat detection
- **SoulGate** - API security gateway with prompt injection protection

**Company**: Saluca LLC (sole founder: Cristian)
**Website**: tiresias.network
**Contact**: contact@saluca.com

---

## Ideal Customer Profile (ICP)

### Primary Targets
- **Enterprise AI/ML teams** deploying autonomous agents in production
- **Security teams** responsible for AI infrastructure governance
- **Platform engineering teams** building internal agent frameworks
- **Regulated industries** (finance, healthcare, government) with compliance mandates

### Buyer Personas

| Persona | Title | Cares About | Product Focus |
|---|---|---|---|
| Security Champion | CISO, VP Security | Risk reduction, compliance, audit trails | Full platform |
| Platform Builder | VP Engineering, CTO | Developer experience, integration, scale | SoulAuth + SoulGate |
| SOC Lead | Security Operations Manager | Detection, SIEM integration, MTTR | SoulWatch |
| Compliance Lead | GRC Manager, Audit Lead | SOC2, ISO 27001, NIST reporting | SoulWatch + SoulAuth |

### Qualification Signals
- Running 10+ AI agents in production
- Evaluating or building agent-to-agent communication
- Active compliance requirements (SOC2, ISO, NIST)
- Security concerns about LLM/agent deployments
- Budget for agent infrastructure tooling
- Using Splunk, Elastic, or Sentinel (SoulWatch lands easily)

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

### Technical Depth
11. "What does your agent deployment look like? Kubernetes? Docker? Serverless?"
12. "Do your agents delegate tasks to other agents? How do you trace those chains?"
13. "What SIEM or observability platform does your SOC use?"

---

## Positioning by Persona

### For CISOs / VP Security
**Lead with**: Risk reduction and zero-knowledge architecture
**Key message**: "Tiresias gives you complete visibility into your AI agent fleet without creating a new data exposure risk. Zero-knowledge means we verify identities and detect threats using metadata only - your agent payloads never touch our platform."
**Proof points**: Automated quarantine (7 levels), compliance reports, full audit trails

### For CTOs / VP Engineering
**Lead with**: Developer experience and integration simplicity
**Key message**: "Deploy in under 15 minutes with Docker. Python SDK, 12 CLI commands, policy-as-code in YAML synced from git. Your developers define authorization policies the same way they define infrastructure."
**Proof points**: Python SDK, git-sync policies, Docker Compose, 35+ REST APIs

### For SOC Managers
**Lead with**: SIEM integration and Sigma rules
**Key message**: "SoulWatch plugs directly into your existing SOC workflow. Native Splunk, Elastic, and Sentinel connectors. Sigma-compatible detection rules your team already knows how to write."
**Proof points**: 5 SIEM connectors, 7 Sigma rules, PagerDuty/Slack/Teams alerts, dead letter queue reliability

### For GRC / Compliance
**Lead with**: Compliance reporting and audit trails
**Key message**: "SoulWatch generates SOC2, ISO 27001, and NIST 800-53 compliance reports from real-time monitoring data. Every authorization decision, every anomaly, every quarantine action is immutably logged."
**Proof points**: 3 compliance frameworks, exportable audit logs, policy versioning, GDPR Article 25 design

---

## Competitive Landscape

### vs. Traditional IAM (Okta, Auth0, Azure AD)
**Their gap**: Built for human users, not AI agents. No concept of agent identity, behavioral monitoring, or prompt injection protection.
**Our advantage**: Purpose-built for agents. Soulkey identity, JIT authorization, runtime monitoring, automated quarantine.
**Messaging**: "Traditional IAM doesn't know what an AI agent is. Tiresias was built for nothing else."

### vs. API Gateways (Kong, Apigee, AWS API Gateway)
**Their gap**: Traffic management without agent awareness. No behavioral monitoring, no agent identity, no prompt injection detection.
**Our advantage**: Agent-native identity, behavioral baselines, 36 prompt injection patterns, integrated monitoring.
**Messaging**: "API gateways manage traffic. SoulGate understands agents."

### vs. Agent Wrappers (Guardrails, LangChain Security)
**Their gap**: Application-layer only. No infrastructure-level identity, no fleet-wide monitoring, no multi-tenant isolation.
**Our advantage**: Infrastructure-level security. Works across any agent framework. Fleet-wide visibility.
**Messaging**: "Wrappers protect one agent. Tiresias protects the fleet."

### vs. Build-Your-Own
**Their gap**: Months of engineering time, no behavioral monitoring, no compliance reporting.
**Our advantage**: Deploy in 15 minutes. 81+ endpoints across three products. 23 database tables. Battle-tested.
**Messaging**: "You could build this. But should you? And can you maintain it?"

---

## Objection Handling

### "We already have IAM."
"Traditional IAM is great for human users. But your AI agents need agent-native identity - cryptographic soulkeys, just-in-time authorization, behavioral monitoring. Tiresias doesn't replace your IAM, it extends your security perimeter to cover your agent fleet."

### "We're not ready - only running a few agents."
"That's actually the ideal time. SoulAuth Community is free forever for 1 agent. Start with identity governance now, before your fleet grows and implicit trust becomes technical debt. Most security leaders wish they'd started identity early."

### "We're concerned about adding another data exposure point."
"That's exactly why we built zero-knowledge architecture. Your agent payloads never touch our platform - period. We operate on metadata only. Tiresias is the security tool that can't see your data, by design."

### "The budget isn't there right now."
"SoulAuth Community is free. The Platform Starter is $29/agent/month. For a 10-agent fleet, that's $290/month for complete identity, monitoring, and gateway protection. Compare that to the cost of one compromised agent incident."

### "We need to evaluate this with our security team."
"Absolutely. Here's our technical architecture brief [hand over doc 06]. The 14-day trial gives full Pro access to everything with no credit card. Your team can deploy to a staging environment and validate the architecture themselves."

### "How is this different from what we could build internally?"
"You could build it - we know because we did. That's 81+ API endpoints, 23 database tables, Sigma rule engine, 5 SIEM integrations, behavioral baseline learning, and prompt injection detection. The question is: how many months and how many engineers? And who maintains it?"

---

## Sales Motions

### Motion 1: Start with SoulAuth (Land)
**Best for**: Teams just starting agent security
**Path**: SoulAuth Community (free) -> SoulAuth Pro -> Platform Bundle
**Timeline**: Free to Pro in 30-60 days as agent count grows
**Talk track**: "Start with agent identity. It's the foundation. Everything else builds on it."

### Motion 2: SOC-Led (SoulWatch Entry)
**Best for**: Security teams with existing SIEM
**Path**: SoulWatch Starter -> SoulWatch Pro (SIEM integration) -> Full Platform
**Timeline**: Starter to Pro in 30 days once SIEM value is proven
**Talk track**: "Let's get your agent fleet feeding into your SOC. Sigma rules, Splunk connector, same workflow your team already runs."

### Motion 3: Platform Deal (Top-Down)
**Best for**: Enterprise with compliance mandate or security initiative
**Path**: Platform Pro trial -> Platform Enterprise
**Timeline**: 14-day trial -> 30-day evaluation -> enterprise contract
**Talk track**: "Full platform. Identity, monitoring, gateway. One vendor, one deployment, one bill."

---

## Trial Mechanics

- **Duration**: 14 days
- **Access**: Full Pro tier across all three products
- **Credit card**: Not required
- **Deployment**: Docker Compose, under 15 minutes
- **After trial**: Subscribe to individual products or bundle, or downgrade to SoulAuth Community (free)
- **Trial URL**: tiresias.network/trial

---

## Revenue Targets (Illustrative)

| Deal Size | Configuration | Monthly | Annual |
|---|---|---|---|
| Small (10 agents) | Platform Starter | $290 | $2,760 |
| Mid (50 agents) | Platform Pro | $2,250 | $21,600 (annual) |
| Large (200 agents) | Platform Pro (annual) | $7,200 | $86,400 |
| Enterprise (500+) | Platform Enterprise | Custom | $200K+ |

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
| Website | tiresias.network |
| Trial | tiresias.network/trial |
| Contact | contact@saluca.com |

---

*Saluca LLC | Confidential - For Internal Sales Use Only*
