# Agent-to-Agent Traffic: The Visibility Gap Your SOC Can't Afford to Ignore

**Author:** Cristian Ruvalcaba
**Published:** March 24, 2026

---

**TL;DR:** Multi-agent AI systems are shipping to production, and agent-to-agent communication is creating a lateral movement vector that your SOC has zero visibility into. Network monitoring sees API calls but not agent intent. Application logs capture tool invocations but not behavioral context. Your SIEM doesn't even have a concept of "agent session." This is the blind spot, and it's growing every week.

---

I've spent enough time reconstructing attacks from incomplete logs to know what a visibility gap feels like. You're three hours into an incident, correlating firewall logs with endpoint telemetry and authentication events, and you hit a wall. The data you need simply wasn't captured. The trail goes cold.

That's exactly where we are right now with multi-agent AI systems -- except most SOCs don't even know the trail exists.

## The Blind Spot You Haven't Scoped

Your SOC monitors network traffic. It monitors endpoint behavior. It correlates user authentication events. You've spent years building detection logic around humans interacting with systems.

But here's the scenario nobody's writing detection rules for: Agent A calls Agent B, which invokes a tool, which queries a database, which returns results that Agent A then passes to Agent C for summarization before pushing to a customer-facing API. Five hops. Three agents. Two tools. One database query. Zero visibility in your SIEM.

Who authorized that chain? Which agent decided to query that database? Was Agent B supposed to have access to that tool? Did the data that left through Agent C match what was retrieved in the first place?

If you can't answer those questions, you have an unmonitored lateral movement path running through your infrastructure.

## Why This Matters Right Now

Multi-agent orchestration frameworks -- LangGraph, CrewAI, AutoGen, OpenClaw, NemoClaw -- are shipping to production today. Engineering teams are deploying agent workflows that coordinate across services, databases, and external APIs. These aren't toy demos. They're handling customer data, making API calls with production credentials, and operating with real permissions.

The adoption curve is steep. The security instrumentation curve is flat. That delta is your exposure.

## The Attack Surface Nobody's Modeling

### 1. Agent Impersonation

In most current architectures, agent identity is an API key or a role string in a configuration file. There's no cryptographic binding between an agent's claimed identity and its actual provenance. One agent pretending to be another to access restricted tools isn't a sophisticated attack -- it's a configuration change.

### 2. Privilege Escalation via Delegation

Agent A has read-only access. Agent B has read-write access. Agent A asks Agent B to perform a write operation on its behalf. In what system is that delegation logged? In what SIEM rule is that escalation detected? In most current deployments: nowhere. The write operation shows up as Agent B performing an authorized action. The fact that Agent A initiated it is invisible.

### 3. Data Exfiltration Through Agent Chains

Single-point DLP works when data moves from point A to point B. But when sensitive data is retrieved by Agent A, passed to Agent B for "processing," forwarded to Agent C for "formatting," and sent to an external endpoint by Agent D -- your DLP saw four normal-looking operations. No single hop triggered a rule. The exfiltration happened across the chain, not at any individual link.

### 4. Consensus Manipulation

Some agent architectures use voting or consensus mechanisms. If an attacker can compromise enough agents in the voting pool, they shift group outcomes without any single agent behaving anomalously. Each compromised agent's vote looks legitimate in isolation. The manipulation is only visible at the aggregate level.

## Why Your Current Stack Can't See This

**Network-level monitoring** sees HTTP requests between services. It cannot tell you that the call was initiated by a specific agent, as part of a specific workflow, with a specific intent.

**Application logs** capture what happened but not why. Two identical tool calls can have completely different risk profiles depending on what triggered them.

**Your SIEM** has no concept of an agent session. A multi-step agent workflow that spans twelve tool calls across three services over ninety seconds is twelve unrelated events. The correlation that would reveal the attack doesn't exist because the abstraction layer doesn't exist.

You can't detect what you can't model. Right now, your detection stack doesn't model agents.

## What Actual Visibility Looks Like

**Per-agent cryptographic identity.** Every agent needs a verifiable identity that's cryptographically bound -- not an API key that can be copied, not a role string that can be spoofed.

**Behavioral baselines.** What does normal agent-to-agent traffic look like for a given workflow? Without baselines, you can't define anomalies.

**Session-aware correlation.** Trace an action across the full agent chain -- from initial trigger through every delegation, tool call, and data handoff -- as a single correlated session.

**Sigma-compatible detection rules.** Your SOC has existing workflows built on Sigma rules. Agent-aware detection logic needs to plug into that ecosystem, not replace it.

**Real-time anomaly scoring.** Post-incident detection is valuable for forensics. It's useless for containment. Agent-to-agent anomalies need to be scored and surfaced in real time.

## The Window Is Closing

Every week, more agent workflows ship to production without security instrumentation. We've been here before. We spent a decade bolting security onto cloud infrastructure after the fact. We have an opportunity to instrument agent-to-agent communication correctly from the start, before the attack patterns become case studies.

The organizations that build agent-aware detection now will have baselines, historical data, and tuned rules when the first real incidents hit. Everyone else will be reconstructing attacks from incomplete logs. Again.

---

*[Tiresias](https://tiresias.network) provides behavioral analytics, Sigma-compatible detection rules, and native SIEM connectors for agent-to-agent traffic monitoring.*
