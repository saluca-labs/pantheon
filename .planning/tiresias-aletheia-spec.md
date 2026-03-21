# Tiresias v2.3 — Aletheia: Full-Stack Agent Observability

**Version:** 0.1.0 (Draft)
**Author:** Alfred / Cristian Ruvalcaba
**Date:** 2026-03-21
**Tier:** Enterprise + MSSP only
**Repos:** salucallc/tiresias (backend + portal), salucallc/stitch (deployment)
**Patent relevance:** Strengthens SALUCA-014 (multi-provider proxy), SALUCA-015 (unified observability). CoT hash chain + tool-side observability may be independently novel — evaluate with counsel.

---

## 1. Problem Statement

Tiresias v2.0–v2.2 monitors the **LLM proxy layer**: prompts going to providers, responses coming back, prompt risk heuristics, anomaly detection, quarantine. This covers one surface of agent behavior — what the agent *asks* and what the model *answers*.

Two critical surfaces remain blind:

1. **Tool-side actions.** When an agent invokes external tools (Gmail, Drive, databases, APIs) via CLI or subprocess, Tiresias has no visibility into what was invoked, what data was returned, or whether the response contained prompt injection. The industry is shifting toward CLI-based tool interfaces (Google GWS CLI, CLI-Anything, native bash tool use in Claude Code / Codex). MCP-based tool use loaded tool definitions into the LLM context window; CLI-based tool use is opaque to the proxy.

2. **Chain of Thought / Reasoning.** Modern LLMs emit reasoning traces (Anthropic thinking blocks, OpenAI reasoning tokens, Gemini thinking budget). These traces reveal *why* an agent made a decision, not just *what* it decided. For regulated industries, proving that an agent reasoned correctly at timestamp T is a compliance requirement. Current Tiresias captures input/output but not the reasoning between them.

### 1.1 Threat Model Extension

| Attack Vector | Current Coverage | Aletheia Coverage |
|--------------|-----------------|-------------------|
| Prompt injection in LLM request | PRH engine (60 patterns) | Same |
| Prompt injection in tool response (e.g., hidden instruction in a Google Doc read via CLI) | **BLIND** | Response Sanitizer scans tool output before agent sees it |
| Data exfiltration via tool (agent reads sensitive doc, passes to LLM) | Partially visible (prompt contains data) | Tool invocation audit trail shows what was accessed |
| Unauthorized tool use (agent runs destructive CLI command) | **BLIND** | Action Gate evaluates tool policy before execution |
| Reasoning tampering / audit failure | **BLIND** | CoT hash chain provides tamper-evident reasoning audit |
| Compliance: "prove the agent reasoned correctly" | Cannot — only input/output logged | CoT stored encrypted, hash proves existence without exposing content |

---

## 2. Architecture Overview

```
                          ┌─────────────────────────────────────┐
                          │           AI Agent Runtime          │
                          │  (Claude Code, Codex, custom agent) │
                          └──────────┬──────────┬───────────────┘
                                     │          │
                          LLM call   │          │  Tool invocation
                                     │          │
                    ┌────────────────▼──┐    ┌──▼──────────────────┐
                    │    SoulGate       │    │   tiresias-exec     │
                    │  (existing proxy) │    │   (new CLI shim)    │
                    │                   │    │                     │
                    │ ┌───────────────┐ │    │ ┌─────────────────┐ │
                    │ │ Context Gate  │ │    │ │  Action Gate    │ │
                    │ │ Model Gate    │ │    │ │  (tool policy)  │ │
                    │ │ Action Gate   │ │    │ │                 │ │
                    │ │ CoT Intercept │ │    │ │  Response       │ │
                    │ │ (NEW)         │ │    │ │  Sanitizer      │ │
                    │ └───────────────┘ │    │ │  (NEW)          │ │
                    │                   │    │ └─────────────────┘ │
                    └────────┬─────────┘    └──────────┬──────────┘
                             │                         │
                    ┌────────▼─────────────────────────▼──────────┐
                    │              SoulWatch                       │
                    │  (audit engine — extended with new events)   │
                    │                                              │
                    │  Event types:                                │
                    │  - llm_request (existing)                    │
                    │  - tool_invocation (NEW)                     │
                    │  - cot_capture (NEW)                         │
                    │  - sanitizer_verdict (NEW)                   │
                    └─────────────────────────────────────────────┘
```

### 2.1 Key Design Principles

1. **Zero agent modification.** `tiresias-exec` is a drop-in prefix. Agent calls `tiresias-exec gws gmail list` instead of `gws gmail list`. No SDK, no library, no code change inside the agent.
2. **Fail-open by default.** If `tiresias-exec` cannot reach SoulWatch, the command executes anyway and the invocation is logged locally for later sync. Security monitoring should never block productivity.
3. **Hash-first, content-second.** CoT hashes are always stored. Full CoT content storage is opt-in per tenant policy. This allows "prove reasoning existed" without mandating "store all reasoning."
4. **Same encryption envelope.** All Aletheia data uses the existing AES-256-GCM envelope encryption (per-tenant DEK + KEK) from TQ-3.
5. **Existing tier gating.** All Aletheia features use FeatureGateMiddleware from Phase 10. No new gating mechanism.

