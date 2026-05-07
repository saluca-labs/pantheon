# SALUCA-033 — Provisional Patent Application (DRAFT)

**Working Title:** Tamper-Evident Chain-of-Thought Reasoning Audit with Hash-Linked Integrity Verification and Cross-Transport Agent Tool Invocation Observability

**Inventor:** Cristian Xavier Ruvalcaba
**Assignee:** Saluca LLC
**Status:** DRAFT — Review with counsel before filing
**Firm assignment:** Firm 2 (01_TIRESIAS group) — AI Infra/SaaS
**Related patents:** SALUCA-014 (multi-provider proxy), SALUCA-015 (unified observability), SALUCA-005 (cross-layer security orchestration), SALUCA-018 (interceptive defense)
**Product:** Tiresias v2.3 Aletheia
**Tier:** Enterprise / MSSP

---

## Abstract

A system and method for tamper-evident auditing of artificial intelligence agent reasoning and tool interactions across heterogeneous transport mechanisms. The system comprises: (1) a proxy-layer interceptor that extracts chain-of-thought reasoning traces from large language model responses across multiple providers, computes cryptographic hashes of extracted reasoning content, and links successive hashes into a tamper-evident chain anchored to a tenant-specific genesis entry; (2) a command-line interface shim that transparently wraps agent tool invocations regardless of transport protocol, captures invocation telemetry, evaluates tool-use policies prior to execution, and scans tool responses for adversarial content injection before the response reaches the agent; and (3) a unified audit engine that ingests both reasoning chain entries and tool invocation events, enabling compliance verification through hash-based proofs that demonstrate reasoning occurred at a specific time without requiring disclosure of the reasoning content itself.

---

## Field of the Invention

The present invention relates to AI agent security and observability, and more particularly to methods for cryptographically verifiable auditing of AI agent reasoning processes and tool interactions in multi-provider, multi-transport agent architectures.

---

## Background

### Problem 1: Reasoning Opacity

Modern large language models (LLMs) including those from Anthropic (Claude), OpenAI (GPT/o-series), and Google (Gemini) support chain-of-thought (CoT) reasoning in which the model generates intermediate reasoning steps before producing a final output. These reasoning traces are critical for understanding *why* an agent made a decision, not merely *what* it decided.

Current observability systems capture the input prompt and output response but discard or ignore the reasoning traces between them. In regulated industries (financial services, healthcare, legal), auditors require proof that an AI agent reasoned correctly about a decision at a specific point in time. Without tamper-evident reasoning audit, organizations cannot satisfy these compliance requirements.

Furthermore, reasoning traces are emitted in provider-specific formats (Anthropic `thinking` content blocks, OpenAI reasoning token counts, Gemini thinking-budget annotated response parts), requiring a normalization layer to achieve cross-provider reasoning observability.

### Problem 2: Tool-Side Blindness

AI agents increasingly interact with external tools (email systems, file storage, databases, cloud APIs) through command-line interfaces (CLIs) rather than through protocol-specific middleware such as the Model Context Protocol (MCP). When an agent invokes a CLI tool, the invocation and its response are invisible to LLM-layer proxy monitoring systems.

This creates three security gaps: (a) no audit trail of what tools the agent used and what data was accessed; (b) no ability to enforce tool-use policies before execution; and (c) no scanning of tool responses for adversarial content (e.g., prompt injection hidden in a document retrieved via CLI).

### Problem 3: Transport Fragmentation

The AI agent ecosystem is fragmenting across multiple tool-integration transports: MCP servers, REST APIs, CLI tools, and direct subprocess invocations. A monitoring system that only observes one transport layer provides incomplete coverage. There is a need for transport-agnostic tool invocation observability.

---

## Summary of the Invention

The invention provides:

1. **A chain-of-thought hash chain** — a tamper-evident linked data structure in which each entry contains a cryptographic hash (SHA-512) of the reasoning content extracted from an LLM response, linked to the previous entry's hash, forming a verifiable chain anchored to a tenant-specific genesis hash. The chain enables "prove-without-exposing" verification: an auditor can confirm that reasoning of a specific length occurred at a specific time, by a specific model, without accessing the reasoning content itself.

