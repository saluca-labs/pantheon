# Tiresias Platform Overview

**Version:** v3.4.4

**AI agents are the new attack surface. Tiresias is the security platform built to protect them.**

---

## The Problem

AI agents are proliferating across the enterprise. Customer service bots, code generation assistants, data analysis pipelines, security automation — organizations are deploying autonomous software agents at an accelerating pace.

But existing security infrastructure was never designed for them.

- **Identity**: IAM systems assume a human behind every credential. Agents don't have usernames and passwords. They need durable, cryptographic identities that persist across sessions and survive restarts.
- **Authorization**: Role-based access control built for people doesn't map to agents that need fine-grained, time-limited, scope-restricted permissions that change per task.
- **Monitoring**: SIEM platforms don't understand agent behavior. They can't distinguish a compromised agent from a busy one, or detect when an agent starts accessing resources outside its normal pattern.
- **Protection**: API gateways don't detect prompt injection, jailbreak attempts, or the LLM-specific threats that turn agents into attack vectors.

The result: organizations are deploying powerful autonomous systems with human-shaped security controls that don't fit.

Tiresias closes that gap.

---

## The Tiresias Platform

Tiresias is a security platform purpose-built for AI agents. Three products that work independently or together, covering identity, monitoring, and gateway protection for any autonomous software agent.

Named after the blind prophet of Greek mythology, Tiresias **sees threats, never data**. The platform evaluates behavior and enforces policy without inspecting or storing the content your agents process.

Built by security practitioners, for security practitioners.

---

### SoulAuth — Agent Identity & Zero-Trust Authorization

Every AI agent in your organization gets a durable, cryptographic identity called a **SoulKey**. From there, SoulAuth provides fine-grained access control evaluated on every request.

**What it does:**

- **Cryptographic agent identity** — Each agent receives a unique SoulKey. Keys are SHA-512 hashed at rest; raw keys are shown once at issuance and never stored.
- **Fine-grained access control** — Policies define what each agent can access by resource, action, and scope. No blanket permissions.
- **Short-lived capability tokens** — ES256-signed JWTs with 300 to 900 second lifetimes. Even if intercepted, exposure is measured in minutes.
- **Policy-as-code** — Authorization policies are version-controlled, synced from Git, auditable, and rollback-capable. Security policy gets the same rigor as application code.
- **Delegation workflows** — Temporary privilege escalation with explicit approval chains. Agents can request elevated access for specific tasks without permanent permission grants.
- **Tamper-evident audit trail** — Every authorization decision is logged in a SHA-256 hash chain. Each entry is cryptographically linked to the previous. Tampering with any record breaks the chain and is immediately detectable.

---

### SoulWatch — AI Runtime Security Monitoring

SoulWatch learns what "normal" looks like for each agent and alerts when behavior deviates. It combines behavioral baselines with a rule engine for comprehensive runtime security.

**What it does:**

- **Behavioral anomaly detection** — Builds per-agent baselines over time and flags deviations. Eight anomaly types detected out of the box: rate spikes, off-hours activity, credential stuffing, scope escalation, unusual resource access, geographic anomalies, pattern breaks, and privilege accumulation.
- **Sigma-compatible rule engine** — Write custom detection rules in standard Sigma YAML format with field matching, wildcards, aggregation, and time windows. Your existing Sigma expertise transfers directly.
- **Automated response playbooks** — Define quarantine policies per anomaly type. Credential stuffing can suspend a key for an hour. Scope escalation can force re-authentication. Rate spikes can kill the session entirely. All configurable per tenant.
- **Real-time event feed and alerting** — Stream security events as they happen. Configure alert channels and escalation paths.
- **SIEM integration** — Forward events to Splunk (HEC), Elasticsearch/OpenSearch, Azure Sentinel (Log Analytics), Syslog (RFC 5424 over TCP/UDP), or any webhook endpoint. Events are formatted in CEF (Common Event Format) for universal compatibility.

---

### SoulGate — API Security Gateway

SoulGate sits in front of your backend APIs and runs every agent request through a seven-stage security pipeline before it reaches your services.

**What it does:**