---

## 3. Component Specifications

### 3.1 tiresias-exec (CLI Shim)

#### 3.1.1 Overview

A lightweight executable that wraps any CLI command, captures telemetry, optionally applies policy and sanitization, and reports to SoulWatch.

**Language:** Go (single static binary, no runtime deps, cross-compile for Linux/macOS/Windows)
**Install:** Single binary download. Ships with Tiresias enterprise/MSSP distribution.
**Size target:** < 10MB binary.

#### 3.1.2 Invocation

```bash
# Basic usage — transparent wrapper
tiresias-exec gws gmail users.messages list --format json

# With explicit agent identity (overrides env)
tiresias-exec --agent-id alfred-main --tenant-id ac6b4247 -- gws gmail users.messages list

# Sanitizer mode (default: passthrough)
tiresias-exec --sanitize=warn gws drive files.get <file-id>
tiresias-exec --sanitize=block gws drive files.get <file-id>

# Policy check only (dry run)
tiresias-exec --dry-run gws admin users.delete foo@bar.com
```

#### 3.1.3 Identity Resolution

Priority order for agent identity:

1. CLI flags: `--agent-id`, `--tenant-id`
2. Environment variables: `TIRESIAS_AGENT_ID`, `TIRESIAS_TENANT_ID`
3. Config file: `~/.tiresias/agent.yaml`
4. SoulAuth token: if `TIRESIAS_TOKEN` is set, extract agent_id and tenant_id from JWT claims

```yaml
# ~/.tiresias/agent.yaml
agent_id: alfred-main
tenant_id: ac6b4247-03ee-4c45-b9ea-06a4aaceeb75
soulwatch_url: https://tiresias.network/v1/soulwatch
token: <jwt or soulkey>
sanitize: warn  # default sanitizer mode: passthrough | warn | block
offline_log: /var/log/tiresias/offline.jsonl  # fallback when SoulWatch unreachable
```

#### 3.1.4 Execution Flow

```
1. Parse command and flags
2. Resolve agent identity
3. [If Action Gate enabled] POST /v1/aletheia/tool/evaluate
   - Send: agent_id, tenant_id, command, args
   - Receive: allow | deny | warn
   - If deny: log, return exit code 77 (EX_NOPERM), do NOT execute
   - If warn: log warning, continue execution
4. Execute subprocess: capture stdout, stderr, exit code, wall time
5. [If sanitize != passthrough] POST /v1/aletheia/sanitize
   - Send: tool output (stdout)
   - Receive: verdict (clean | warn | block), patterns_matched
   - If block: replace stdout with "[BLOCKED: prompt injection detected in tool response]"
   - If warn: pass stdout through, log warning
6. POST /v1/soulwatch/events (async, non-blocking)
   - Event type: tool_invocation
   - Payload: full telemetry (see 3.1.5)
7. Write stdout to caller's stdout (pass-through)
8. Exit with subprocess exit code
```

**Performance budget:** Steps 1-2 < 1ms. Steps 3 and 5 are optional network calls. Step 4 is wall time of the wrapped command. Step 6 is async fire-and-forget. **Total overhead when offline or passthrough mode: < 5ms.**

#### 3.1.5 Telemetry Payload

```json
{
  "event_type": "tool_invocation",
  "version": "1.0",
  "timestamp": "2026-03-21T20:30:00.000Z",
  "agent_id": "alfred-main",
  "tenant_id": "ac6b4247-03ee-4c45-b9ea-06a4aaceeb75",
  "invocation_id": "inv_a1b2c3d4e5f6",
  "command": "gws",
  "args": ["gmail", "users.messages", "list", "--format", "json"],
  "full_command": "gws gmail users.messages list --format json",
  "working_directory": "/home/agent/workspace",
  "environment_hash": "sha256:abc123...",
  "execution": {
    "exit_code": 0,
    "duration_ms": 342,
    "stdout_bytes": 4821,
    "stderr_bytes": 0,
    "stdout_hash": "sha512:def456...",
    "stderr_hash": "sha512:000000..."
  },
  "policy": {
    "evaluated": true,
    "verdict": "allow",
    "rules_matched": []
  },
  "sanitizer": {
    "mode": "warn",
    "verdict": "clean",
    "patterns_matched": [],
    "scan_duration_ms": 12
  }
}
```

**Note:** `stdout_hash` and `stderr_hash` are always captured. Full stdout/stderr content is **NOT** sent to SoulWatch by default — only hashes. Full content capture is opt-in per tenant policy (`aletheia.capture_tool_output: true`). This prevents accidental PII/secret leakage into the audit log.

#### 3.1.6 Offline Mode

When SoulWatch is unreachable:

