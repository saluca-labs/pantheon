# Tiresias - Competitive Battle Card

**Confidential - For Sales Team Use Only**

---

## Tiresias in 30 Seconds

"Tiresias is a zero-knowledge security platform purpose-built for AI agent infrastructure. Three products - identity, monitoring, and gateway - protect your entire agent fleet without ever accessing your data. Deploy in 15 minutes. Start free."

---

## Why Tiresias Wins

### 1. Agent-Native (Not Retrofitted)
Built from scratch for AI agents. Not a human IAM bolted onto agent workflows. Soulkey identity, agent behavioral baselines, prompt injection detection - these only exist because we built for agents first.

### 2. Zero-Knowledge Architecture
The only agent security platform that architecturally cannot see your data. Metadata flows through. Payloads never do. This isn't a toggle - it's the foundation.

### 3. Three Products, One Platform
Identity + Monitoring + Gateway in a single deployment. Competitors force you to stitch together 3-5 tools. We ship one Docker Compose.

### 4. SOC-Ready on Day One
Sigma rules, SIEM connectors (Splunk/Elastic/Sentinel), PagerDuty/Slack/Teams alerts. Your SOC team works the same way they already do.

### 5. Deploy in 15 Minutes
Docker Compose, Python SDK, YAML policies synced from git. Not a 6-month integration project.

---

## Head-to-Head Comparisons

### vs. Okta / Auth0 / Azure AD

| Capability | Tiresias | Traditional IAM |
|---|---|---|
| Agent identity | Soulkey (SHA-512) | N/A |
| Agent-to-agent auth | Delegation chains | N/A |
| JIT authorization | Yes (every request) | Session-based |
| Behavioral monitoring | SoulWatch | N/A |
| Prompt injection detection | 36 patterns | N/A |
| SIEM integration for agents | Native | Generic logs only |
| Quarantine automation | 7 response levels | N/A |
| Zero-knowledge | Yes | No |

**Landmine questions**: "Does your IAM know the difference between a human user and an AI agent? Can it detect when an agent's behavior deviates from its baseline? Can it quarantine a compromised agent in seconds?"

---

### vs. Kong / Apigee / AWS API Gateway

| Capability | Tiresias (SoulGate) | Traditional API Gateway |
|---|---|---|
| Agent-aware routing | Yes | No |
| Prompt injection detection | 36 patterns | No |
| Agent identity verification | Soulkey + JWT ES256 | API key only |
| Behavioral baselines | SoulWatch integration | No |
| Circuit breakers | Per-upstream, 3-state | Varies |
| Agent risk scoring | 0-100 composite | No |
| Automated quarantine | 7 levels | No |

**Landmine questions**: "Can your API gateway detect a prompt injection attack? Does it know which agent is making the request, or just which API key? Can it automatically isolate a misbehaving agent?"

---

### vs. LangChain Security / Guardrails AI / NeMo Guardrails

| Capability | Tiresias | Agent Wrappers |
|---|---|---|
| Scope | Infrastructure-level | Application-level |
| Agent identity | Cryptographic (soulkey) | No |
| Fleet-wide monitoring | Yes | No (per-agent only) |
| Multi-tenancy | RLS isolation | No |
| SIEM integration | 5 native connectors | No |
| Compliance reporting | SOC2/ISO/NIST | No |
| Framework agnostic | Yes | Framework-specific |
| API gateway | SoulGate | No |

**Landmine questions**: "How do you get fleet-wide visibility across all your agents? How do you demonstrate agent governance to auditors? What happens when you switch agent frameworks?"

---

### vs. Build Your Own

| Factor | Tiresias | Build Internally |
|---|---|---|
| Time to deploy | 15 minutes | 3-6 months |
| API endpoints | 81+ | You build them |
| Database tables | 23 | You design them |
| SIEM connectors | 5 | You integrate them |
| Sigma rules | 7 + custom | You write them |
| Prompt injection patterns | 36 | You research them |
| Compliance reports | 3 frameworks | You build them |
| Ongoing maintenance | Included | Your team |
| Cost (10 agents, 1 year) | $3,480 (Platform Starter) | $200K+ engineering time |

**Talk track**: "Building this internally means pulling senior engineers off product work for months. And then maintaining it forever. We've already built 81 endpoints and 23 database tables. Why rebuild what's ready?"

---

## Objection Quick Reference

| Objection | Response |
|---|---|
| "We have IAM already" | IAM is for humans. Agents need agent-native identity. We extend your security perimeter, not replace it. |
| "Too early for us" | SoulAuth Community is free. Start identity governance before implicit trust becomes tech debt. |
| "Data exposure concern" | Zero-knowledge architecture. Your payloads never touch us. By design, not configuration. |
| "No budget" | Free tier exists. Platform Starter is $29/agent/mo. Compare to cost of one agent incident. |
| "Need to evaluate" | 14-day trial, full Pro access, no credit card. Deploy to staging and validate. |
| "Can we build it?" | You can. 81 endpoints, 23 tables, 3-6 months. Or deploy ours in 15 minutes. |
| "Never heard of you" | We're new. The platform is live. Try it for 14 days and let the product speak. |
| "What about vendor lock-in?" | Standard APIs, YAML policies in your git repo, on-premise option. Your data never leaves your infra. |

---

## Deal Accelerators

1. **Free Trial** - 14 days, full Pro, no credit card. Reduce evaluation friction.
2. **Startup Program** - Platform Pro free for 12 months (under $5M funding, under 50 employees).
3. **Quick Win: SIEM Integration** - If they use Splunk/Elastic, SoulWatch value is visible in their existing dashboard within hours.
4. **Compliance Deadline** - If they have an upcoming SOC2 or ISO audit, SoulWatch compliance reports are an immediate win.
5. **Agent Incident** - If they've had an agent security issue, the pain is fresh. Lead with quarantine and monitoring.

---

## Disqualification Signals

- No AI agents in production or planned
- Pure consumer/B2C with no backend agents
- Looking for a content moderation tool (not our space)
- Fewer than 3 agents with no growth plans (free tier is sufficient)

---

*Saluca LLC | Confidential - For Internal Sales Use Only*
