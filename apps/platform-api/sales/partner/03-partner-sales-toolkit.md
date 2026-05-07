# Tiresias Partner Sales Toolkit

**Your End-to-End Guide for Working Deals**

**Audience:** Partner sales engineers and account executives
**Classification:** Partner confidential. Do not share competitive or pricing sections with prospects.
**Last updated:** 2026-04-06

---

## Section 1: Know Your Product (Quick Reference)

### The Platform in One Sentence

Tiresias is a zero-knowledge security platform purpose-built for AI agent infrastructure. It secures agent identity, monitors agent behavior, and enforces API-layer protections, all without ever accessing, storing, or transmitting customer data.

**Metadata flows through. Data never does.**

### Three Products, One Platform

| Product | What It Does | Key Capability |
|---|---|---|
| **SoulAuth** | Agent identity and zero-trust authorization | Cryptographic soulkeys (SHA-512), just-in-time policy evaluation, capability tokens (JWT ES256), policy-as-code via git sync |
| **SoulWatch** | Runtime security monitoring and threat detection | Behavioral baselines, anomaly detection, Sigma-compatible rules, risk scoring, automated quarantine, SIEM forwarding |
| **SoulGate** | API security gateway | 7-step security pipeline, prompt injection detection, rate limiting, circuit breakers, API key management |

### How They Work Together

```
Agent Request --> SoulAuth (Identity & AuthZ) --> SoulWatch (Monitor) --> SoulGate (Enforce) --> Resource
```

1. **SoulAuth** verifies the agent's identity and evaluates authorization policy in real time. No standing permissions.
2. **SoulWatch** monitors behavioral patterns, scores risk, and triggers automated responses when anomalies are detected.
3. **SoulGate** enforces rate limits, detects prompt injection, manages circuit breakers, and proxies requests to upstream services.

Each product operates on metadata only. Agent payloads never leave the customer's infrastructure.

### Key Numbers to Know

| Metric | Count |
|---|---|
| SoulAuth API endpoints | 35+ |
| SoulWatch API endpoints | 27 |
| SoulGate API endpoints | 19 |
| Prompt injection detection patterns | 36 |
| Anomaly detection types | 8 (behavioral, temporal, volumetric) |
| Sigma detection rules (built-in) | 7 |
| Automated response playbooks | 3 |
| Quarantine response levels | 7 (alert through full isolation) |
| SIEM connectors | 5 (Splunk, Elastic, Sentinel, Syslog, Webhook) |
| Database tables (platform total) | 23 |
| Total API endpoints (platform) | 81+ |

### Deployment Model

- **Default:** Self-hosted via Docker Compose. Customer controls their own infrastructure.
- **Time to deploy:** Under 15 minutes from download to first agent registered.
- **Database:** PostgreSQL 16 with row-level security for multi-tenant isolation.
- **Orchestration:** Docker Compose (default), Kubernetes-ready.
- **No cloud dependency.** Tiresias runs wherever the customer wants it.

---

## Section 2: Know Your Customer

### Ideal Customer Profile

| Segment | Description |
|---|---|
| Enterprise AI/ML teams | Deploying autonomous agents in production at scale |
| Security teams | Responsible for AI infrastructure governance and incident response |
| Platform engineering | Building internal agent frameworks and developer tooling |
| Regulated industries | Finance, healthcare, government with compliance mandates (SOC2, ISO 27001, NIST 800-53) |

### Qualification Signals

A prospect is worth pursuing when you can confirm two or more of these:

- Running 10+ AI agents in production (or planning to within 6 months)
- Active compliance requirements: SOC2, ISO 27001, NIST 800-53, GDPR
- Budget allocated for agent infrastructure or AI security tooling
- Already using Splunk, Elastic, or Microsoft Sentinel (SoulWatch lands easily into existing SOC)
- Evaluating or building agent-to-agent communication patterns
- Has experienced or is worried about an agent security incident
- Leadership visibility on AI governance as a strategic initiative

### Four Buyer Personas

**1. CISO / VP Security**

| Attribute | Detail |
|---|---|
| Primary concern | Risk reduction, governance visibility, audit readiness |
| Decision role | Budget authority, security architecture sign-off |
| Product focus | Full platform |
| What they need to hear | Zero-knowledge architecture eliminates data exposure risk. Complete audit trail. Automated quarantine with 7 graduated response levels. Compliance reports for SOC2, ISO 27001, NIST 800-53. |

