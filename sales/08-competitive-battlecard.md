# Tiresias v3.6.1 - Competitive Battle Card

**Confidential - For Sales Team Use Only**

---

## Tiresias in 30 Seconds

"Tiresias is a zero-knowledge security platform purpose-built for AI agent infrastructure. Four products - identity, monitoring, gateway, and LLM observability - protect your entire agent fleet without ever accessing your data. 263+ API endpoints. 32/32 enterprise readiness. Deploy in 15 minutes. Start free."

---

## Why Tiresias Wins

### 1. Agent-Native (Not Retrofitted)
Built from scratch for AI agents. Not a human IAM bolted onto agent workflows. Soulkey identity, per-agent behavioral baselines, prompt injection detection, Cedar policy engine - these only exist because we built for agents first.

### 2. Zero-Knowledge Architecture
The only agent security platform that architecturally cannot see your data. Metadata flows through. Payloads never do. This isn't a toggle - it's the foundation.

### 3. Four Products, One Platform
Identity + Monitoring + Gateway + LLM Observability in a single deployment. Competitors force you to stitch together 3-5 tools. We ship one Docker Compose.

### 4. Enterprise-Hardened (32/32 Readiness)
Audit hash chain integrity. Per-tenant rate limiting. Password complexity enforcement. OIDC hardened with DB-backed nonce store. Failed auth audit trail. Session cookie security. Investigation token hardening. Streaming data export API. This is not a beta.

### 5. SOC-Ready on Day One
Sigma rules, SIEM connectors (Splunk/Elastic/Sentinel), PagerDuty/Slack/Teams alerts. Per-agent behavioral baselines detect anomalies before they become incidents.

### 6. Deploy in 15 Minutes
`docker compose pull && docker compose up -d`. Python SDK, YAML policies synced from git. Not a 6-month integration project.

### 7. MSSP-Ready Multi-Tenant Hierarchy
Full parent-child tenant hierarchy with cross-tenant subtree expansion, tenant switcher UI, hierarchy-aware provisioning, and per-tenant billing.

### 8. Fully Documented
176 API endpoints documented via OpenAPI (SoulAuth alone). 263+ total across all services. 8 operational docs including runbooks, SIEM integration guide, SDK reference, and CLI reference.

---

## Head-to-Head Comparisons

### vs. Okta / Auth0 / Azure AD

| Capability | Tiresias | Traditional IAM |
|---|---|---|
| Agent identity | Soulkey (SHA-512) | N/A |
| Agent-to-agent auth | Delegation chains | N/A |
| JIT authorization | Yes (every request) | Session-based |
| Behavioral monitoring | SoulWatch (per-agent baselines) | N/A |
| Prompt injection detection | 40+ OWASP patterns | N/A |
| SIEM integration for agents | Native (5 connectors) | Generic logs only |
| Quarantine automation | 7 response levels | N/A |
| Zero-knowledge | Yes | No |
| Audit hash chain | Tamper-evident (prev_hash) | No |
| Per-tenant rate limiting | Tier-based (60-1000/min) | Generic |
| Password policy | 500+ blocklist + complexity | Basic |
| Data export API | 3 streaming endpoints | Varies |
| Multi-tenant hierarchy | Parent-child with cross-tenant expansion | Flat |

**Landmine questions**: "Does your IAM know the difference between a human user and an AI agent? Can it detect when an agent's behavior deviates from its baseline? Can it quarantine a compromised agent in seconds? Can it prove audit log integrity with a hash chain?"

---

### vs. Kong / Apigee / AWS API Gateway

| Capability | Tiresias (SoulGate) | Traditional API Gateway |
|---|---|---|
| Agent-aware routing | Yes | No |
| Prompt injection detection | 40+ OWASP patterns | No |
| Agent identity verification | Soulkey + JWT ES256 | API key only |
| Per-agent behavioral baselines | SoulWatch integration | No |
| Circuit breakers | Per-upstream, 3-state, anti-weaponization | Varies |
| Agent risk scoring | 0-100 composite | No |
| Automated quarantine | 7 levels | No |
| Per-tenant rate limiting | Tier-based configuration | Generic |
| CoT policy enforcement | Yes | No |
| Streaming data export | Enterprise+ gated | No |

**Landmine questions**: "Can your API gateway detect a prompt injection attack? Does it know which agent is making the request, or just which API key? Can it automatically isolate a misbehaving agent? Does it enforce rate limits per tenant with tier-based configuration?"

---

### vs. LangChain Security / Guardrails AI / NeMo Guardrails

| Capability | Tiresias | Agent Wrappers |
|---|---|---|
| Scope | Infrastructure-level | Application-level |
| Agent identity | Cryptographic (soulkey) | No |
| Fleet-wide monitoring | Yes (per-agent behavioral baselines) | No (per-agent only) |
| Multi-tenancy | RLS isolation + hierarchy | No |
| SIEM integration | 5 native connectors | No |
| Compliance reporting | SOC2/ISO/NIST | No |
| Framework agnostic | Yes | Framework-specific |
| API gateway | SoulGate | No |
| Audit hash chain | Tamper-evident | No |
| Cedar policy engine | Yes | No |
| API documentation | 263+ endpoints via OpenAPI | Minimal |
| On-prem deployment | Docker Compose, 15 min | Embedded only |