- **7-stage security pipeline** — Each request passes through authentication, authorization, rate limiting, prompt injection detection, payload inspection, circuit breaking, and audit logging.
- **Prompt injection detection** — Over 40 pattern-based detection rules covering the OWASP LLM Top 10. Individual severities are aggregated into a composite risk score. Detection is deterministic and auditable — not a black-box ML classifier — with tunable warn and block thresholds.
- **Rate limiting and circuit breakers** — Protect backend services from runaway agents or coordinated abuse.
- **Anti-weaponization safeguards** — Circuit breakers include three protections against deliberate exploitation: a minimum request threshold (won't trip on low volume), per-source failure ratio analysis (rejects opening if a single attacker caused most failures), and an admin lock (manual override prevents automatic transitions during attacks). Security controls cannot be turned against you.
- **IP and geographic access control** — Restrict agent traffic by source address or region.
- **Full request audit logging** — Every request through the gateway is logged with metadata for compliance and forensic analysis.

---

## How It Works

The three products form a closed loop: detection feeds back into enforcement automatically.

```
Your Agent --> SoulGate (inspect) --> SoulAuth (authorize) --> Your Backend
                                          |
                                     SoulWatch (monitor)
                                          |
                                  Threat? --> Auto-quarantine
```

1. Your agent sends a request.
2. **SoulGate** inspects the request for prompt injection, rate violations, and payload threats.
3. **SoulAuth** evaluates the agent's identity and authorization against policy. A short-lived capability token is issued if approved.
4. The request reaches your backend.
5. **SoulWatch** continuously monitors behavior patterns across all agent activity.
6. If an anomaly is detected, the configured response fires automatically — quarantine, rate limit, force re-auth, or suspend — without waiting for a human to intervene.

---

## Key Differentiators

| Capability | Tiresias | Traditional Tools |
|---|---|---|
| **Agent-native identity** | Cryptographic SoulKeys designed for autonomous agents | Human-centric IAM retrofitted with service accounts |
| **Closed-loop detection** | Anomaly detection triggers enforcement automatically | Detection and response are separate systems requiring manual triage |
| **Policy-as-code** | Git-synced, version-controlled, auditable, rollback-capable | Console-configured policies with limited change tracking |
| **Zero-trust by design** | Every request evaluated against policy; no implicit trust | Perimeter-based or session-based trust models |
| **Prompt injection defense** | Purpose-built detection for LLM-specific threats | No coverage or generic WAF rules that miss LLM attack patterns |
| **Anti-weaponization** | Security controls resist deliberate exploitation | Circuit breakers and rate limiters can be tripped by attackers |
| **Tamper-evident audit** | SHA-256 hash-chained event log; tampering breaks the chain | Append-only logs with no cryptographic integrity verification |

---

## Deployment Options

Tiresias fits your infrastructure, not the other way around.

- **SaaS (Managed)** — Multi-tenant, fully managed at tiresias.network. Fastest path to production.
- **Self-hosted** — Deploy on your infrastructure with Docker Compose or Kubernetes. Full control over data residency and network topology.
- **Hybrid** — SaaS control plane with on-premise gateway. Central management with local data processing.
- **Local development** — Zero-config SQLite mode. A single command spins up the full platform for development and testing.

---

## Pricing

| Tier | What You Get | Price |
|---|---|---|
| **Community** | SoulAuth only. 1 agent, 1,000 API calls/month. | Free forever |
| **Starter** | Basic monitoring and gateway protection. | $10-29 / agent / month |
| **Pro** | Full platform. Custom detection rules. SIEM integration. | $15-45 / agent / month |
| **Enterprise** | SSO/SAML, on-premise deployment, dedicated support, SLA. | Custom |

- Annual billing saves 20%.
- Platform bundles (SoulAuth + SoulWatch + SoulGate together) save 17-18% compared to purchasing products individually.

---

## Getting Started

Tiresias is currently in beta.

1. **Join the beta waitlist** at [tiresias.network/trial](https://tiresias.network/trial).
2. Beta participants receive full platform access across all three products.
3. Direct access to the engineering team for support and feedback during the beta period.
4. **At general availability**, all pricing tiers will be available with self-service onboarding.

Install the Python SDK:

```bash
pip install soulauth
```

The SDK includes identity resolution, access evaluation, token management, and CLI tools to get started quickly.

---

## Frequently Asked Questions

### General

**What makes Tiresias different from a regular API gateway?**

API gateways protect APIs. Tiresias protects AI agents. It understands agent identity, builds behavioral baselines per agent, and detects LLM-specific threats like prompt injection. Most importantly, the detection loop feeds back into enforcement automatically — anomalies trigger quarantine without waiting for a human.

**Do I need all three products?**

No. Each product works independently. SoulAuth is the foundation — it provides agent identity and authorization. SoulWatch adds behavioral monitoring and anomaly detection. SoulGate adds gateway-level inspection and prompt injection defense. Most teams start with SoulAuth and add products as their agent fleet grows.

**What types of AI agents does Tiresias support?**

Any autonomous software agent: LLM-based assistants, code generation agents, data processing pipelines, security automation, customer service bots, internal workflow agents. If it acts autonomously and needs identity, authorization, or monitoring, Tiresias handles it.

---

### Security

**How are credentials stored?**

SoulKeys are SHA-512 hashed at rest. The raw key is displayed once at issuance and is never stored by the platform. Capability tokens are ES256 signed with short TTLs between 300 and 900 seconds.

**Is the audit log tamper-proof?**

The audit log uses a SHA-256 hash chain where each entry includes a hash of the previous entry. Modifying, deleting, or reordering any record breaks the cryptographic chain and is detectable. This provides tamper-evidence — any alteration is visible — rather than tamper-prevention.

**How does prompt injection detection work?**

Pattern-based detection using over 40 regex rules mapped to the OWASP LLM Top 10 threat categories. Each pattern has an individual severity. Matched severities are aggregated into a composite risk score per request. Detection is deterministic and auditable — every decision can be traced to specific rules — with configurable warn and block thresholds. This is not an ML-based classifier; there are no false positives from model drift.

**What happens when an anomaly is detected?**

The response depends on your quarantine policies, which are fully configurable per tenant. Default behaviors include: credential stuffing triggers a key suspension for 1 hour; scope escalation triggers rate limiting plus forced re-authentication for 30 minutes; rate spikes trigger key suspension and session termination, requiring manual release. You control the response for every anomaly type.

---

### Operations

**How long until anomaly detection starts working?**

Behavioral baselines require 7 days of agent activity history to build. During this cold-start period, baseline-dependent anomaly detection operates with limited accuracy. Rule-based detection using Sigma rules works immediately from deployment.

**Can I write my own detection rules?**

Yes. SoulWatch supports Sigma-compatible YAML rules with field matching, wildcards, aggregation, and time windows. Rules can be uploaded via the API or included in your policy Git repository alongside authorization policies.

**What SIEM systems are supported?**

Splunk (HTTP Event Collector), Elasticsearch and OpenSearch, Azure Sentinel (Log Analytics), Syslog (RFC 5424 over TCP and UDP), and generic webhook endpoints. All events are formatted in CEF (Common Event Format) for broad compatibility.

**How does the circuit breaker prevent weaponization?**

Three safeguards prevent attackers from deliberately tripping circuit breakers to cause denial of service. First, a minimum request threshold ensures the breaker won't trip on low request volume. Second, per-source failure ratio analysis detects when a single source is responsible for most failures and rejects the state transition. Third, an admin lock allows manual override to prevent automatic transitions during active attacks.

---

### Integration

**Does Tiresias work with my existing identity provider?**

The Tiresias portal supports Google OIDC for human login, with SAML, Azure AD, and Okta support on the roadmap. Agent identity uses SoulKeys, which are independent of any human identity provider. Both identity systems coexist — your team logs into the portal with their corporate credentials while agents authenticate with SoulKeys.

**Can I use Tiresias with my existing monitoring stack?**

Yes. Tiresias exposes a Prometheus-compatible `/metrics` endpoint for scraping into your existing observability stack. SIEM forwarding covers all major platforms. Webhook notifications enable custom integrations with any system that accepts HTTP callbacks.

**Is there a Python SDK?**

Yes. Install with `pip install soulauth`. The SDK provides identity resolution, access evaluation, token management, and CLI tools. It is the fastest way to integrate Tiresias into your agent infrastructure.

---

*Tiresias is built by Saluca LLC. For questions, partnerships, or enterprise inquiries, contact us at [tiresias.network](https://tiresias.network).*