**2. CTO / VP Engineering**

| Attribute | Detail |
|---|---|
| Primary concern | Platform integration, developer experience, operational simplicity |
| Decision role | Technical approval, architecture fit |
| Product focus | SoulAuth + SoulGate |
| What they need to hear | Deploy in 15 minutes. Python SDK, 12 CLI commands, YAML policies synced from git. REST APIs across all three products. Docker Compose, no vendor lock-in. |

**3. SOC Lead / Security Operations Manager**

| Attribute | Detail |
|---|---|
| Primary concern | Detection coverage, alerting speed, SIEM integration, reducing MTTR |
| Decision role | Technical evaluator, influencer |
| Product focus | SoulWatch |
| What they need to hear | Sigma-compatible rules your team already knows. Native Splunk/Elastic/Sentinel connectors. PagerDuty, Slack, Teams alerts. Dead letter queue ensures event delivery. Works with your existing SOC workflow. |

**4. Compliance Lead / GRC Manager**

| Attribute | Detail |
|---|---|
| Primary concern | Audit trails, data retention, regulatory framework coverage |
| Decision role | Requirements gatekeeper |
| Product focus | SoulWatch + SoulAuth |
| What they need to hear | Generates compliance reports mapped to SOC2 Trust Services Criteria, ISO 27001 Annex A, and NIST 800-53 control families. Immutable audit logs. Policy versioning in git. GDPR Article 25 design principles. Configurable retention (7/30/90 days by tier). |

---

## Section 3: Discovery & Qualification

### Top 10 Discovery Questions

**Opening (any persona):**

1. "How many AI agents are you running in production today? How do you expect that to grow over the next 12 months?"
2. "How do your agents authenticate to each other and to external services right now?"
3. "What visibility does your security team have into what your agents are actually doing at runtime?"

**Pain discovery (CISO, CTO):**

4. "If an agent was compromised today, how would you know? How quickly could you isolate it?"
5. "How are you managing API keys across your agent fleet? Who has access to rotate them?"
6. "What does your agent authorization model look like: standing permissions, or something more dynamic?"

**SOC-specific:**

7. "How does agent behavior data flow into your SIEM today? Or does it?"
8. "What SIEM or observability platform does your SOC use? Splunk, Elastic, Sentinel?"

**Compliance-specific:**

9. "What compliance frameworks are you subject to? Do your auditors ask about AI agent governance?"
10. "Is data privacy a concern with your current agent security approach? Do any of your tools inspect agent payloads?"

### Disqualification Signals

Stop investing time when you see these:

- **No agents in production and none planned.** Tiresias solves a problem they do not have yet.
- **No security budget and no compliance pressure.** No urgency to buy.
- **Looking for content moderation or prompt safety tooling.** Different product category.
- **Pure consumer/B2C with no backend agent infrastructure.** Not the ICP.
- **Fewer than 3 agents with no growth plans.** Open (free) tier is sufficient; no revenue opportunity.
- **Explicitly seeking free-only solutions with no intent to pay.** Qualify out early.

### Assessing Deal Size

Use agent count to estimate the right tier and revenue potential:

| Agent Count | Recommended Tier | Monthly Revenue | Annual Revenue |
|---|---|---|---|
| 1-25 | Open (Free) | $0 | $0 |
| 10-50 | Starter ($49/mo) | $49 | $488 (annual billing) |
| 25-250 | Pro ($199/mo) | $199 | $1,982 (annual billing) |
| 250+ | Enterprise ($2,499/mo) | $2,499 | $24,890 (annual billing) |
| MSSP (multi-tenant) | MSSP ($4,999/mo + $199/tenant) | $5,000+ | $60,000+ |

Note: Tiresias uses flat-rate platform pricing, not per-agent pricing. All tiers include unlimited users. The agent count determines which tier fits, but the price is fixed per tier.

---

## Section 4: Positioning & Messaging

### 30-Second Elevator Pitch

"Tiresias is a zero-knowledge security platform purpose-built for AI agent infrastructure. Three products, one deployment: identity, monitoring, and API gateway. It protects your entire agent fleet without ever seeing your data. Deploy in 15 minutes with Docker. Start with a free trial."