1. Action Gate evaluation skipped (fail-open). Command executes.
2. Sanitizer skipped (fail-open). Output passed through.
3. Telemetry written to local JSONL file (`offline_log` path).
4. Background goroutine retries sync every 60s with exponential backoff.
5. Local log rotated at 100MB. Oldest entries dropped if disk pressure.

#### 3.1.7 Agent Integration Patterns

**Claude Code (hooks):**
```json
// .claude/settings.json — hook wraps all bash commands
{
  "hooks": {
    "bash": {
      "command": "tiresias-exec"
    }
  }
}
```

**Generic agent (environment):**
```bash
# Alias pattern — zero agent code changes
alias gws="tiresias-exec gws"
alias gh="tiresias-exec gh"
alias kubectl="tiresias-exec kubectl"
```

**Subprocess wrapper (Python):**
```python
import subprocess
TIRESIAS_PREFIX = ["tiresias-exec", "--sanitize=warn"]

def run_tool(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(TIRESIAS_PREFIX + cmd, capture_output=True, text=True)
```

---

### 3.2 CoT Intercept & Hash Chain

#### 3.2.1 Overview

Chain of Thought intercept operates at the **SoulGate proxy layer** (existing infrastructure). When an LLM response contains reasoning traces, SoulGate extracts them, hashes them, and stores the hash in a tamper-evident chain.

This is fundamentally different from tool-side observability: CoT intercept requires **no agent-side changes** because SoulGate already proxies all LLM traffic.

#### 3.2.2 Provider-Specific Extraction

**Anthropic (Claude):**
```json
// Response contains content blocks with type "thinking"
{
  "content": [
    {"type": "thinking", "thinking": "Let me analyze this..."},
    {"type": "text", "text": "The answer is 42."}
  ]
}
```
- Extract: `content[type=thinking].thinking`
- Condition: `thinking.enabled` must be set in request (SoulGate can inject this)
- Token count: from `usage.cache_creation_input_tokens` or estimated

**OpenAI (o-series, GPT-4.1):**
```json
// Response includes reasoning tokens in usage
{
  "usage": {
    "completion_tokens": 150,
    "completion_tokens_details": {
      "reasoning_tokens": 80
    }
  }
}
```
- Extract: reasoning token count (content not exposed by OpenAI API as of 2026-03)
- If `reasoning.content` is available in future API versions, extract it
- Store: token count + model + request_id (hash of "reasoning occurred" even without content)

**Gemini:**
```json
// Thinking budget in response metadata
{
  "candidates": [{
    "content": {
      "parts": [
        {"thought": true, "text": "Analyzing the query..."},
        {"text": "Here's the answer."}
      ]
    }
  }]
}
```
- Extract: `parts[thought=true].text`
- Condition: `thinkingConfig.thinkingBudget` set in request

**Local models (Ollama, vLLM):**
- No native CoT. If agent scaffolding produces `<thinking>` blocks, extract via regex.
- Best-effort only — documented as partial coverage.

#### 3.2.3 CoT Policy Enforcement

Enterprise tenants can mandate reasoning via a **CoT policy** — a proxy-layer rule that requires all LLM requests to have thinking/reasoning enabled. This is a compliance requirement, not an optimization.

**Policy schema:**
```yaml
# tiresias-rules/cot-policies/require-reasoning.yaml
apiVersion: tiresias/v1
kind: CotPolicy
metadata:
  name: require-reasoning
  tier: enterprise
spec:
  # Require thinking enabled on all requests
  require_thinking: true

  # What to do when agent doesn't enable thinking
  enforcement: inject  # inject | reject | warn

  # Provider-specific injection
  providers:
    anthropic:
      inject_field: "thinking.enabled"
      inject_value: true
      budget_tokens: 10000  # max thinking budget to inject
    openai:
      inject_field: "reasoning_effort"
      inject_value: "medium"
    gemini:
      inject_field: "generationConfig.thinkingConfig.thinkingBudget"
      inject_value: 10000

  # Exemptions (some requests don't need reasoning)
  exempt:
    - model_pattern: "haiku*"  # lightweight models exempt
    - endpoint_pattern: "/v1/embeddings"  # embeddings don't reason
    - agent_pattern: "linter-*"  # lint agents exempt
```

**Enforcement modes:**

| Mode | Behavior |
|------|----------|
| `inject` | SoulGate auto-enables thinking on requests that lack it. Tenant accepts additional token cost. CoT captured on every request. |
| `reject` | SoulGate returns 403 with `X-Tiresias-Reason: cot-policy-violation`. Agent must retry with thinking enabled. |
| `warn` | SoulGate passes request through but logs a policy violation in SoulWatch. CoT chain has a gap entry (hash of "reasoning_not_enabled"). |

**Use case:** Enterprise compliance: "If you use Claude, you must have thinking enabled." The CISO sets this policy once. Every agent in the org complies or gets rejected. No agent code changes needed — SoulGate enforces at the proxy layer.

**Cost attribution:** When SoulGate injects thinking, the additional token cost is tagged in the audit trail with `cot_policy_injected: true` so the cost attribution engine (SALUCA-032) can separate policy-mandated reasoning cost from agent-requested reasoning cost.

