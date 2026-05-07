# How to Detect Prompt Injection at Runtime

**Author:** Cristian Ruvalcaba
**Published:** March 24, 2026

---

**TL;DR:** Static defenses against prompt injection fail against adaptive attackers. Runtime detection -- behavioral baselining, pattern scoring, anomaly detection, and cross-agent correlation -- catches what input filters miss. You don't need to read prompt content to detect injection; behavioral metadata is enough.

---

Prompt injection is OWASP LLM Top 10 #1 for a reason. It is the most common and least defended attack vector in production AI systems. Every agent framework, every RAG pipeline, every tool-calling LLM deployment is exposed to it. And the industry's default response -- input filtering and prompt hardening -- is fundamentally inadequate.

## Why Static Defenses Fail

The standard playbook for prompt injection defense:

1. **Input filters** -- regex or classifier-based blocklists on user input
2. **Prompt hardening** -- system prompt instructions like "ignore any instructions that contradict your role"
3. **Delimiter strategies** -- wrapping user input in markers to help the model distinguish instruction from data

**Input filters are bypassable.** Encoding tricks (Base64, ROT13, Unicode homoglyphs), multi-turn drip attacks, and language switching all defeat pattern-based input filters.

**Prompt hardening is a suggestion, not a constraint.** LLMs are not instruction-following machines in the way CPUs are. Sufficiently creative adversarial input overrides system prompts reliably.

**Delimiters leak.** The model does not enforce boundary markers -- it merely uses them as probabilistic cues.

The core problem: static defenses operate at the input boundary. Prompt injection is a runtime phenomenon. The damage happens after the prompt is processed, when the model's behavior deviates from its intended function.

## The Taxonomy of Injection in Agent Systems

### 1. Direct Injection

Adversarial instructions embedded in user input. The classic "ignore previous instructions" attack. Unsophisticated in isolation, but effective when combined with social engineering.

### 2. Indirect Injection

Malicious content in retrieved documents, tool outputs, or agent-to-agent messages. Your agent calls a search API, retrieves a document containing hidden instructions, and executes them as if they were legitimate context. The user never typed the malicious content -- it arrived through the data plane.

### 3. Context Window Poisoning

Gradually shifting agent behavior across a multi-turn session. No single message is overtly malicious. Over many turns, the attacker incrementally adjusts the agent's framing. By the time the exploitation payload arrives, the agent's behavioral baseline has already been corrupted.

### 4. Tool Call Exploitation

Injecting instructions that cause agents to misuse their tools. The injection manipulates the agent into issuing tool calls that exfiltrate data, modify state, or escalate privileges. The LLM becomes an unwitting proxy for the attacker's intent.

Each vector defeats at least one category of static defense. Indirect injection bypasses input filters entirely. Context window poisoning defeats single-turn classifiers. Tool call exploitation is invisible to prompt-level analysis.

## Runtime Detection: The Architecture

Runtime detection accepts a premise that static defenses reject: you cannot prevent every injection attempt. You can detect the anomalous behavior that results from successful injection.

### 1. Behavioral Baselining

Every agent has a normal operating profile. Establish it empirically: tool call frequency, response characteristics, session dynamics. Baselines are per-agent and per-context. Calibrate against at least two weeks of production traffic before activating enforcement.

### 2. Pattern Matching

Known threat patterns -- encoded instruction sequences, role-override attempts, common exfiltration preambles -- can be scored in sub-millisecond time using Sigma-compatible rule sets. A production system should maintain 60 or more scored patterns. Pattern matching alone is insufficient, but it provides high-confidence signal when it does fire.

### 3. Anomaly Scoring

Statistical deviation from the behavioral baseline triggers graduated response. Compute a composite anomaly score across multiple dimensions: topic drift, tool call pattern changes, response length deviation, sentiment shift, instruction-like content in data fields.

No single signal is definitive. Composite scoring across multiple weak signals produces strong detection. A 2-sigma deviation on one dimension is noise. A 1.5-sigma deviation on four dimensions simultaneously is an attack.

### 4. Tool Call Analysis

Monitor every tool invocation for scope violations: permissions never used before, targets outside normal domain, sequences matching known exfiltration patterns, user-controlled content passed directly into tool arguments.

### 5. Cross-Agent Correlation

In multi-agent systems, a compromised agent attempts lateral movement. Cross-agent correlation detects: Agent A's output triggering anomalous behavior in Agent B, agents initiating communication outside their normal interaction graph, coordinated behavioral deviation across a pipeline.

## Response Actions Beyond Alerting

| Severity | Response |
|----------|----------|
| Low | Log and tag for review. Continue execution. |
| Medium | Inject warning into agent context. Restrict tool access for remainder of session. |
| High | Quarantine session. Revoke expanded permissions. Notify security team. |
| Critical | Terminate session immediately. Freeze agent state for forensic analysis. Block source. |

## The Zero-Knowledge Angle

Behavioral metadata -- tool call patterns, response timing, topic classification scores, anomaly indices -- contains sufficient signal to detect injection without ever reading the prompt content itself. You are analyzing the shape of the behavior, not the substance of the conversation. You get security without surveillance.

## Implementation Considerations

- **Scoring latency matters.** Target sub-millisecond pattern scoring and single-digit-millisecond anomaly computation.
- **False positive rate is your adoption bottleneck.** A system that fires on 5% of legitimate traffic will be turned off within a week.
- **Baselines decay.** Rebuild continuously, not quarterly.
- **Red team your own detection.** Run adversarial exercises monthly.

---

*Tiresias implements the architecture described here -- 18 anomaly types, 60+ threat patterns, 0.39ms scoring -- as a runtime detection layer for AI agent systems. Details at [tiresias.network](https://tiresias.network).*