### Positioning by Persona

**For the CISO:**
"Tiresias gives you complete visibility into your AI agent fleet without creating a new data exposure risk. Zero-knowledge means we verify identities and detect threats using metadata only. Your agent payloads never touch our platform. Automated quarantine, compliance reports, full audit trails, all from a single deployment."

**For the CTO:**
"Deploy in under 15 minutes with Docker Compose. Python SDK, 12 CLI commands, YAML policies synced from your git repo. Your developers define authorization policies the same way they define infrastructure. 81+ REST API endpoints, no vendor lock-in."

**For the SOC Lead:**
"SoulWatch plugs directly into your existing workflow. Native Splunk, Elastic, and Sentinel connectors. Sigma-compatible detection rules your team already knows how to write. PagerDuty and Slack alerts. You work the same way you already do; now you have agent coverage."

**For the Compliance Lead:**
"SoulWatch generates compliance reports mapped to SOC2, ISO 27001, and NIST 800-53 from real-time monitoring data. Every authorization decision, every anomaly, every quarantine action is immutably logged and exportable. Policy versioning lives in git."

### "Why Now" Talking Points

Use these to create urgency in conversations:

1. **Regulatory pressure is accelerating.** Compliance frameworks are catching up to AI. Auditors are starting to ask about agent governance. Organizations that wait will scramble to retrofit security after the mandate lands.

2. **Agent proliferation is outpacing security.** 73% of enterprises now deploy AI agents in production. The average agent has 12 implicit permissions. Every month without governance makes the problem harder to solve.

3. **Incident risk is real and growing.** Agent-to-agent communication happens with implicit trust and zero audit trails. One compromised agent can cascade across the fleet. The question is not whether an incident will happen, but whether you will detect it when it does.

4. **The cost of delay compounds.** Retrofitting security onto a fleet of 200 agents is an order of magnitude harder than deploying governance on a fleet of 20. Start now while the architecture is still manageable.

### Competitive Positioning

**vs. Traditional IAM (Okta, Auth0, Azure AD)**

| Dimension | Tiresias | Traditional IAM |
|---|---|---|
| Designed for | AI agents | Human users |
| Agent identity | Soulkey (SHA-512, hardware-bound) | N/A |
| Agent-to-agent auth | Delegation chains with policy constraints | N/A |
| Behavioral monitoring | SoulWatch (8 anomaly types) | N/A |
| Prompt injection detection | 36 patterns | N/A |
| Quarantine automation | 7 graduated levels | N/A |

**Key line:** "Traditional IAM doesn't know what an AI agent is. Tiresias was built for nothing else."

**vs. API Gateways (Kong, Apigee, AWS API Gateway)**

| Dimension | Tiresias (SoulGate) | Traditional API Gateway |
|---|---|---|
| Agent-aware routing | Yes | No |
| Prompt injection detection | 36 patterns | No |
| Agent identity verification | Soulkey + JWT ES256 | API key only |
| Behavioral baselines | SoulWatch integration | No |
| Agent risk scoring | 0-100 composite | No |

**Key line:** "API gateways manage traffic. SoulGate understands agents."

**vs. Agent Wrappers (LangChain Security, Guardrails AI, NeMo Guardrails)**

| Dimension | Tiresias | Agent Wrappers |
|---|---|---|
| Scope | Infrastructure-level, fleet-wide | Application-level, per-agent |
| Agent identity | Cryptographic soulkey | None |
| Multi-tenancy | Row-level security isolation | None |
| SIEM integration | 5 native connectors | None |
| Compliance reporting | SOC2, ISO 27001, NIST | None |
| Framework dependency | Framework-agnostic | Framework-specific |

**Key line:** "Wrappers protect one agent. Tiresias protects the fleet."

**vs. Build Your Own**

| Factor | Tiresias | Build Internally |
|---|---|---|
| Time to deploy | 15 minutes | 3-6 months |
| API endpoints | 81+ | You build them |
| Database tables | 23 | You design them |
| SIEM connectors | 5 | You integrate them |
| Prompt injection patterns | 36 | You research them |
| Annual cost (10 agents) | $588 (Starter annual) | $200K+ engineering time |
| Ongoing maintenance | Included | Your team, indefinitely |