2. **A cross-provider CoT extraction module** — operating within an LLM proxy, extracts reasoning traces from Anthropic thinking blocks, OpenAI reasoning tokens, Gemini thinking-annotated parts, and scaffold-generated reasoning in local models, normalizing them into a common format for hashing and storage.

3. **A transport-agnostic tool invocation shim** — a lightweight executable that wraps any command-line tool invocation, captures telemetry (command, arguments, output hash, timing, exit status, agent identity), evaluates tool-use policies before execution, and scans tool output for adversarial content injection before the output reaches the agent.

4. **A response sanitizer** — scans tool output for prompt injection patterns, credential exposure, data exfiltration instructions, and encoding-based evasion techniques, operating in configurable modes (passthrough, warn, block) and utilizing pattern sets extensible through a policy repository.

5. **A unified audit engine** — ingests both CoT chain entries and tool invocation events into a common audit store with per-tenant encryption, enabling cross-layer correlation (linking an agent's reasoning to the tool actions it subsequently took) and compliance-ready proof export.

---

## Detailed Description

### 1. Chain-of-Thought Hash Chain

#### 1.1 Chain Structure

The CoT hash chain is a per-tenant linked data structure. Each entry E_i contains:

- `entry_index`: monotonically increasing integer
- `request_id`: unique identifier linking to the LLM request that produced this reasoning
- `timestamp`: time of capture
- `model`: identifier of the LLM model (e.g., "claude-opus-4-6")
- `provider`: LLM provider identifier (e.g., "anthropic", "openai", "google")
- `agent_id`: identifier of the agent that made the request
- `cot_hash`: SHA-512(raw_reasoning_content)
- `cot_token_count`: number of tokens in the reasoning trace
- `cot_byte_count`: byte length of the reasoning trace
- `prev_hash`: the `entry_hash` of entry E_{i-1}
- `entry_hash`: SHA-512(entry_index || request_id || timestamp || cot_hash || prev_hash)

The genesis entry E_0 has `prev_hash = SHA-512(tenant_id)`, anchoring the chain to the tenant's cryptographic identity.

#### 1.2 Integrity Verification

To verify chain integrity over a range [E_a, E_b]:

```
For each E_i in [E_a, E_b]:
  1. Recompute: h = SHA-512(E_i.entry_index || E_i.request_id || E_i.timestamp || E_i.cot_hash || E_i.prev_hash)
  2. Assert: h == E_i.entry_hash
  3. If i > a: Assert: E_i.prev_hash == E_{i-1}.entry_hash
```

Any modification to any field in any entry breaks the chain from that point forward, providing tamper evidence.

#### 1.3 Prove-Without-Exposing Protocol

An auditor receives:
- `entry_hash`, `cot_hash`, `cot_token_count`, `cot_byte_count`, `model`, `provider`, `timestamp`
- Chain verification status (intact/broken, first broken link if any)

The auditor can verify:
- Reasoning occurred (cot_hash is non-null, cot_token_count > 0)
- Reasoning was of expected length
- The chain is intact (no tampering)
- The correct model was used

The auditor does NOT receive:
- The actual reasoning content
- The prompt that generated it
- Any other tenant data

This enables compliance verification without content disclosure.

#### 1.4 Optional Content Storage

When a tenant opts into full content storage, the reasoning trace is encrypted using AES-256-GCM with the tenant's data encryption key (DEK), which is itself wrapped by a key encryption key (KEK). Content retrieval requires explicit authorization (audit:read scope) and is logged in the audit trail.

Content retention may be configured independently of hash retention — a tenant can keep hashes for 10 years while retaining content for only 90 days, maintaining the ability to prove reasoning occurred long after the content is purged.

### 2. Cross-Provider CoT Extraction

#### 2.1 Anthropic

The proxy inspects LLM responses for content blocks where `type == "thinking"`. The `thinking` field contains the full reasoning trace. Extraction occurs when the agent has enabled thinking in the request (via `thinking.enabled` parameter). An optional tenant policy (`cot_inject_thinking`) causes the proxy to inject this parameter into requests where the agent has not set it, at the tenant's discretion and cost acceptance.

#### 2.2 OpenAI

The proxy inspects response `usage.completion_tokens_details.reasoning_tokens` for reasoning token counts. Where the API exposes reasoning content (current or future versions), the content is extracted. Where only token counts are available, a chain entry is created with `cot_hash = SHA-512("reasoning_tokens:" || count)` and `content_stored = false`, recording that reasoning occurred and its scale without content.

#### 2.3 Google Gemini

The proxy inspects response `candidates[].content.parts[]` for parts where `thought == true`. The text content of thinking-annotated parts is extracted as the reasoning trace.

#### 2.4 Local Models

For locally-hosted models (Ollama, vLLM, etc.) that do not natively emit reasoning traces, the proxy applies pattern matching to detect scaffold-generated reasoning markers (e.g., `<thinking>...</thinking>` blocks) and extracts their content on a best-effort basis.

### 3. Transport-Agnostic Tool Invocation Shim

#### 3.1 Architecture

The shim is a standalone executable (`tiresias-exec`) that acts as a transparent prefix to any CLI command:

```
tiresias-exec [options] <command> [arguments...]
```

The shim:
1. Resolves agent identity from CLI flags, environment variables, configuration file, or JWT token claims (in priority order)
2. Optionally evaluates tool-use policy by querying the policy engine
3. Executes the wrapped command as a subprocess, capturing stdout, stderr, exit code, and wall time
4. Optionally scans the command output through the response sanitizer
5. Asynchronously reports telemetry to the audit engine
6. Passes the command output (or sanitized replacement) to the calling process

#### 3.2 Fail-Open Design

When the audit engine or policy engine is unreachable, the shim:
- Skips policy evaluation (fail-open)
- Skips sanitization (fail-open)
- Writes telemetry to a local append-only log file
- Retries sync in the background with exponential backoff

This ensures that security monitoring never blocks agent productivity.

#### 3.3 Output Hashing Without Content Capture

By default, the shim computes SHA-512 hashes of stdout and stderr without transmitting the content to the audit engine. This provides a verifiable record of what output the agent received without creating a copy of potentially sensitive data. Full content capture is opt-in per tenant policy.

#### 3.4 Transport Agnosticism

The shim wraps any CLI command regardless of whether it interfaces with a REST API, a local tool, an MCP server wrapper, a database client, or a cloud provider CLI. This makes the monitoring layer independent of the tool integration transport.

### 4. Response Sanitizer

#### 4.1 Pattern Categories

The sanitizer applies pattern matching against tool output in the following categories:

- **Direct prompt injection**: Instructions embedded in tool output that attempt to override the agent's system prompt or behavioral constraints (e.g., "ignore previous instructions", "you are now", "system: override")
- **Indirect prompt injection**: Instructions encoded using Unicode tricks (zero-width characters, homoglyphs), base64, hexadecimal, or other encoding schemes
- **Credential exposure**: Patterns matching common secret formats (API keys, tokens, passwords, connection strings) that should not propagate to the LLM context
- **Data exfiltration instructions**: Tool output containing directives to transmit data to external endpoints
- **Encoding evasion**: Multiple decoding passes (raw, base64-decoded, Unicode-normalized, HTML entity-decoded) to catch evasion techniques

#### 4.2 Operating Modes

| Mode | Behavior |
|------|----------|
| Passthrough | No scanning; event logged for audit completeness |
| Warn | Scan and log findings; output passed to agent unchanged |
| Block | Scan and, if patterns match above threshold, replace output with a sanitized message; original output encrypted and stored for forensic review |

### 5. Unified Audit Engine

#### 5.1 Event Correlation

The audit engine stores CoT chain entries and tool invocation events in a common store, indexed by tenant, agent, and timestamp. Cross-layer queries enable:

- **Reasoning-to-action correlation**: "What tool invocations did the agent make within 30 seconds of this reasoning trace?"
- **Action-to-reasoning tracing**: "What was the agent reasoning about when it decided to access this file?"
- **Anomaly detection**: Significant divergence between reasoning token count and subsequent action complexity may indicate reasoning trace manipulation or prompt injection

#### 5.2 Proof Export

The system generates exportable audit proofs in structured format (JSON) containing:
- CoT chain entries (hashes, metadata, chain verification status)
- Tool invocation records (commands, policy verdicts, sanitizer verdicts)
- Cross-reference links between reasoning and tool events
- Cryptographic verification that the exported data matches the on-system chain

---

## Claims

### Independent Claims

1. A computer-implemented method for tamper-evident auditing of artificial intelligence agent reasoning, comprising:
   (a) intercepting, at a proxy layer between an AI agent and a large language model provider, a response containing a chain-of-thought reasoning trace;
   (b) extracting the reasoning trace from the response in a provider-specific format;
   (c) computing a first cryptographic hash of the extracted reasoning trace;
   (d) retrieving a previous hash from a chain data structure associated with the agent's tenant;
   (e) computing an entry hash from a combination of a monotonic index, a request identifier, a timestamp, the first cryptographic hash, and the previous hash;
   (f) storing the entry hash and the first cryptographic hash in the chain data structure, thereby extending a tamper-evident linked chain; and
   (g) forwarding the response, including the reasoning trace, unmodified to the AI agent.

2. A computer-implemented method for transport-agnostic monitoring of AI agent tool invocations, comprising:
   (a) receiving, at a shim executable, a command intended for execution by an AI agent;
   (b) resolving an agent identity associated with the command;
   (c) evaluating the command against a tool-use policy to produce a policy verdict;
   (d) upon a permissive policy verdict, executing the command as a subprocess and capturing output;
   (e) scanning the captured output against a set of adversarial content patterns to produce a sanitizer verdict;
   (f) computing a cryptographic hash of the captured output;
   (g) transmitting the agent identity, command, policy verdict, sanitizer verdict, and output hash to an audit engine; and
   (h) providing the captured output, or a sanitized replacement based on the sanitizer verdict, to the AI agent.

3. A system for compliance-verifiable AI agent reasoning audit without content disclosure, comprising:
   (a) a hash chain storage comprising a sequence of entries, each entry containing a cryptographic hash of a reasoning trace and linked to the preceding entry's hash;
   (b) a verification module configured to validate chain integrity over a specified range by recomputing entry hashes from stored components;
   (c) a proof generation module configured to produce a proof document containing entry metadata, hash values, and chain verification status, without including the reasoning trace content; and
   (d) an access control module configured to restrict reasoning trace content retrieval to authorized audit roles while permitting hash-based proof access to compliance verifiers.

### Dependent Claims

4. The method of claim 1, wherein extracting the reasoning trace comprises:
   (a) for Anthropic-format responses, extracting content from blocks where type equals "thinking";
   (b) for OpenAI-format responses, extracting reasoning token counts from usage metadata;
   (c) for Gemini-format responses, extracting text from response parts annotated with a thinking indicator.

5. The method of claim 1, further comprising encrypting the reasoning trace content using per-tenant envelope encryption (AES-256-GCM with a data encryption key wrapped by a key encryption key) and storing the encrypted content with an independent retention period from the hash chain entries.

6. The method of claim 2, wherein upon the shim being unable to reach the audit engine, the shim:
   (a) executes the command without policy evaluation;
   (b) writes telemetry to a local append-only log; and
   (c) retries transmission to the audit engine with exponential backoff.

7. The method of claim 2, wherein scanning the captured output comprises multiple decoding passes including raw content, base64-decoded content, Unicode-normalized content, and HTML entity-decoded content, to detect encoding-based evasion of adversarial content patterns.

8. The method of claim 2, wherein the shim computes the cryptographic hash of the captured output without transmitting the output content to the audit engine, thereby providing a verifiable record of tool output without creating a content copy.

9. The system of claim 3, further comprising a cross-layer correlation module configured to link reasoning chain entries to tool invocation events by agent identity and temporal proximity, enabling queries that relate what an agent reasoned about to what tools it subsequently invoked.

10. The method of claim 1, further comprising gating the chain-of-thought interception and hash chain storage to specified license tiers, such that tenants below the required tier do not incur the computational or storage cost of reasoning trace capture.

11. The method of claim 2, wherein the tool-use policy comprises per-agent override rules, command pattern matching, argument pattern matching, and rate limiting, and wherein the policy is hot-reloadable without service restart.

12. The method of claim 1, further comprising:
    (a) evaluating the intercepted request against a chain-of-thought policy that specifies whether reasoning must be enabled;
    (b) upon determining that the request lacks a reasoning enablement parameter and the policy requires reasoning, performing one of: (i) injecting the reasoning enablement parameter into the request before forwarding to the LLM provider, (ii) rejecting the request with a policy violation response, or (iii) forwarding the request and recording a policy violation in the audit trail;
    (c) when injecting the reasoning parameter, tagging the resulting token cost in the audit trail as policy-mandated to distinguish it from agent-requested reasoning cost.

13. A method for generating a compliance audit proof for AI agent reasoning, comprising:
    (a) receiving a set of request identifiers corresponding to AI agent interactions;
    (b) retrieving hash chain entries corresponding to the request identifiers;
    (c) verifying chain integrity across the retrieved entries;
    (d) generating a structured proof document containing entry hashes, reasoning token counts, model identifiers, timestamps, and chain verification results; and
    (e) outputting the proof document without including reasoning trace content.

---

## Novelty Assessment (Internal — Do Not Include in Filing)

**Strongest novel elements:**
1. Hash-linked chain specifically for CoT/reasoning traces with prove-without-exposing protocol — no prior art found for tamper-evident reasoning audit that preserves content privacy
2. Cross-provider CoT normalization and hashing (Anthropic/OpenAI/Gemini in one chain) — existing observability tools are single-provider
3. Transport-agnostic tool invocation monitoring via prefix shim with integrated policy evaluation and response sanitization — existing tools are transport-specific (MCP-only or API-only)
4. Cross-layer correlation between reasoning events and tool invocation events in a unified audit store
5. Fail-open design with hash-only telemetry (no content capture by default) addresses the privacy paradox of security monitoring
6. **CoT policy enforcement at proxy layer** — enterprise can mandate "all agents must have thinking enabled" as a compliance policy, enforced by the proxy (inject/reject/warn) without agent code changes. Cost attribution separates policy-mandated reasoning cost from agent-requested cost. No prior art for proxy-enforced reasoning mandates.

**Prior art to review:**
- Google Model Armor (GWS CLI `--sanitize` flag) — scans responses for prompt injection but is single-tool (Google only), not transport-agnostic, no hash chain
- Anthropic prompt caching / thinking blocks documentation — describes the format but not auditing it
- OpenTelemetry for LLMs — observability but not tamper-evident, no hash chain, no tool-side monitoring
- Langfuse / LangSmith — LLM observability platforms, capture CoT when available but no hash chain integrity, no tool-side shim, no sanitization
- SALUCA-015 (own prior art) — unified observability with envelope encryption, but does not cover CoT hash chain or tool invocation monitoring

**Relationship to existing portfolio:**
- Extends SALUCA-014 (proxy now also captures CoT)
- Extends SALUCA-015 (unified observability now includes reasoning + tool layers)
- Extends SALUCA-018 (interceptive defense now operates on tool responses, not just LLM prompts)
- Extends SALUCA-005 (cross-layer orchestration now includes reasoning and tool layers)
- Does NOT overlap with SALUCA-008/009 (those are about memory integrity, not reasoning audit)

**Recommendation:** File as standalone provisional (SALUCA-033). Strong independent claims. Assign to Firm 2 (01_TIRESIAS group). Consider PCT filing for international protection given enterprise market.