**Landmine questions**: "How do you get fleet-wide visibility across all your agents? How do you demonstrate agent governance to auditors? What happens when you switch agent frameworks? Can you prove to an auditor that your logs haven't been tampered with?"

---

### vs. Build Your Own

| Factor | Tiresias | Build Internally |
|---|---|---|
| Time to deploy | 15 minutes | 3-6 months |
| API endpoints | 263+ | You build them |
| Database tables | 47 | You design them |
| SIEM connectors | 5 | You integrate them |
| Sigma rules | 7 + custom | You write them |
| Prompt injection patterns | 40+ (OWASP) | You research them |
| Compliance reports | 3 frameworks | You build them |
| OpenAPI documentation | 3 specs (12,500+ lines) | You write them |
| Operational runbooks | 8 failure-mode procedures | You write them |
| Audit hash chain | Built-in, verified at startup | You design it |
| Multi-tenant hierarchy | Parent-child, cross-tenant expansion | You architect it |
| Per-tenant rate limiting | Tier-based, configurable | You implement it |
| Ongoing maintenance | Included | Your team |
| Cost (1 year) | $488-$24,890 (Starter to Enterprise) | $200K+ engineering time |

**Talk track**: "Building this internally means pulling senior engineers off product work for months. And then maintaining it forever. We've already built 263 endpoints, 47 database tables, and 8 operational runbooks. We pass 32/32 on enterprise readiness. Why rebuild what's ready?"

---

## Key Differentiators (v3.6.1)

These are capabilities most competitors simply do not have:

| Differentiator | What It Means |
|---|---|
| **Audit hash chain integrity** | Every audit record links to its predecessor via prev_hash. Tamper-evident by design. Verified at startup. |
| **Per-agent behavioral baselines** | SoulWatch learns each agent's normal behavior and detects deviations. Not rule-based -- statistical. |
| **Cedar policy engine** | Formal authorization language. Policies are code, versioned in git, deployed via sync. |
| **Cross-tenant MSSP hierarchy** | Full parent-child tenant tree with subtree expansion across keys, audit, spend, latency dashboards. |
| **Per-tenant rate limiting** | Tier-based limits (60/min Open through 1,000/min MSSP). Not one-size-fits-all. |
| **Streaming data export** | 3 endpoints (audit, keys, policies) stream data for enterprise auditors. Not batch. |
| **176 documented API endpoints** | SoulAuth alone. 263+ total. Full OpenAPI specs. |
| **8 operational docs** | Runbooks, SIEM guide, SDK reference, CLI reference, Aletheia guide. Production-ready documentation. |
| **Investigation token hardening** | secrets.token_urlsafe, TTL capped 60 min, rate-limited, HMAC-verified. |
| **Password complexity** | 10+ chars, character classes, 500+ common password blocklist with pattern detection. |

---

## Objection Quick Reference

| Objection | Response |
|---|---|
| "We have IAM already" | IAM is for humans. Agents need agent-native identity. We extend your security perimeter, not replace it. |
| "Too early for us" | Open tier is free for 25 agents. Start identity governance before implicit trust becomes tech debt. |
| "Data exposure concern" | Zero-knowledge architecture. Your payloads never touch us. By design, not configuration. |
| "No budget" | Free tier exists. Starter is $49/mo flat (not per-agent). Compare to cost of one agent incident. |
| "Need to evaluate" | 14-day trial, full Pro access, no credit card. Deploy to staging and validate. |
| "Can we build it?" | You can. 263 endpoints, 47 tables, 3-6 months. Or deploy ours in 15 minutes. |
| "Never heard of you" | We're new. The platform is live. Try it for 14 days and let the product speak. |
| "What about vendor lock-in?" | Standard APIs (full OpenAPI docs), YAML policies in your git repo, on-premise option. Your data never leaves your infra. |
| "Is it enterprise-ready?" | 32/32 SaaS readiness checklist. Audit hash chain, rate limiting, password policy, OIDC hardened, data export, SIEM integration. Not a beta. |
| "Is it just vaporware?" | v3.6.1 live on Docker Hub and GCP Cloud Run. 263+ endpoints. 47 tables. 71 portal pages. Pull the images and see for yourself. |

---

## Deal Accelerators

1. **Free Trial** - 14 days, full Pro, no credit card. Reduce evaluation friction.
2. **Startup Program** - Platform Pro free for 12 months (under $5M funding, under 50 employees).
3. **Quick Win: SIEM Integration** - If they use Splunk/Elastic, SoulWatch value is visible in their existing dashboard within hours.
4. **Compliance Deadline** - If they have an upcoming SOC2 or ISO audit, SoulWatch compliance reports + streaming data export are an immediate win.
5. **Agent Incident** - If they've had an agent security issue, the pain is fresh. Lead with quarantine and monitoring.
6. **On-Prem Requirement** - Docker Compose deployment, 15 minutes, no external dependencies. Eliminates "can't use SaaS" objection.
7. **MSSP Play** - If they manage multiple customer environments, MSSP tier with per-tenant billing is a natural fit.

---

## Disqualification Signals

- No AI agents in production or planned
- Pure consumer/B2C with no backend agents
- Looking for a content moderation tool (not our space)
- Fewer than 3 agents with no growth plans (free tier is sufficient)

---

*Saluca LLC | Confidential - For Internal Sales Use Only | v3.6.1*