**Key line:** "You could build this. But should you? And can you maintain it?"

---

## Section 5: Objection Handling

### "We already built our own agent security."

**Response:** "That's great; it shows you take agent security seriously. What we typically see with internal builds is that they cover identity but miss runtime monitoring, or they handle a few agents but break down at fleet scale. They rarely include SIEM integration, Sigma rules, or compliance reporting. And they require ongoing maintenance from the same engineering team that should be building product. Tiresias ships 81+ endpoints, 23 database tables, 5 SIEM connectors, and 36 prompt injection patterns out of the box. The question is whether your team's time is better spent maintaining security infrastructure or building your core product."

### "It's too early for us to invest in agent security."

**Response:** "73% of enterprises are already deploying agents in production, and incidents are already happening. The organizations getting ahead of this are implementing identity governance now, before implicit trust becomes technical debt across a fleet of 100+ agents. The Open tier is free forever for up to 25 agents. You can start building governance today at zero cost."

### "We already use Okta / Auth0."

**Response:** "Okta and Auth0 are excellent for human users. But they have no concept of AI agent identity, no behavioral baseline monitoring, no prompt injection detection, and no automated quarantine. Tiresias doesn't replace your IAM; it extends your security perimeter to cover your agent fleet. They handle humans. We handle agents."

### "The pricing is too high."

**Response:** "The Starter tier is $49 per month flat for up to 50 agents. That is less than a dollar per agent per month for identity, monitoring, and gateway protection. Compare that to the cost of a single compromised agent incident, or to the $200K+ in engineering time required to build equivalent coverage internally. The Open tier is also free forever for up to 25 agents."

### "We need on-prem only. No cloud dependencies."

**Response:** "Self-hosted is the default deployment model, not an add-on or premium feature. Tiresias runs on your infrastructure via Docker Compose or Kubernetes. Your data never leaves your environment. The zero-knowledge architecture means even the platform itself architecturally cannot see your agent payloads."

### "Can we just start with SoulAuth?"

**Response:** "Absolutely. Many customers land with SoulAuth to establish agent identity governance first. It is the foundation everything else builds on. You can add SoulWatch for monitoring and SoulGate for API protection whenever you are ready. Each product works independently, and they integrate automatically when deployed together."

### "We've never heard of Saluca or Tiresias."

**Response:** "We are new to market, which means you are getting in early. The platform is live, fully documented, and available for a 14-day trial with full Pro access, no credit card required. Deploy it to a staging environment and let the product speak for itself."

### "What about vendor lock-in?"

**Response:** "Standard REST APIs. YAML policies stored in your own git repository. Self-hosted on your infrastructure. Your data never leaves your environment. If you ever stop using Tiresias, your agents keep running; you just lose the governance layer."

---

## Section 6: Running a Demo

### Pre-Demo Checklist

Complete these before any customer-facing demo:

- [ ] Docker and Docker Compose installed on the demo machine
- [ ] Ports 8000, 8001, 8002, 5432 available (or mapped to alternates)
- [ ] Demo Docker Compose file pulled and tested (do a dry run)
- [ ] PostgreSQL container starts cleanly
- [ ] At least one demo agent pre-registered (for faster walkthrough)
- [ ] Browser open with the Tiresias dashboard URL bookmarked
- [ ] Screen sharing configured; close unnecessary applications
- [ ] Know which persona(s) will be in the room and tailor the demo emphasis accordingly

### 15-Minute Demo Script

**Minute 0-2: Set the Stage**

"Let me show you what Tiresias looks like in practice. I'm going to deploy the full platform, register an agent, set up a policy, trigger a detection, and block a prompt injection attempt. This will take about 15 minutes."

**Minute 2-4: Deploy via Docker Compose**

```bash
docker compose up -d
```

Walk through what is starting: SoulAuth, SoulWatch, SoulGate, PostgreSQL. Emphasize that this is the full platform, not a stripped-down demo instance. Point out the deployment time.

"That's the entire platform running. Three products, one command, under two minutes."

**Minute 4-6: Register an Agent and Issue a Soulkey**

- Register a demo agent using the API or CLI
- Show the soulkey issuance (SHA-512 cryptographic identity)
- Show agent metadata: type, owner, capabilities