#### 3.2.3 Hash Chain Structure

Each CoT capture produces a **chain entry**:

```
┌──────────────────────────────────────────────────────────────┐
│ CoT Chain Entry                                              │
├──────────────────────────────────────────────────────────────┤
│ chain_id:        UUID (per-tenant chain)                     │
│ entry_index:     monotonic integer                           │
│ request_id:      UUID (links to SoulWatch llm_request)       │
│ timestamp:       ISO-8601                                    │
│ model:           string (e.g., "claude-opus-4-6")      │
│ provider:        string (e.g., "anthropic")                  │
│ agent_id:        string                                      │
│ tenant_id:       UUID                                        │
│ cot_hash:        SHA-512 of raw reasoning trace content      │
│ cot_token_count: integer                                     │
│ cot_byte_count:  integer                                     │
│ prev_hash:       SHA-512 of previous chain entry             │
│ entry_hash:      SHA-512(entry_index || request_id ||        │
│                  timestamp || cot_hash || prev_hash)         │
│ content_stored:  boolean (whether encrypted content exists)  │
│ content_ref:     storage reference (if content_stored=true)  │
└──────────────────────────────────────────────────────────────┘
```

**Chain integrity:** Each `entry_hash` includes the `prev_hash`, forming a hash-linked chain identical in structure to a blockchain ledger. To verify integrity:

```python
def verify_chain(entries: list[CotChainEntry]) -> bool:
    for i, entry in enumerate(entries):
        if i == 0:
            assert entry.prev_hash == GENESIS_HASH  # tenant-specific genesis
        else:
            assert entry.prev_hash == entries[i-1].entry_hash

        computed = sha512(
            f"{entry.entry_index}||{entry.request_id}||"
            f"{entry.timestamp}||{entry.cot_hash}||{entry.prev_hash}"
        )
        assert computed == entry.entry_hash
    return True
```

**Genesis entry:** When a tenant enables Aletheia, a genesis entry is created with `prev_hash = SHA-512(tenant_id)`. This anchors the chain to the tenant identity.

#### 3.2.4 Storage Model

**Hash chain (always stored):**
- Table: `aletheia_cot_chain`
- Indexed by: `tenant_id`, `entry_index`, `request_id`, `timestamp`
- Retention: configurable per tenant (default: 365 days for enterprise, unlimited for MSSP)
- Size: ~500 bytes per entry. At 10K LLM calls/day = ~5MB/day = ~1.8GB/year per tenant.

**Full content (opt-in):**
- Table: `aletheia_cot_content`
- Encrypted: AES-256-GCM with tenant DEK (same envelope as TQ-3)
- Indexed by: `chain_entry_id` (FK to chain table)
- Retention: same as chain, but tenant can set shorter retention for content vs. hashes
- Content retrievable only via `/v1/aletheia/cot/{request_id}/content` with `audit:read` scope

**Separation rationale:** A tenant can prove "reasoning occurred and had hash X at time T" by querying the chain, without ever storing or exposing the actual reasoning content. For highly regulated environments, this is the difference between "we have tamper-evident audit" and "we have a compliance liability."

#### 3.2.5 SoulGate Integration

CoT intercept happens in the **response path** of SoulGate's proxy pipeline:

```
Agent request → SoulAuth → Context Gate → Model Gate → Action Gate
    → Forward to LLM provider
    → Receive response
    → [NEW] CoT Intercept: extract reasoning, hash, chain, optionally store
    → SoulWatch audit (existing, now includes cot_capture event)
    → Return response to agent (reasoning traces pass through unmodified)
```

**Critical:** CoT intercept is **read-only on the response**. It never modifies, strips, or delays the reasoning trace. The agent receives the full response exactly as the provider sent it.

#### 3.2.6 Prove-Without-Exposing Protocol

For compliance audits where the auditor needs to verify reasoning occurred but the tenant doesn't want to expose proprietary prompts:

```
1. Auditor requests: "Show me reasoning audit for request R at time T"
2. System returns: entry_hash, cot_hash, cot_token_count, model, timestamp, chain verification status
3. Auditor can verify:
   - Reasoning occurred (cot_hash is non-null)
   - Reasoning was N tokens long (cot_token_count)
   - Chain is intact (entry_hash links correctly to prev/next)
   - No tampering (recompute entry_hash from components)
4. Auditor does NOT receive:
   - Actual reasoning content
   - The prompt that generated it
   - Any other tenant data
```

This is the **hashed audit proof** — cryptographic evidence of reasoning without content disclosure.

---

### 3.3 Response Sanitizer

#### 3.3.1 Overview

Scans tool output (from `tiresias-exec`) for prompt injection and other adversarial content before it reaches the agent. Extends the existing PRH (Prompt Risk Heuristics) engine to operate on tool responses, not just LLM prompts.

#### 3.3.2 Threat Patterns

Adapts PRH's 60 existing patterns plus new tool-specific patterns:

| Category | Examples | Source |
|----------|----------|--------|
| **Direct injection** | "Ignore previous instructions", "You are now...", "System: override" hidden in Google Doc text, email body, spreadsheet cell | PRH categories 1-3 |
| **Indirect injection** | Invisible Unicode characters encoding instructions, zero-width joiners, base64-encoded payloads in tool output | New for Aletheia |
| **Credential exposure** | API keys, tokens, passwords in tool response that shouldn't reach the LLM context | New — regex patterns for common secret formats |
| **Data exfiltration markers** | Tool response contains instructions to "send this to", "POST to", "email the contents" | PRH category 4 adapted |
| **Encoding evasion** | ROT13, hex encoding, HTML entities used to bypass pattern matching | New for Aletheia |

#### 3.3.3 Sanitizer Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| `passthrough` | No scanning. Tool output passed directly. Event still logged. | Development, low-sensitivity tools |
| `warn` | Scan output. If patterns match, log warning + flag in SoulWatch. Pass output to agent unchanged. | Default for enterprise. Alert without blocking. |
| `block` | Scan output. If patterns match, replace stdout with sanitized message. Original output stored encrypted in SoulWatch for forensics. | High-security environments, MSSP managed tenants |

#### 3.3.4 Sanitizer API

```
POST /v1/aletheia/sanitize
Authorization: Bearer <soulkey>

{
  "tool": "gws",
  "command": "drive files.export",
  "output": "<raw tool stdout>",
  "agent_id": "alfred-main",
  "tenant_id": "ac6b4247",
  "mode": "warn"
}

Response:
{
  "verdict": "warn",
  "patterns_matched": [
    {
      "pattern_id": "PI-DIRECT-017",
      "category": "direct_injection",
      "severity": "high",
      "match_location": {"start": 4821, "end": 4893},
      "snippet_hash": "sha512:..."
    }
  ],
  "scan_duration_ms": 8,
  "sanitized_output": null  // only set when mode=block
}
```

#### 3.3.5 Performance

Sanitizer must operate within the `tiresias-exec` hot path. Budget: < 50ms for outputs up to 1MB.

- Pattern matching: compiled regex set (Aho-Corasick for literal patterns, DFA for regex)
- Lazy loading: pattern set cached in `tiresias-exec` process, refreshed every 5 minutes
- Large outputs (> 1MB): scan first 1MB, hash remainder, flag as `partial_scan`

---

### 3.4 Action Gate (Tool Policy)

#### 3.4.1 Overview

Extends the existing Action Gate in SoulGate to evaluate tool invocation policies. Currently, Action Gate evaluates LLM-layer actions (tool calls, autonomy level, rate limits). Aletheia adds a parallel evaluation path for CLI tool invocations.

#### 3.4.2 Policy Schema

```yaml
# tiresias-rules/tool-policies/default.yaml
apiVersion: tiresias/v1
kind: ToolPolicy
metadata:
  name: default-enterprise
  tier: enterprise
spec:
  # Default policy: allow all, log all
  default_action: allow

  rules:
    # Block destructive operations by default
    - name: block-destructive
      match:
        commands:
          - "rm"
          - "gws admin users.delete"
          - "kubectl delete"
          - "git push --force"
      action: deny
      reason: "Destructive operation requires explicit approval"

    # Warn on data access
    - name: warn-data-access
      match:
        commands:
          - "gws drive files.export"
          - "gws gmail users.messages.get"
        args_pattern: ".*--format=(raw|full).*"
      action: warn
      reason: "Full content export — verify data classification"

    # Rate limit API calls
    - name: rate-limit-api
      match:
        commands:
          - "gws *"
          - "gh api *"
      rate_limit:
        max_per_minute: 60
        max_per_hour: 500
      action: allow

  # Per-agent overrides
  agent_overrides:
    alfred-main:
      # Alfred gets elevated access
      override_rules:
        - name: block-destructive
          action: warn  # downgrade from deny to warn for Alfred

    untrusted-agent:
      # Sandbox: only allow read operations
      default_action: deny
      allowed_commands:
        - "gws gmail users.messages.list"
        - "gws drive files.list"
        - "gws calendar events.list"
```

#### 3.4.3 Evaluation API

```
POST /v1/aletheia/tool/evaluate
Authorization: Bearer <soulkey>

{
  "agent_id": "alfred-main",
  "tenant_id": "ac6b4247",
  "command": "gws",
  "args": ["admin", "users.delete", "foo@bar.com"],
  "context": {
    "working_directory": "/home/agent",
    "session_id": "sess_abc123"
  }
}

Response:
{
  "verdict": "deny",
  "rule_matched": "block-destructive",
  "reason": "Destructive operation requires explicit approval",
  "override_available": false,
  "logged": true
}
```

#### 3.4.4 Policy Lifecycle

