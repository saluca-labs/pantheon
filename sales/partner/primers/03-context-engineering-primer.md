# Context Engineering: Architecting What Your Agent Knows

**Tiresias Partner Program -- Sales Engineer Primer**

---

## What Is Context Engineering?

Context engineering is the discipline of designing what information an AI agent has access to, when it receives that information, and how that information is structured. If prompt engineering is about how you ask, context engineering is about what the agent knows when it answers.

This matters because a language model only knows what is in its context window at the moment it generates a response. Everything outside that window might as well not exist. The agent's context is its entire world, and whoever architects that context controls the agent's behavior far more than the model weights do.

## The Context Window as a Resource

Every language model has a context window: the maximum number of tokens it can process in a single call. Current frontier models offer windows ranging from 128,000 to over 1,000,000 tokens. That sounds enormous, but in practice, context is a finite, expensive, and strategic resource.

**Finite** because even a million-token window fills up when an agent accumulates conversation history, tool results, document retrievals, and system instructions across a multi-step task.

**Expensive** because every token in the context window costs money (input tokens are billed) and time (more tokens means higher latency). Filling a 200,000-token context window when 20,000 tokens would suffice means paying 10x more and waiting longer.

**Strategic** because what you include in the context directly determines the quality of the agent's output. The right 5,000 tokens of relevant context outperforms 50,000 tokens of loosely related information.

Context engineering is the practice of treating this resource with the same rigor that software engineers apply to memory management or database query optimization.

## Context Architecture Patterns

Agents draw on four categories of context, each with different characteristics and governance implications.

### Static Context

Information that remains constant across interactions: system prompts, role definitions, organizational policies, tool descriptions, and behavioral constraints. This is the agent's baseline identity and instructions.

**Governance relevance:** Static context defines what an agent is allowed to do. Changes to static context change the agent's behavior. It should be version-controlled, reviewed, and auditable.

### Dynamic Context

Information that changes with each interaction or step: retrieved documents (via RAG), tool call results, API responses, user inputs, and real-time data. This is what makes each agent interaction unique.

**Governance relevance:** Dynamic context is the primary attack surface for prompt injection. A malicious document retrieved via RAG, a crafted API response, or a manipulated user input can all inject instructions that the agent follows as if they were legitimate.

### Persistent Context

Information that accumulates over time: conversation history, learned user preferences, long-term memory, knowledge base entries, and relationship data. This gives agents continuity across sessions.

**Governance relevance:** Persistent context often contains PII and sensitive business data. It creates data retention and privacy obligations. It also creates drift risk: an agent whose persistent memory is gradually poisoned will degrade in ways that are difficult to detect.

### Ephemeral Context

Temporary working memory: chain-of-thought reasoning, scratchpads, intermediate calculations, and draft outputs that the agent uses during a task but does not retain. This is the agent's internal workspace.

**Governance relevance:** Ephemeral context can contain sensitive data that was never meant to persist. If ephemeral context is logged, cached, or inadvertently included in future prompts, it creates unintended data exposure.

## Context Management Strategies

As agents handle longer and more complex tasks, context management becomes critical.

**Summarization.** Compress older conversation history or long documents into concise summaries that preserve key information while reducing token count. Effective but lossy: important details can be dropped if the summarization is poorly tuned.

**Sliding windows.** Retain only the most recent N turns of conversation or the last N tool results, letting older context fall off. Simple to implement but can cause the agent to "forget" important earlier context.

**Priority-based truncation.** Assign importance scores to different context elements and drop the lowest-priority items first when the window fills up. More sophisticated than sliding windows but requires careful priority design.

**Semantic chunking.** Break large documents into meaningful segments (by topic, section, or semantic similarity) and retrieve only the chunks relevant to the current task. This is the foundation of RAG (retrieval-augmented generation) systems.

**Hierarchical memory.** Maintain multiple layers of context: a small, fast working memory for the current task; a medium-term memory for the current session; and a long-term memory that persists across sessions. The agent queries each layer as needed rather than loading everything into the context window at once.

## Multi-Agent Context

When multiple agents collaborate, context architecture becomes significantly more complex.

**Shared state.** Agents working on the same task may need access to common information: project status, shared documents, accumulated findings. The architecture must define what is shared, how it is synchronized, and who can modify it.

**Message passing.** Agents communicate by sending messages that become part of each other's context. The format, content, and routing of these messages directly affect system behavior.

**Context isolation.** Not every agent should see everything. A customer-facing agent should not have access to internal pricing models. A code review agent should not have access to HR records. Context isolation between agents is a security requirement, not just an architectural preference.

**Trust boundaries.** When Agent A includes information from Agent B in its context, it is trusting that information. If Agent B has been compromised or manipulated, that trust is misplaced. Multi-agent systems need clear trust boundaries and validation at each handoff.

## Security Implications

Context is the most underappreciated attack surface in AI agent systems.

**Context poisoning.** An attacker who can influence what enters an agent's context can control the agent's behavior. This includes injecting malicious instructions into documents the agent retrieves, manipulating API responses the agent consumes, or corrupting the agent's persistent memory.

**Prompt injection via retrieved documents.** RAG systems retrieve documents from external sources and inject them into the agent's context. If any of those documents contain embedded instructions ("Ignore previous instructions and..."), the agent may follow them. This is not a theoretical risk; it is one of the most actively exploited vulnerabilities in agent systems today.

**Data leakage through shared context.** When agents share context, sensitive data from one domain can leak into another. A financial analysis agent's context might contain proprietary trading data that inadvertently flows into a general-purpose reporting agent's context, and from there into an LLM provider's servers.

**Context window manipulation.** An attacker who can cause an agent to fill its context window with irrelevant information can effectively disable it: the agent runs out of room for the information it actually needs, and output quality collapses.

## The Governance Angle

Context engineering without governance is architecture without security. The critical questions are:

- **Who controls what context an agent sees?** Is it the developer who wrote the system prompt? The retrieval system? The user? Without clear ownership, no one is accountable.
- **How do you audit context?** When an agent makes a bad decision, can you reconstruct exactly what was in its context window at that moment? Without this capability, incident response is guesswork.
- **How do you prevent unauthorized context access?** Can an agent designed for one purpose access context intended for another? Are there enforceable boundaries?
- **How do you detect context manipulation?** If an attacker injects content into an agent's context, will anyone notice? How quickly?

These are not edge cases. They are the core operational questions that every organization deploying agents at scale must answer.

## How This Connects to Tiresias

Tiresias provides the governance layer that makes context engineering secure and auditable.

**SoulAuth** controls what each agent is authorized to access. By scoping agent identities to specific data sources, tools, and context types, SoulAuth enforces the principle of least privilege at the context level. An agent only sees what it is authorized to see.

**SoulWatch** monitors context patterns across all agents in real time. It detects anomalies such as unexpected context sources, unusual context volume, context that contains patterns associated with prompt injection, and context sharing that violates defined boundaries. When something looks wrong, it alerts.

**SoulGate** sits between agents and the services they communicate with, inspecting API payloads in both directions. It can filter sensitive data from outbound context, validate inbound context against policy, and block requests that violate context governance rules.

Together, these three components answer the governance questions: SoulAuth controls access, SoulWatch provides audit and detection, and SoulGate enforces policy at the data layer.

---

*This primer is part of the Tiresias Partner Program Sales Toolkit. For product documentation, visit tiresias.network.*