"Every agent gets a unique cryptographic identity. This is the foundation of zero-trust; no more implicit trust or shared API keys."

**Minute 6-8: Create a Policy and Demonstrate Zero-Trust Evaluation**

- Create a YAML policy that restricts the demo agent's access
- Submit a request that triggers a policy evaluation
- Show the allow/deny decision in real time
- Show the audit log entry

"Every request is evaluated against policy in real time. No standing permissions. The policy lives in YAML, version-controlled in git."

**Minute 8-10: Trigger a SoulWatch Anomaly Detection**

- Generate traffic that deviates from the agent's behavioral baseline
- Show the anomaly detection firing in the SoulWatch dashboard
- Show the risk score update
- Show the alert routing (Slack, PagerDuty, or SIEM connector)

"SoulWatch learned the agent's normal behavior and detected the deviation. This feeds directly into your SIEM via native connectors."

**Minute 10-12: Block a Prompt Injection with SoulGate**

- Send a request through SoulGate that contains a known prompt injection pattern
- Show SoulGate detecting and blocking the request
- Show the audit log entry with the matched pattern
- Show the 7-step pipeline in action

"SoulGate detected the prompt injection at the API layer, before it ever reached the upstream service. 36 detection patterns, and you can add custom ones."

**Minute 12-14: Show the Unified Dashboard**

- Walk through the platform dashboard: agents, policies, detections, risk scores
- Show compliance report generation (SOC2, ISO 27001, NIST)
- Show SIEM integration configuration

"This is the single pane of glass for your agent fleet security. Identity, monitoring, gateway, compliance; all in one place."

**Minute 14-15: Close**

"That's the full platform. Deployed in minutes, protecting agents from identity through runtime to API perimeter. What questions do you have?"

### Post-Demo Follow-Up

Send within 24 hours of the demo:

**Subject:** Tiresias Demo Follow-Up + Trial Access

**Body:**
Thank you for the time today. As discussed, here is what we covered and the next steps:

- Platform overview: SoulAuth (identity), SoulWatch (monitoring), SoulGate (API gateway)
- Deployment via Docker Compose (under 15 minutes)
- Agent registration, policy evaluation, anomaly detection, prompt injection blocking

**Next steps:**
1. 14-day free trial: tiresias.network/trial (full Pro access, no credit card)
2. Attached: Platform one-pager, relevant product datasheet(s)
3. Schedule a technical deep-dive with your [security team / SOC / engineering leads]

Happy to answer any questions. Looking forward to connecting.

---

## Section 7: Trial to Close

### Trial Setup

| Detail | Value |
|---|---|
| Duration | 14 days |
| Access level | Full Pro across all three products |
| Credit card required | No |
| Deployment | Docker Compose, self-hosted |
| After trial expires | Subscribe to any tier, or continue on Open (free, up to 25 agents) |
| Trial URL | tiresias.network/trial |

### Week 1 Check-In (Day 3-5)

**Goal:** Ensure successful deployment and answer early questions.

**Agenda:**
- Confirm Docker Compose deployment completed successfully
- Verify at least one agent registered with a soulkey
- Walk through any initial configuration questions
- Identify which SIEM they want to connect (if applicable)
- Confirm the right stakeholders are evaluating (CISO, SOC lead, compliance)

**If they have not deployed yet:** Offer a 30-minute deployment assist call. Deployment friction is the number one trial killer.

### Week 2 Check-In (Day 10-12)

**Goal:** Review usage, discuss fit, and introduce the upgrade conversation.

**Agenda:**
- Review their trial usage: how many agents registered, policies created, detections triggered
- Ask what value they have seen and what gaps remain
- Discuss their agent fleet growth plans (agent count drives tier selection)
- Introduce tier recommendations based on their usage and needs
- Set a decision timeline: "Your trial wraps up on [date]. Let's make sure you have everything you need to make a decision."

### Conversion Ask

Map their situation to a tier recommendation:

| Customer Profile | Recommended Tier | Monthly | Annual |
|---|---|---|---|
| Small team, under 25 agents, exploring | Open (Free) | $0 | $0 |
| Production deployment, up to 50 agents | Starter | $49/mo | $40.67/mo (billed annually) |
| Security-focused, SIEM integration, Sigma rules, up to 250 agents | Pro | $199/mo | $165.17/mo (billed annually) |
| Compliance-driven, 250+ agents, custom SLA requirements | Enterprise | $2,499/mo | $2,074.17/mo (billed annually) |
| Managed security provider with sub-tenants | MSSP | $4,999/mo + $199/tenant | Contact us |

### Pricing Scenarios for Common Deal Sizes

**Scenario A: 10 agents, production security**
- Recommended: Starter ($49/mo)
- Effective cost: ~$5/agent/month
- Annual commitment: $488/year
- Comparison: Building internally would cost $200K+ in engineering time

**Scenario B: 50 agents, full detection and response**
- Recommended: Pro ($199/mo)
- Effective cost: ~$4/agent/month
- Annual commitment: $1,982/year
- Comparison: SIEM + EDR equivalents start at $500+/month

**Scenario C: 200+ agents, enterprise compliance**
- Recommended: Enterprise ($2,499/mo)
- Effective cost: ~$12.50/agent/month at 200 agents
- Annual commitment: $24,890/year ($2,074.17/mo billed annually)
- Includes: SIEM connectors, policy enforcement modes, custom detection rules, audit export, dedicated support (8h SLA)

**Scenario D: MSSP with 10 managed tenants**
- Recommended: MSSP ($4,999/mo + $199/tenant)
- Total: ~$6,990/month
- Annual commitment: ~$83,880/year
- Includes: Multi-tenant hierarchy, cross-tenant detection, white-label branding, tenant provisioning API

### Closing Tips

- Always tie the cost back to the alternative: building internally ($200K+), or the cost of one compromised agent incident.
- If budget is the blocker, start with Open (free) and build the case for upgrade with usage data.
- Annual billing saves 17% (2 months free). Use this as a closing incentive: "If you commit to annual, the Pro tier drops from $199 to $165.17 per month."
- If the prospect needs more time, extend the trial (with manager approval) rather than losing the deal.

---

## Section 8: Your Sales Assets

### Customer-Facing Collateral

| Asset | File | Description | When to Use |
|---|---|---|---|
| Platform One-Pager | `01-tiresias-platform-one-pager.md` | Single-page overview of the full Tiresias platform, three products, key differentiators, and pricing summary | First touch, leave-behind after intro call, attach to outbound emails |
| SoulAuth Datasheet | `02-datasheet-soulauth.md` | Technical datasheet for SoulAuth: capabilities, specs, architecture, pricing, use cases | When the prospect is focused on agent identity and authorization |
| SoulWatch Datasheet | `03-datasheet-soulwatch.md` | Technical datasheet for SoulWatch: anomaly detection, Sigma rules, SIEM integration, pricing | When the prospect is SOC-led or focused on monitoring and detection |
| SoulGate Datasheet | `04-datasheet-soulgate.md` | Technical datasheet for SoulGate: security pipeline, prompt injection, rate limiting, pricing | When the prospect is focused on API security or prompt injection defense |
| Technical Architecture Brief | `06-technical-architecture-brief.md` | Deep-dive into zero-knowledge architecture, deployment model, and security design | For CISOs, security architects, and technical evaluators who need to validate the architecture |

### Internal-Only Materials (Do Not Share with Prospects)

| Asset | File | Description | When to Use |
|---|---|---|---|
| Competitive Battlecard | `08-competitive-battlecard.md` | Head-to-head comparisons vs. Okta, Kong, LangChain Security, build-your-own. Landmine questions and objection responses. | Before competitive calls. Review the relevant comparison section to prepare. |
| Pricing Reference | `05-pricing-reference.md` | Full pricing detail: tiers, capabilities, annual discounts, per-agent value breakdowns, common scenarios | When building proposals, answering pricing questions, or sizing a deal |
| Sales Playbook | `07-sales-playbook.md` | Complete sales methodology: ICP, personas, discovery questions, positioning, sales motions, objection handling | Ongoing reference. Review before any significant customer interaction. |

### Links

| Resource | URL |
|---|---|
| Website | tiresias.network |
| Free Trial | tiresias.network/trial |
| Developer Docs | tiresias.network/developers |
| Contact (Sales) | contact@saluca.com |

---

*Saluca LLC | Partner Confidential*