- Policies stored in `salucallc/tiresias-rules` (existing policy repo from enforcement spec)
- Hot-reload: SoulGate watches YAML files, validates schema, swaps atomically (existing mechanism from Q5)
- Audit: every policy evaluation logged in SoulWatch as `tool_policy_evaluation` event
- Versioned: policy changes tracked in git, audit log references policy version hash

---

### 3.5 SoulWatch Extensions

#### 3.5.1 New Event Types

| Event Type | Source | Fields |
|------------|--------|--------|
| `tool_invocation` | tiresias-exec | invocation_id, agent_id, tenant_id, command, args, exit_code, duration_ms, stdout_hash, stderr_hash, stdout_bytes, policy_verdict, sanitizer_verdict |
| `cot_capture` | SoulGate CoT intercept | request_id, agent_id, tenant_id, model, provider, cot_hash, cot_token_count, cot_byte_count, chain_entry_index, content_stored |
| `sanitizer_verdict` | tiresias-exec / sanitizer API | invocation_id, tool, mode, verdict, patterns_matched (array), scan_duration_ms, response_hash |
| `tool_policy_evaluation` | Action Gate | invocation_id, agent_id, command, verdict, rule_matched, policy_version_hash |

#### 3.5.2 Database Schema Extensions

```sql
-- CoT hash chain (always populated for enterprise/mssp)
CREATE TABLE aletheia_cot_chain (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES soul_tenants(id),
    chain_id UUID NOT NULL,  -- per-tenant chain identifier
    entry_index BIGINT NOT NULL,
    request_id UUID NOT NULL,  -- FK to existing llm_request audit
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    model VARCHAR(100) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    agent_id VARCHAR(200),
    cot_hash VARCHAR(128) NOT NULL,  -- SHA-512 hex
    cot_token_count INTEGER NOT NULL DEFAULT 0,
    cot_byte_count INTEGER NOT NULL DEFAULT 0,
    prev_hash VARCHAR(128) NOT NULL,
    entry_hash VARCHAR(128) NOT NULL,
    content_stored BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(tenant_id, chain_id, entry_index)
);

CREATE INDEX idx_cot_chain_tenant_time ON aletheia_cot_chain(tenant_id, timestamp DESC);
CREATE INDEX idx_cot_chain_request ON aletheia_cot_chain(request_id);

-- CoT content (opt-in, encrypted)
CREATE TABLE aletheia_cot_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chain_entry_id UUID NOT NULL REFERENCES aletheia_cot_chain(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    encrypted_content BYTEA NOT NULL,  -- AES-256-GCM with tenant DEK
    content_nonce BYTEA NOT NULL,      -- 12-byte GCM nonce
    content_tag BYTEA NOT NULL,        -- 16-byte GCM auth tag
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tool invocations
CREATE TABLE aletheia_tool_invocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES soul_tenants(id),
    invocation_id VARCHAR(100) NOT NULL UNIQUE,
    agent_id VARCHAR(200),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    command VARCHAR(500) NOT NULL,
    args JSONB NOT NULL DEFAULT '[]',
    full_command TEXT NOT NULL,
    working_directory VARCHAR(1000),
    exit_code INTEGER,
    duration_ms INTEGER,
    stdout_bytes BIGINT DEFAULT 0,
    stderr_bytes BIGINT DEFAULT 0,
    stdout_hash VARCHAR(128),  -- SHA-512
    stderr_hash VARCHAR(128),
    policy_verdict VARCHAR(20),  -- allow, deny, warn, skipped
    policy_rule_matched VARCHAR(200),
    sanitizer_mode VARCHAR(20),  -- passthrough, warn, block
    sanitizer_verdict VARCHAR(20),  -- clean, warn, block, skipped
    patterns_matched JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tool_inv_tenant_time ON aletheia_tool_invocations(tenant_id, timestamp DESC);
CREATE INDEX idx_tool_inv_agent ON aletheia_tool_invocations(tenant_id, agent_id);
CREATE INDEX idx_tool_inv_command ON aletheia_tool_invocations(tenant_id, command);
```

#### 3.5.3 Retention Policies

| Data | Enterprise Default | MSSP Default | Configurable |
|------|-------------------|--------------|-------------|
| CoT chain (hashes) | 365 days | Unlimited | Yes |
| CoT content (encrypted) | 90 days | 365 days | Yes |
| Tool invocations | 180 days | 365 days | Yes |
| Sanitizer verdicts | 180 days | 365 days | Yes |

---

### 3.6 API Endpoints

All endpoints gated to enterprise/mssp tier via FeatureGateMiddleware.

#### 3.6.1 CoT Endpoints

```
GET  /v1/aletheia/cot/chain
     ?tenant_id=...&from=...&to=...&agent_id=...&model=...
     → List chain entries (hashes only, paginated)

GET  /v1/aletheia/cot/chain/{request_id}
     → Single chain entry by request ID

GET  /v1/aletheia/cot/chain/{request_id}/content
     Scope: audit:read
     → Decrypted reasoning content (if stored)

GET  /v1/aletheia/cot/chain/verify
     ?tenant_id=...&from_index=...&to_index=...
     → Verify chain integrity over range, return pass/fail + first broken link

POST /v1/aletheia/cot/proof
     → Generate hashed audit proof document (PDF/JSON) for compliance export
     Body: { request_ids: [...], include_content: false }
```

