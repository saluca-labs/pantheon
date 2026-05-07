# AI Agents: What They Are and Why They Need Governance

**Tiresias Partner Program -- Sales Engineer Primer**

---

## What Is an AI Agent?

An AI agent is autonomous software that does not just answer questions; it takes actions. Where a traditional chatbot responds to a prompt and stops, an agent receives a goal, reasons about how to achieve it, selects tools, executes steps, evaluates results, and iterates until the goal is met.

Think of the difference this way: a chatbot is a reference librarian who answers your question. An agent is an employee who takes your request, researches it, writes the report, emails the stakeholders, and updates the project tracker, all without you hovering over their shoulder.

## How Agents Differ From Chatbots

| Capability | Chatbot | Agent |
|---|---|---|
| **Tool use** | None or limited | Calls APIs, queries databases, executes code, browses the web |
| **Multi-step reasoning** | Single turn | Plans and executes across many steps, adjusting as it goes |
| **Persistent state** | Stateless or session-only | Maintains memory across interactions and tasks |
| **Delegation** | Never | Can assign subtasks to other agents or services |
| **Autonomy** | Responds when prompted | Initiates actions, monitors conditions, acts on triggers |

The key distinction is agency: an agent makes decisions about what to do next, often without human approval at every step.

## Common Agent Architectures

Understanding these patterns helps when discussing governance requirements with prospects.

**ReAct (Reason + Act):** The agent alternates between reasoning ("I need to look up the customer's account") and acting (calling the CRM API). This is the most common pattern in production today.

**Tool-use chains:** The agent has access to a defined set of tools (functions, APIs, databases) and selects which ones to call based on the task. Each tool call returns results that inform the next decision.

**Multi-agent systems:** Multiple specialized agents collaborate on a task. One agent might handle research, another writes content, and a third reviews for quality. They pass messages and share context.

**Hierarchical agents:** A supervisor agent breaks a complex goal into subtasks and delegates them to worker agents, then synthesizes the results. Common in enterprise deployments where different agents have different access levels.

## Where Agents Are Deployed Today

Agents are not theoretical. They are running in production across industries right now:

- **Customer service:** Agents that resolve support tickets end to end, not just suggesting answers but actually processing refunds, updating accounts, and escalating edge cases.
- **Code generation:** Development agents that write code, run tests, fix bugs, and submit pull requests. Some engineering teams report 30-40% of their commits now involve agent assistance.
- **Data analysis:** Agents that ingest datasets, generate hypotheses, run statistical analyses, produce visualizations, and write summary reports.
- **Security operations:** Agents that triage alerts, investigate incidents, correlate threat intelligence, and execute containment playbooks.
- **Sales automation:** Agents that research prospects, personalize outreach, schedule meetings, and update CRM records.
- **DevOps:** Agents that monitor infrastructure, diagnose issues, apply remediation, and manage deployment pipelines.

**73% of enterprises are now deploying or actively piloting AI agents** in production environments, a number that has doubled in the past 12 months.

## The Governance Gap

Here is the problem. Every one of those agents has:

- **An identity** (credentials, API keys, service accounts)
- **Decision-making authority** (choosing what actions to take)
- **Data access** (reading databases, files, APIs, sometimes sensitive ones)
- **External reach** (calling third-party services, sending messages, modifying records)

And most of them have **zero security controls** purpose-built for AI agents.

Organizations are applying human identity management to non-human actors. They are trusting agent decisions without audit trails. They are granting broad API access without understanding what the agent actually does with it. They are sharing sensitive data through prompts and context without monitoring what flows where.

This is not a theoretical risk. It is a live vulnerability in most enterprises today.

## Why This Matters

**Compliance:** SOC 2, NIST, ISO 27001, and emerging AI regulations all require controls over automated systems that access sensitive data. Agents that operate without governance put audit certifications at risk.

**Liability:** When an agent takes an unauthorized action (approving a transaction, sending a communication, modifying a record), who is responsible? Without governance, there is no answer.

**Data privacy:** Agents routinely process PII, financial data, and proprietary information. GDPR, CCPA, and industry regulations require controls over how that data is accessed, processed, and retained. Agents that pass data through prompts to third-party LLM providers create data residency and privacy questions that most organizations cannot currently answer.

**Operational risk:** An agent with broad permissions and no monitoring is an insider threat waiting to happen, whether through prompt injection, model hallucination, or simple misconfiguration.

## Real Examples of Agent Failures

These are not hypothetical scenarios. They have happened in production:

- **Prompt injection:** Attackers embed malicious instructions in documents, emails, or web pages that agents process. The agent follows the injected instructions, believing them to be legitimate, and exfiltrates data or takes unauthorized actions.
- **Data exfiltration:** Agents with broad data access and the ability to call external APIs have been exploited to send sensitive information to attacker-controlled endpoints, often by manipulating the agent's tool-use capabilities.
- **Unauthorized actions:** Agents granted overly permissive credentials have executed actions outside their intended scope: deleting records, modifying configurations, approving transactions, all without human review.
- **Context poisoning:** In multi-agent systems, a compromised or manipulated agent can inject false information into the shared context, causing downstream agents to make decisions based on corrupted data.

## How Tiresias Addresses This

Tiresias provides purpose-built governance for AI agents across three pillars:

**SoulAuth (Identity and Access):** Every agent gets a verified identity with scoped permissions. Instead of sharing a single API key, each agent authenticates individually, and its access is limited to exactly what it needs. This is the principle of least privilege, applied to AI agents.

**SoulWatch (Monitoring and Audit):** Every agent action, every tool call, every data access is logged and monitored in real time. Anomalous behavior triggers alerts. Compliance teams get the audit trail they need. Security teams get visibility they have never had.

**SoulGate (API Security):** Every API call an agent makes passes through a security layer that inspects payloads, enforces policies, detects prompt injection attempts, and prevents data leakage. Think of it as a firewall built specifically for the way agents communicate.

Together, these three components close the governance gap: agents get identities, their actions get monitored, and their communications get secured.

---

*This primer is part of the Tiresias Partner Program Sales Toolkit. For product documentation, visit tiresias.network.*