#### 3.6.2 Tool Observability Endpoints

```
GET  /v1/aletheia/tools/invocations
     ?tenant_id=...&agent_id=...&command=...&from=...&to=...&verdict=...
     → List tool invocations (paginated)

GET  /v1/aletheia/tools/invocations/{invocation_id}
     → Single invocation detail

GET  /v1/aletheia/tools/stats
     ?tenant_id=...&from=...&to=...
     → Aggregate stats: top commands, top agents, deny rate, sanitizer block rate

POST /v1/aletheia/tool/evaluate
     → Policy evaluation (called by tiresias-exec)

POST /v1/aletheia/sanitize
     → Response sanitization (called by tiresias-exec)
```

#### 3.6.3 Policy Management Endpoints

```
GET  /v1/aletheia/policies
     → List active tool policies

GET  /v1/aletheia/policies/{name}
     → Get policy detail

PUT  /v1/aletheia/policies/{name}
     → Update policy (validates schema, hot-reloads)

GET  /v1/aletheia/policies/audit
     → Policy change audit log
```

---

### 3.7 Dashboard (Portal Extensions)

#### 3.7.1 New Pages

| Page | Route | Content |
|------|-------|---------|
| Aletheia Overview | `/aletheia` | Combined view: CoT chain health, tool invocation timeline, sanitizer verdict summary, policy violation count |
| CoT Audit | `/aletheia/cot` | Chain entries table, integrity status indicator, proof export button, content viewer (gated to audit role) |
| Tool Activity | `/aletheia/tools` | Invocation timeline, command frequency chart, agent activity heatmap, deny/block log |
| Sanitizer | `/aletheia/sanitizer` | Verdict distribution, pattern match frequency, blocked response forensics viewer |
| Tool Policies | `/aletheia/policies` | Policy editor (YAML), evaluation simulator ("what would happen if agent X ran command Y?"), audit log |

#### 3.7.2 Dashboard Header Integration

Existing DashboardHeader gets an Aletheia status indicator:

- Green: chain intact, no blocks in last hour
- Yellow: sanitizer warnings in last hour
- Red: chain integrity failure OR policy denials in last hour

---

### 3.8 Tier Gating

#### 3.8.1 Feature Registry Additions

```python
# Added to FEATURE_MIN_TIER (existing registry from Phase 10)
FEATURE_MIN_TIER = {
    # ... existing features ...

    # Aletheia features (enterprise minimum)
    "aletheia_cot_intercept": "enterprise",
    "aletheia_cot_content_storage": "enterprise",
    "aletheia_cot_proof_export": "enterprise",
    "aletheia_tool_monitoring": "enterprise",
    "aletheia_response_sanitizer": "enterprise",
    "aletheia_tool_policies": "enterprise",
    "aletheia_dashboard": "enterprise",

    # MSSP-specific Aletheia features
    "aletheia_cross_tenant_cot_audit": "mssp",
    "aletheia_managed_tool_policies": "mssp",  # push policies to child tenants
}
```

#### 3.8.2 Behavior by Tier

| Tier | Aletheia Behavior |
|------|-------------------|
| Community | No Aletheia. API returns 402. |
| Starter | No Aletheia. API returns 402. |
| Pro | No Aletheia. API returns 402. Upgrade CTA in portal. |
| Enterprise | Full Aletheia: CoT intercept + hash chain + tool monitoring + sanitizer + policies + dashboard |
| MSSP | Enterprise features + cross-tenant CoT audit + managed policy push to child tenants |
| SaaS | Enterprise features (Saluca-operated, tenant-level config) |

---

## 4. Security Considerations

### 4.1 tiresias-exec Attack Surface

| Risk | Mitigation |
|------|-----------|
| tiresias-exec binary tampered | Ship with code-signed binary. Verify signature on startup. |
| Agent bypasses tiresias-exec (calls tool directly) | Defense in depth — not a guarantee. For hardened environments, use OS-level command allow-listing (AppArmor/SELinux) to enforce tiresias-exec as the only path. |
| tiresias-exec leaks credentials from command args | Redact known secret patterns (--token, --password, --key) in telemetry. Store redacted version, hash original. |
| Offline log contains sensitive tool output | Offline log stores hashes only (same as online mode). Full output never hits disk unless tenant opts in. |

### 4.2 CoT Security

| Risk | Mitigation |
|------|-----------|
| CoT content contains PII/secrets | Encrypted at rest with tenant DEK. Access gated to audit:read scope. Content retrieval logged in SoulWatch. |
| Chain integrity compromised by DB admin | Chain verification is cryptographic — any modification breaks the hash chain. External auditor can independently verify. |
| Genesis hash collision | Genesis = SHA-512(tenant_id). Collision probability negligible (2^-256). |

### 4.3 Sanitizer Bypass

| Risk | Mitigation |
|------|-----------|
| Novel injection pattern not in pattern set | Pattern set updated via policy repo. PRH engine learns from SoulWatch data (existing feedback loop from v2.0). |
| Encoding evasion (base64, Unicode tricks) | Sanitizer decodes common encodings before scanning. Multi-pass: raw → decoded → normalized. |
| Large output exceeds scan budget | Partial scan flagged. Tenant alerted. Option to block unscannable outputs. |

---

## 5. Requirements Traceability

| Req ID | Description | Phase | Component |
|--------|-------------|-------|-----------|
| ALETH-01 | tiresias-exec CLI shim captures tool invocations (command, args, timing, exit code, stdout/stderr hash, agent ID) | 14 | tiresias-exec |
| ALETH-02 | SoulWatch ingests `tool_invocation` events with full telemetry | 14 | SoulWatch |
| ALETH-03 | tiresias-exec offline mode: local JSONL fallback when SoulWatch unreachable, background sync | 14 | tiresias-exec |
| ALETH-04 | Action Gate evaluates tool policies (allow/deny/warn) before command execution | 15 | Action Gate |
| ALETH-05 | Tool policy schema: per-agent overrides, command matching, args pattern, rate limits | 15 | Policy engine |
| ALETH-06 | Response sanitizer scans CLI output for prompt injection (passthrough/warn/block modes) | 15 | Sanitizer |
| ALETH-07 | Sanitizer pattern set extends PRH engine with tool-specific patterns (indirect injection, credential exposure, encoding evasion) | 15 | Sanitizer |
| ALETH-08 | CoT intercept extracts reasoning traces from Anthropic thinking blocks, OpenAI reasoning tokens, Gemini thinking parts | 16 | SoulGate |
| ALETH-09 | CoT hash chain: SHA-512 linked entries, tamper-evident, per-tenant chain with genesis anchor | 16 | SoulGate + DB |
| ALETH-10 | CoT content stored encrypted (AES-256-GCM, tenant DEK) with opt-in per tenant | 16 | Storage |
| ALETH-11 | Prove-without-exposing: API returns hash proof without content for compliance audits | 16 | API |
| ALETH-12 | Chain verification API: validate integrity over entry range, return first broken link | 16 | API |
| ALETH-13 | All Aletheia features gated to enterprise/mssp via FeatureGateMiddleware | 17 | Tier system |
| ALETH-14 | Aletheia dashboard pages: overview, CoT audit, tool activity, sanitizer, policy editor | 17 | Portal |
| ALETH-15 | MSSP cross-tenant CoT audit and managed policy push | 17 | MSSP layer |
| ALETH-16 | Proof export: generate hashed audit proof document (JSON) for compliance | 16 | API |
| ALETH-17 | CoT policy enforcement: enterprise can mandate thinking enabled (inject/reject/warn modes), proxy-enforced, cost-tagged | 16 | SoulGate |

---

## 6. Phase Plan

| Phase | Name | Requirements | Depends On | Parallel With |
|-------|------|-------------|------------|---------------|
| 14 | Aletheia Core: Tool Monitoring | ALETH-01, ALETH-02, ALETH-03 | Phase 10 | Phase 16 |
| 15 | Tool Policy & Sanitization | ALETH-04, ALETH-05, ALETH-06, ALETH-07 | Phase 14 | — |
| 16 | CoT Intercept & Hash Chain | ALETH-08, ALETH-09, ALETH-10, ALETH-11, ALETH-12, ALETH-16, ALETH-17 | Phase 10 | Phase 14 |
| 17 | Aletheia Dashboard & Tier Gating | ALETH-13, ALETH-14, ALETH-15 | Phase 15, Phase 16 | — |

**Estimated scope:** ~4,000–6,000 lines across Go (tiresias-exec) + Python (SoulGate/SoulWatch/API) + TypeScript (Portal). 4 phases, ~8-12 plans.

---

## 7. Open Questions

1. **tiresias-exec distribution:** Ship as part of Tiresias enterprise container, or separate package (homebrew/apt/binary download)?
2. **Claude Code hooks integration:** Should we propose a `tiresias-exec` hook to Anthropic for native Claude Code integration, or keep it as user-configured?
3. **SoulGate CoT injection:** LOCKED — No auto-injection. Thinking tokens consume output token budget and context window (1K–10K+ tokens per response), silently increasing tenant API cost. SoulGate captures CoT opportunistically when the agent already enables thinking (which most serious agent frameworks do by default). For tenants that want guaranteed capture and accept the cost tradeoff, opt-in policy: `aletheia.cot_inject_thinking: true`.
4. **Patent filing:** CoT hash chain as tamper-evident reasoning audit + tool-side response sanitization — evaluate with counsel for independent provisional.
5. **tiresias-exec for MCP too?** Should tiresias-exec also wrap MCP server invocations (capture MCP tool calls alongside CLI calls)? This would make Aletheia tool-agnostic regardless of whether the industry goes CLI or stays MCP.
