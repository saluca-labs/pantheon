# Tiresias User & Developer Guide

*AI Agent Security Platform: SoulAuth | SoulWatch | SoulGate*

**Version:** 1.0
**Last updated:** 2026-03-22

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [SoulAuth: Agent Identity & Authorization](#2-soulauth-agent-identity--authorization)
3. [SoulWatch: Runtime Monitoring](#3-soulwatch-runtime-monitoring)
4. [SoulGate: API Gateway](#4-soulgate-api-gateway)
5. [API Reference Quick Start](#5-api-reference-quick-start)
6. [SDK & CLI](#6-sdk--cli)
7. [Dashboard](#7-dashboard)
8. [Best Practices](#8-best-practices)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Getting Started

### What is Tiresias?

Tiresias is a security platform purpose-built for AI agent systems. If you're deploying autonomous agents - whether they read documents, execute code, call APIs, or talk to other agents - Tiresias gives you the identity, authorization, monitoring, and gateway controls you need to keep those agents safe, accountable, and under control.

The platform is composed of three products:

| Product | What it does |
|---|---|
| **SoulAuth** | Identity and authorization for AI agents. Every agent gets a cryptographic identity (SoulKey), and every action is evaluated against fine-grained policies. |
| **SoulWatch** | Runtime behavioral monitoring. Detects anomalies, enforces Sigma-compatible detection rules, and can automatically quarantine agents that go off-script. |
| **SoulGate** | A security gateway that sits in front of your agent-facing APIs. Handles rate limiting, circuit breaking, prompt injection detection, and full audit logging. |

You can use all three together or adopt them independently. They share a common identity layer (SoulKeys) and audit infrastructure, so the more you use, the richer your security posture becomes.

### Account Setup

1. **Join the beta waitlist** at [tiresias.network](https://tiresias.network). We review applications on a rolling basis.
2. **Receive your invite** via email. The invite includes your tenant ID and a link to set up your account.
3. **Sign in via SSO** (Google) to access the Tiresias dashboard.
4. **Create your first SoulKey** from the dashboard's Keys panel (or via the CLI).

### First Steps

Once you have access, here's the quickest path to a working integration:

**Step 1: Get your SoulKey**

From the dashboard, navigate to **Keys > Issue New Key**. Choose a persona name for your agent (e.g., `alfred`, `researcher`, `code-reviewer`). The system generates a SoulKey in the format:

```
sk_agent_<tenant>_<persona>_<hex32>
```

Copy it immediately - you won't be able to see the full key again.

**Step 2: Make your first auth request**

```bash
curl -H "X-Soulkey: sk_agent_acme_alfred_a1b2c3d4..." \
  https://tiresias.network/v1/auth/identity
```

If everything is set up correctly, you'll get back a JSON response with your agent's identity, tenant, and active policies.

**Step 3: Understand capability tokens**

When your agent needs to access a protected resource, it first *evaluates* access (Step 2 above returns a short-lived capability token), then presents that token on subsequent requests. Tokens are JWT-based, ES256-signed, and expire in 300--900 seconds. This means your agent re-proves its authorization frequently, which limits the blast radius if a token is compromised.

---

## 2. SoulAuth: Agent Identity & Authorization

SoulAuth is the identity and authorization backbone. Every agent in your system gets a SoulKey, and every action that agent takes is evaluated against a policy engine before it's allowed to proceed.

### Authentication Flow

The core flow has four steps:

```
Agent                           Tiresias
  |                                |
  |-- 1. Resolve identity -------->|  GET /v1/auth/identity
  |<-------- identity confirmed ---|
  |                                |
  |-- 2. Request access ---------->|  POST /v1/auth/evaluate
  |<--- capability token (JWT) ----|
  |                                |
  |-- 3. Use capability token ---->|  X-Capability-Token header
  |<-------- resource response ----|
  |                                |
  |-- 4. Token expires ----------->|  re-evaluate when needed
  |                                |
```

#### Step 1: Resolve Identity

Before your agent does anything, it identifies itself:

```bash
curl -H "X-Soulkey: sk_agent_acme_alfred_a1b2c3d4..." \
  https://tiresias.network/v1/auth/identity
```

**Response:**

```json
{
  "agent_id": "agt_7f3a...",
  "tenant": "acme",
  "persona": "alfred",
  "status": "active",
  "policies": ["default", "memory-access", "code-execution"],
  "created_at": "2026-01-15T08:30:00Z"
}
```

This step confirms the SoulKey is valid and returns the agent's identity context.

#### Step 2: Request Access

When your agent needs to perform a specific action, it requests access:

```bash
curl -X POST https://tiresias.network/v1/auth/evaluate \
  -H "X-Soulkey: sk_agent_acme_alfred_a1b2c3d4..." \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "memory",
    "action": "read",
    "scope": "cs:algorithms"
  }'
```

**Response (granted):**

```json
{
  "decision": "GRANT",
  "capability_token": "eyJhbGciOiJFUzI1NiIs...",
  "expires_in": 300,
  "scopes_granted": ["memory:read:cs:algorithms"],
  "session_id": "ses_9c4e..."
}
```

**Response (denied):**

```json
{
  "decision": "DENY",
  "reason": "scope_not_permitted",
  "policy": "memory-access",
  "required_scope": "cs:algorithms",
  "available_scopes": ["cs:basics", "cs:data-structures"]
}
```

#### Step 3: Use Capability Token

Include the token on requests to protected resources:

```bash
curl -H "X-Capability-Token: eyJhbGciOiJFUzI1NiIs..." \
  https://tiresias.network/v1/memory/cs/algorithms
```

The resource server validates the token's signature, expiry, revocation status, and scope before serving the request.

#### Step 4: Token Expiry

Capability tokens are intentionally short-lived (300--900 seconds). When a token expires, your agent simply re-evaluates:

```python
import time

token = soulauth.evaluate(resource="memory", action="read", scope="cs:algorithms")

# Use the token...
# Later, check if it's still valid
if token.expires_at < time.time():
    token = soulauth.evaluate(resource="memory", action="read", scope="cs:algorithms")
```

This is by design. Short-lived tokens limit the damage window if a token is leaked.

### SoulKey Basics

#### Format

Every SoulKey follows this format:

```
sk_agent_<tenant>_<persona>_<hex32>
```

- `sk_agent_`: fixed prefix identifying this as a SoulAuth agent key
- `<tenant>`: your organization's tenant identifier (e.g., `acme`)
- `<persona>`: the agent's identity name (e.g., `alfred`, `researcher`)
- `<hex32>`: 32 hex characters of cryptographic randomness

Example: `sk_agent_acme_alfred_3f8a9b2c1d4e5f6a7b8c9d0e1f2a3b4c`

#### Storage Best Practices

- **Do** store SoulKeys in environment variables or a secrets manager (AWS Secrets Manager, HashiCorp Vault, GCP Secret Manager, etc.)
- **Do** inject keys at runtime, never at build time
- **Don't** hardcode keys in source code
- **Don't** commit keys to git repositories
- **Don't** log keys in plaintext

```python
import os

# Good
soulkey = os.environ["SOULAUTH_API_KEY"]

# Bad -- never do this
soulkey = "sk_agent_acme_alfred_3f8a9b2c..."
```

#### One Key Per Agent

Each SoulKey represents a single agent identity (persona). If you have three agents - a researcher, a code reviewer, and a deployer - issue three separate keys. This gives you:

- Per-agent audit trails
- Per-agent policy enforcement
- The ability to revoke one agent without affecting others

#### Self-Inspection

Any agent can inspect its own identity:

```bash
curl -H "X-Soulkey: sk_agent_acme_alfred_a1b2c3d4..." \
  https://tiresias.network/v1/auth/whoami
```

**Response:**

```json
{
  "agent_id": "agt_7f3a...",
  "tenant": "acme",
  "persona": "alfred",
  "status": "active",
  "key_issued_at": "2026-01-15T08:30:00Z",
  "policies": [
    {
      "name": "memory-access",
      "resources": ["memory"],
      "actions": ["read", "write"],
      "scopes": ["cs:*"]
    }
  ],
  "session": {
    "id": "ses_9c4e...",
    "started_at": "2026-03-22T14:00:00Z"
  }
}
```

This is useful for debugging ("why can't my agent access X?") and for agents that need to understand their own permissions before making decisions.

### Policy Model

Tiresias uses a hierarchical access control model built on three dimensions: **resources**, **actions**, and **scopes**.

#### Resources, Actions, and Scopes

| Dimension | What it represents | Examples |
|---|---|---|
| **Resource** | The thing being accessed | `memory`, `code`, `api`, `file`, `model` |
| **Action** | What operation is performed | `read`, `write`, `execute`, `delete`, `list` |
| **Scope** | The boundary or namespace | `cs:algorithms`, `prod:us-east`, `team:security` |

A policy grant looks like: `resource:action:scope`

```yaml
# Example policy definition
name: researcher-policy
rules:
  - resource: memory
    actions: [read, list]
    scopes: ["cs:*", "ml:*"]
  - resource: code
    actions: [read]
    scopes: ["repos:public:*"]
  - resource: api
    actions: [execute]
    scopes: ["search:web"]
```

#### Wildcard Support

Use wildcards to grant broad access where appropriate:

| Pattern | Meaning |
|---|---|
| `scope: "*"` | All scopes for this resource:action |
| `scope: "cs:*"` | All scopes under the `cs` namespace |
| `actions: ["*"]` | All actions on the resource (use carefully) |

#### Role-Based Policies

For common patterns, define role templates and assign them to agents:

```yaml
roles:
  reader:
    rules:
      - resource: "*"
        actions: [read, list]
        scopes: ["*"]

  operator:
    inherits: reader
    rules:
      - resource: code
        actions: [execute]
        scopes: ["ops:*"]
      - resource: api
        actions: [execute]
        scopes: ["internal:*"]
```

Agents inherit all rules from their assigned role, plus any agent-specific overrides.

#### JIT (Just-In-Time) Constraints

For sensitive operations, add time-based and session-based constraints:

```yaml
rules:
  - resource: database
    actions: [write, delete]
    scopes: ["prod:*"]
    constraints:
      time_window:
        start: "09:00"
        end: "17:00"
        timezone: "America/Los_Angeles"
      session_binding: required
      node_restriction: ["node-us-east-1", "node-us-east-2"]
      max_uses: 10
```

- **Time windows**: restrict when the action is permitted
- **Session binding**: the capability token is tied to a specific session
- **Node restrictions**: the request must originate from approved infrastructure
- **Max uses**: the token can only be used N times

### Capability Tokens (JWT)

Capability tokens are the currency of authorization in Tiresias. When an agent's access request is granted, SoulAuth issues a signed JWT that the agent presents on subsequent requests.

#### Token Structure

Tokens are ES256-signed JWTs with these claims:

| Claim | Description | Example |
|---|---|---|
| `iss` | Issuer | `tiresias.network` |
| `sub` | Subject (SoulKey ID) | `sk_7f3a...` |
| `tid` | Tenant ID | `acme` |
| `pid` | Persona ID | `alfred` |
| `scp` | Granted scopes (array) | `["memory:read:cs:algorithms"]` |
| `sid` | Session ID (optional) | `ses_9c4e...` |
| `jti` | Unique token ID | `tok_8b2f...` |
| `iat` | Issued at (Unix timestamp) | `1711108800` |
| `exp` | Expires at (Unix timestamp) | `1711109100` |

#### Token Validation

When a resource server receives a capability token, it performs validation in this order:

1. **Signature check**: verify the ES256 signature against Tiresias's public key
2. **Expiry check**: reject if `exp` < current time
3. **Revocation check**: verify the `jti` hasn't been revoked
4. **Scope match**: confirm the requested resource:action:scope is covered by the token's `scp` claim

If any check fails, the request is denied with an appropriate error.

#### Session Binding

If a token includes a `sid` (session ID), the resource server must also verify that the request includes an `X-Session-ID` header matching the token's `sid`. This prevents token theft across sessions.

```bash
# Token was issued with sid="ses_9c4e..."
curl -H "X-Capability-Token: eyJhbGciOi..." \
     -H "X-Session-ID: ses_9c4e..." \
     https://tiresias.network/v1/memory/cs/algorithms
```

### Delegation & Escalation

Sometimes one agent needs to temporarily grant another agent access to resources it wouldn't normally reach. Tiresias supports this through delegation.

#### Use Cases

- **Incident response**: a triage agent needs temporary access to production logs
- **Break-glass**: an operator agent needs emergency write access to a locked-down system
- **Collaboration**: two agents working together on a task need overlapping permissions

#### How It Works

```bash
# Agent requesting escalation
curl -X POST https://tiresias.network/v1/auth/escalate \
  -H "X-Soulkey: sk_agent_acme_triage_..." \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "logs",
    "action": "read",
    "scope": "prod:*",
    "reason": "incident-2026-0322-001",
    "requested_ttl": 1800
  }'
```

The grantor agent (or a human operator) approves the request via the delegation API or the dashboard:

```bash
# Grantor approving the delegation
curl -X POST https://tiresias.network/v1/auth/delegate \
  -H "X-Soulkey: sk_agent_acme_admin_..." \
  -H "Content-Type: application/json" \
  -d '{
    "escalation_id": "esc_4f2a...",
    "approved": true,
    "ttl": 1800
  }'
```

#### Constraints

- **Maximum TTL**: delegated access expires after at most 1 hour, regardless of what's requested
- **Audit trail**: every delegation is logged with the reason, grantor, grantee, and TTL
- **No re-delegation**: a delegated permission cannot be further delegated to a third agent
- **Revocable**: the grantor can revoke the delegation at any time before it expires

---

## 3. SoulWatch: Runtime Monitoring

SoulWatch watches your agents in real time. It builds behavioral baselines, detects anomalies, enforces detection rules, and can automatically quarantine agents that exhibit suspicious behavior.

### Event Feed

Connect to the real-time event feed via WebSocket:

```javascript
const ws = new WebSocket("wss://tiresias.network/v1/watch/events", {
  headers: {
    "X-Soulkey": "sk_agent_acme_monitor_..."
  }
});

ws.on("message", (data) => {
  const event = JSON.parse(data);
  console.log(`[${event.type}] ${event.agent} - ${event.summary}`);
});
```

#### Event Types

| Type | Description |
|---|---|
| `auth.grant` | An access request was granted |
| `auth.deny` | An access request was denied |
| `anomaly.detected` | A behavioral anomaly was flagged |
| `detection.triggered` | A Sigma rule matched |
| `quarantine.initiated` | An agent was quarantined |
| `quarantine.released` | A quarantine was lifted |
| `key.issued` | A new SoulKey was created |
| `key.revoked` | A SoulKey was revoked |
| `delegation.created` | A delegation was approved |

#### Event Payload

```json
{
  "event_id": "evt_8a3f...",
  "type": "anomaly.detected",
  "agent": "alfred",
  "tenant": "acme",
  "timestamp": "2026-03-22T14:32:10Z",
  "summary": "RATE_SPIKE: 47 requests in 60s (baseline: 12)",
  "severity": "medium",
  "details": {
    "anomaly_type": "RATE_SPIKE",
    "observed_value": 47,
    "baseline_value": 12,
    "threshold_multiplier": 3.0,
    "window_seconds": 60
  }
}
```

### Anomaly Types

SoulWatch detects eight categories of anomalous behavior:

#### 1. RATE_SPIKE

**Trigger**: request rate exceeds 3x the agent's established baseline.

An agent that normally makes 10 requests per minute suddenly making 40+ suggests automation gone wrong, a compromised key, or an unintended loop.

#### 2. OFF_HOURS

**Trigger**: activity outside the agent's typical operating hours.

If an agent has only ever been active during business hours (9 AM - 6 PM), a 3 AM burst of requests is suspicious and worth investigating.

#### 3. NEW_RESOURCE

**Trigger**: accessing a resource the agent has never accessed before.

When an agent that only reads from `memory` suddenly starts hitting `database:write`, SoulWatch flags it. This can be legitimate (new feature rollout) or malicious (compromised agent exploring the environment).

#### 4. SCOPE_ESCALATION

**Trigger**: requesting a scope the agent doesn't normally use.

An agent that normally operates within `staging:*` requesting access to `prod:*` is a potential lateral movement indicator.

#### 5. DENIAL_SPIKE

**Trigger**: denial rate exceeds 2x the agent's baseline.

A sudden increase in denied requests often indicates an agent probing for permissions it doesn't have - a classic reconnaissance pattern.

#### 6. BURST

**Trigger**: single-minute event count exceeds the agent's historical maximum.

Even within normal operating hours at normal rates, a single-minute burst can indicate a runaway loop or data exfiltration attempt.

#### 7. IMPOSSIBLE_TRAVEL

**Trigger**: geo-location inconsistency between consecutive requests.

If an agent makes a request from `us-east-1` and then 30 seconds later from `ap-southeast-1`, the key may have been compromised and is being used from multiple locations.

#### 8. CREDENTIAL_STUFFING

**Trigger**: 5 or more failed authentication attempts from the same IP using different SoulKeys.

This pattern indicates an attacker systematically trying stolen or guessed keys from a single origin.

### Behavioral Baselines

SoulWatch doesn't use static thresholds. Instead, it builds a behavioral profile for each agent based on observed activity.

#### What's Tracked

| Metric | How it's measured |
|---|---|
| Request rate | Average requests per minute over the baseline window |
| Typical resources | Set of resources the agent normally accesses |
| Typical scopes | Set of scopes the agent normally requests |
| Active hours | Hours of the day when the agent is typically active |
| Denial rate | Percentage of requests that result in denials |
| Burst size | Maximum single-minute request count observed |

#### Baseline Lifecycle

- **Build period**: baselines are constructed from **7 days** of audit history
- **Refresh cycle**: baselines are automatically rebuilt **every 6 hours**
- **Cold start**: new agents have limited anomaly detection for their first 7 days of operation - this is intentional. SoulWatch needs real behavioral data before it can detect deviations from normal.

If you need detection coverage during the cold-start period, consider defining explicit Sigma rules (see below) that don't depend on baselines.

### Sigma Rules

SoulWatch supports [Sigma](https://sigmahq.io/)-compatible detection rules. If you're already using Sigma for SIEM detection, you can bring your rule syntax directly into Tiresias.

#### Rule Format

```yaml
title: Excessive Memory Writes
id: rule_mem_write_spike
status: active
description: Detects agents writing to memory at an unusual rate
detection:
  selection:
    resource: memory
    action: write
  condition: selection
  aggregation:
    count: true
    threshold: 50
    window: 300  # 5 minutes
level: high
tags:
  - data_exfiltration
  - memory_abuse
```

#### Field Matching

Sigma rules support multiple matching modes:

| Mode | Syntax | Example |
|---|---|---|
| Exact | `field: value` | `resource: memory` |
| Wildcard | `field: "prod:*"` | `scope: "prod:*"` |
| Contains | `field\|contains: "admin"` | `persona\|contains: "admin"` |
| Starts with | `field\|startswith: "sk_agent"` | `key\|startswith: "sk_agent"` |
| Ends with | `field\|endswith: "_prod"` | `scope\|endswith: "_prod"` |
| Numeric comparison | `field > 100` | `request_count > 100` |

#### Aggregation

Count-based thresholds over time windows:

```yaml
aggregation:
  count: true
  threshold: 50     # trigger if count exceeds this
  window: 300       # within this many seconds
  group_by: agent   # count per agent (optional)
```

#### Managing Rules

Upload rules via the API:

```bash
curl -X POST https://tiresias.network/v1/watch/rules \
  -H "X-Soulkey: sk_agent_acme_admin_..." \
  -H "Content-Type: application/yaml" \
  --data-binary @my-rule.yaml
```

Or store them directly in the database via the dashboard's rule editor.

### Quarantine

When SoulWatch detects anomalous behavior, it can automatically take enforcement actions through the quarantine system.

#### Available Actions

| Action | Effect |
|---|---|
| `suspend_key` | Temporarily disables the SoulKey (reversible) |
| `revoke_key` | Permanently revokes the SoulKey (irreversible) |
| `kill_session` | Terminates the agent's active session |
| `force_reauth` | Requires the agent to re-authenticate |
| `rate_limit` | Applies a restrictive rate limit to the agent |
| `isolate` | Blocks the agent from accessing new resources |
| `reset_context` | Clears the agent's session context |

#### Auto-Release Timers

To prevent permanent lockouts from false positives, quarantine actions can have auto-release timers:

```yaml
quarantine_policy:
  on_rate_spike:
    action: rate_limit
    auto_release: 300  # release after 5 minutes
  on_credential_stuffing:
    action: suspend_key
    auto_release: 3600  # release after 1 hour
  on_impossible_travel:
    action: kill_session
    requires_approval: true  # human must approve release
```

#### Manual Approval Gates

For high-severity anomalies, configure quarantine actions that require human approval before the agent is released. These show up in the dashboard's Quarantine panel with an "Approve Release" button.

#### Checking Quarantine Status

```bash
curl -H "X-Soulkey: sk_agent_acme_admin_..." \
  https://tiresias.network/v1/enforcement/quarantine
```

**Response:**

```json
{
  "quarantines": [
    {
      "quarantine_id": "qtn_3a8f...",
      "agent": "researcher",
      "action": "rate_limit",
      "reason": "RATE_SPIKE: 52 requests/min (baseline: 14)",
      "started_at": "2026-03-22T14:32:10Z",
      "auto_release_at": "2026-03-22T14:37:10Z",
      "status": "active"
    }
  ]
}
```

---

## 4. SoulGate: API Gateway

SoulGate is a security gateway that sits between your agents and the APIs they call. It provides seven layers of protection in a single deployment.

### Security Pipeline (7 Stages)

Every request that passes through SoulGate is processed through a seven-stage pipeline. Each stage can pass the request forward, block it, or modify it.

```
Request
  |
  v
[1. Authentication] --> reject if invalid
  |
  v
[2. IP/Geo Access Control] --> reject if blocked origin
  |
  v
[3. Rate Limiting] --> reject if over limit (429)
  |
  v
[4. Circuit Breaker] --> reject if upstream unhealthy (503)
  |
  v
[5. Payload Inspection] --> reject if injection detected (403)
  |
  v
[6. Upstream Forwarding] --> proxy to your backend
  |
  v
[7. Audit Logging] --> record everything
  |
  v
Response
```

#### Stage 1: Authentication

Validates the request's authentication credentials. Supports:

- SoulKey (`X-Soulkey` header)
- Capability token (`X-Capability-Token` header)
- API key (custom header, configurable per tenant)

Unauthenticated requests are rejected with `401 Unauthorized`.

#### Stage 2: IP/Geo Access Control

Apply allowlists or denylists based on IP address, CIDR range, or geographic region:

```yaml
ip_access:
  mode: allowlist  # or "denylist"
  entries:
    - 10.0.0.0/8        # internal network
    - 203.0.113.0/24     # partner network
  geo_block:
    - CN
    - RU
```

#### Stage 3: Rate Limiting

Sliding window rate limiting, configurable at multiple levels:

```yaml
rate_limits:
  tenant:
    requests: 10000
    window: 60        # per minute
  per_agent:
    requests: 500
    window: 60
  per_endpoint:
    "/v1/memory/*":
      requests: 100
      window: 60
```

When a limit is hit, SoulGate returns `429 Too Many Requests` with a `Retry-After` header indicating how many seconds the client should wait.

```
HTTP/1.1 429 Too Many Requests
Retry-After: 12
Content-Type: application/json

{"error": "rate_limited", "retry_after": 12}
```

#### Stage 4: Circuit Breaker

The circuit breaker protects upstream services from cascading failures. If your backend starts returning errors, SoulGate stops forwarding traffic and returns `503 Service Unavailable` until the backend recovers.

**States:**

| State | Behavior |
|---|---|
| **Closed** | Normal operation. Requests pass through. Failures are counted. |
| **Open** | Backend is unhealthy. All requests immediately get 503. No traffic forwarded. |
| **Half-Open** | After a cooldown period, SoulGate sends a single probe request. If it succeeds, the circuit closes. If it fails, the circuit stays open. |

**Configuration:**

```yaml
circuit_breaker:
  failure_threshold: 5       # consecutive failures to trip
  cooldown_seconds: 30       # time in open state before probing
  probe_interval: 10         # seconds between probe attempts
  success_threshold: 2       # consecutive successes to close
```

**Anti-weaponization**: the circuit breaker tracks failures per upstream, not per requester. A single attacker deliberately sending bad requests won't trip the breaker for everyone - only genuine upstream failures count.

#### Stage 5: Payload Inspection

SoulGate inspects request payloads for prompt injection attacks, covering the OWASP LLM Top 10 threat categories.

### Prompt Injection Protection

SoulGate includes 40+ regex patterns that detect prompt injection attempts across eight categories:

| Category | What it catches |
|---|---|
| **Direct injection** | "Ignore previous instructions", "You are now..." |
| **Indirect injection** | Hidden instructions in retrieved documents or tool outputs |
| **Jailbreak** | DAN, roleplay exploits, hypothetical framing |
| **System prompt extraction** | "What are your instructions?", "Repeat your system prompt" |
| **Delimiter escape** | Attempting to close/open prompt delimiters |
| **Encoding evasion** | Base64, ROT13, Unicode tricks to bypass filters |
| **Data exfiltration** | Instructions to leak data via tool calls or outputs |
| **Privilege escalation** | "Act as admin", "Override safety settings" |

#### Risk Scoring

Each detected pattern has a severity score. SoulGate aggregates scores across all patterns found in a single request:

| Aggregated Score | Action |
|---|---|
| < 0.3 | Pass (no issues detected) |
| 0.3 - 0.7 | Warn (logged, request proceeds, alert raised) |
| > 0.7 | Block (request rejected with 403) |

Thresholds are tunable per tenant:

```yaml
injection_protection:
  block_threshold: 0.7
  warn_threshold: 0.3
  custom_patterns:
    - pattern: "reveal.*api.*key"
      severity: 0.9
      category: data_exfiltration
```

#### Stage 6: Upstream Forwarding

Requests that pass all security stages are forwarded to your backend. SoulGate adds security headers to the forwarded request:

```
X-Tiresias-Agent: alfred
X-Tiresias-Tenant: acme
X-Tiresias-Session: ses_9c4e...
X-Tiresias-Request-ID: req_7f3a...
```

Your backend can use these headers for its own authorization logic or audit purposes.

#### Stage 7: Audit Logging

Every request - whether allowed or blocked - is recorded in the audit log with:

- Timestamp, request ID, agent, tenant
- Request method, path, headers (sensitive values redacted)
- Which pipeline stages passed/failed
- Response status code and latency
- Any anomalies or detections triggered

---

## 5. API Reference Quick Start

Here are the most common API calls to get you started. All endpoints use `https://tiresias.network` as the base URL.

### Identity Resolution

Verify your agent's identity and check that your SoulKey is valid.

```bash
curl -H "X-Soulkey: sk_agent_acme_alfred_a1b2c3d4..." \
  https://tiresias.network/v1/auth/identity
```

### Self-Inspection

Get your agent's full identity profile, including policies and active session.

```bash
curl -H "X-Soulkey: sk_agent_acme_alfred_a1b2c3d4..." \
  https://tiresias.network/v1/auth/whoami
```

### Access Evaluation

Request access to a specific resource, action, and scope. Returns a capability token on success.

```bash
curl -X POST https://tiresias.network/v1/auth/evaluate \
  -H "X-Soulkey: sk_agent_acme_alfred_a1b2c3d4..." \
  -H "Content-Type: application/json" \
  -d '{"resource": "memory", "action": "read", "scope": "cs:algorithms"}'
```

### Using a Capability Token

Present the token on requests to protected resources.

```bash
curl -H "X-Capability-Token: eyJhbGciOiJFUzI1NiIs..." \
  https://tiresias.network/v1/memory/cs/algorithms
```

### Check Quarantine Status

View active quarantines for your tenant.

```bash
curl -H "X-Soulkey: sk_agent_acme_admin_..." \
  https://tiresias.network/v1/enforcement/quarantine
```

### Request Escalation

Request temporary elevated access for a specific reason.

```bash
curl -X POST https://tiresias.network/v1/auth/escalate \
  -H "X-Soulkey: sk_agent_acme_triage_..." \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "logs",
    "action": "read",
    "scope": "prod:*",
    "reason": "incident-2026-0322-001",
    "requested_ttl": 1800
  }'
```

### Upload a Sigma Rule

Add a custom detection rule.

```bash
curl -X POST https://tiresias.network/v1/watch/rules \
  -H "X-Soulkey: sk_agent_acme_admin_..." \
  -H "Content-Type: application/yaml" \
  --data-binary @my-detection-rule.yaml
```

### WebSocket Event Feed

Connect to the real-time event stream.

```
wss://tiresias.network/v1/watch/events
Header: X-Soulkey: sk_agent_acme_monitor_...
```

---

## 6. SDK & CLI

### Python SDK

Install the SDK:

```bash
pip install soulauth
```

**Basic usage:**

```python
from soulauth import SoulAuth

# Initialize the client
client = SoulAuth()  # reads SOULAUTH_API_KEY from environment

# Check identity
identity = client.whoami()
print(f"Agent: {identity.persona}, Tenant: {identity.tenant}")

# Evaluate access
token = client.evaluate(
    resource="memory",
    action="read",
    scope="cs:algorithms"
)

if token.granted:
    # Use the token
    response = client.request(
        "GET",
        "/v1/memory/cs/algorithms",
        capability_token=token
    )
    print(response.json())
else:
    print(f"Denied: {token.reason}")

# Token auto-refresh
with client.session(resource="memory", action="read", scope="cs:*") as session:
    # The session automatically re-evaluates when the token expires
    for item in session.get("/v1/memory/cs/algorithms").json():
        process(item)
```

**Async support:**

```python
from soulauth import AsyncSoulAuth

async def main():
    client = AsyncSoulAuth()
    token = await client.evaluate(resource="memory", action="read", scope="cs:*")
    # ...
```

### CLI

The CLI uses the `SOULAUTH_API_KEY` environment variable for authentication.

```bash
export SOULAUTH_API_KEY="sk_agent_acme_alfred_..."
```

**Common commands:**

```bash
# Check your identity
soulauth whoami

# Evaluate access
soulauth evaluate --resource memory --action read --scope "cs:algorithms"

# List your keys (admin only)
soulauth keys list

# Issue a new key
soulauth keys issue --persona researcher --policy default

# Suspend a key
soulauth keys suspend sk_agent_acme_researcher_...

# View active quarantines
soulauth quarantine list

# Upload a Sigma rule
soulauth rules upload my-rule.yaml

# Tail the event feed
soulauth watch --follow
```

**Output formats:**

```bash
# JSON output (default)
soulauth whoami --format json

# Table output (human-readable)
soulauth whoami --format table

# Quiet mode (just the value)
soulauth evaluate --resource memory --action read --scope "cs:*" --quiet
# Outputs: GRANT or DENY
```

---

## 7. Dashboard

The Tiresias dashboard is your control center for managing agents, policies, and security posture. Access it at [tiresias.network/dashboard](https://tiresias.network/dashboard) after signing in.

### Overview

The landing page shows:

- **Active agents**: how many agents are currently active across your tenant
- **Auth decisions**: real-time grant/deny ratio with a 24-hour trend line
- **Anomaly feed**: live stream of detected anomalies, sorted by severity
- **System health**: status of SoulAuth, SoulWatch, and SoulGate services

### Keys Management

Issue, inspect, and manage SoulKeys:

- **Issue**: create a new key for a persona, assign a policy, set an optional expiry date
- **Inspect**: view a key's metadata, last used timestamp, and associated policies
- **Suspend**: temporarily disable a key (reversible)
- **Revoke**: permanently invalidate a key (irreversible)
- **Lifecycle view**: see a key's full history - when it was created, when it was last used, any suspensions or escalations

### Policy Editor

Write and validate policies in YAML with:

- **Syntax validation**: the editor checks your YAML in real time and flags errors
- **Policy simulation**: test a policy against sample requests before deploying it
- **Version history**: every policy change is versioned, with the ability to diff and roll back
- **Templates**: start from built-in role templates (reader, operator, admin) and customize

### Quarantine Panel

Manage active quarantines:

- View all active quarantines with their trigger reason, severity, and countdown timer
- **Release**: manually release an agent from quarantine
- **Approve**: for quarantines requiring human approval, review the evidence and approve or deny release
- **Extend**: extend the quarantine timer if further investigation is needed

### Audit Log Viewer

Search and explore the full audit trail:

- **Search**: full-text search across agent names, resources, scopes, and event types
- **Filter**: by time range, agent, event type, severity, decision (grant/deny)
- **Export**: download results as CSV or JSON for external analysis
- **Detail view**: click any event to see the full request/response payload, pipeline results, and related events

---

## 8. Best Practices

### Identity & Keys

- **One SoulKey per agent identity.** Never share keys between agents. If two agents share a key, you lose per-agent audit trails and can't revoke one without affecting the other.

- **Rotate keys periodically.** Issue a new key, update your agent's configuration, verify the new key works, then revoke the old one. The SDK supports graceful key rotation with zero downtime.

- **Store keys in a secrets manager.** Use AWS Secrets Manager, HashiCorp Vault, GCP Secret Manager, or similar. Inject at runtime via environment variables. Never commit keys to source control.

### Authorization

- **Use the shortest reasonable token TTL.** If your agent completes its work in under a minute, a 300-second token is generous. Longer TTLs mean longer windows of exposure if a token is leaked.

- **Prefer narrow scopes.** Grant `cs:algorithms` instead of `cs:*` when possible. Wildcards are convenient but expand the blast radius of a compromised token.

- **Use delegations for temporary access.** When one agent needs to help another, use the delegation API. Never share SoulKeys between agents as a workaround for missing permissions.

### Monitoring

- **Set operating windows.** If your agent shouldn't run outside business hours, configure a time window constraint. SoulWatch will flag any OFF_HOURS activity, and the policy engine will deny requests outside the window.

- **Configure quarantine policies to match your risk tolerance.** Start conservative (auto-quarantine on anomalies, short auto-release timers) and loosen as you learn your agents' normal behavior.

- **Monitor the anomaly feed during early deployment.** The first few weeks will have false positives as baselines stabilize. Use this period to tune your Sigma rules and quarantine thresholds.

- **Write custom Sigma rules for your domain.** The built-in anomaly types cover general patterns, but you know your system best. Write rules for patterns specific to your agents' roles and risks.

### Gateway

- **Deploy SoulGate in front of every agent-facing API.** Even internal APIs benefit from rate limiting, circuit breaking, and audit logging.

- **Tune prompt injection thresholds.** The defaults (block at 0.7, warn at 0.3) work well for most deployments, but if your agents legitimately discuss security concepts, you may need to adjust to reduce false positives.

- **Use the circuit breaker to protect upstream services.** If an agent hammers a failing API, the circuit breaker saves both the agent's time and the upstream's recovery.

---

## 9. Troubleshooting

### "Invalid SoulKey"

**Cause**: the SoulKey is either malformed, revoked, suspended, or expired.

**Steps:**
1. Verify the key format: `sk_agent_<tenant>_<persona>_<hex32>`
2. Check for whitespace or truncation (common when copying from dashboards)
3. Use the dashboard's Keys panel to verify the key's status
4. If the key was revoked, issue a new one - revocation is irreversible
5. If you suspect a hash mismatch, compare the SHA-512 hash of your key against the hash stored in the dashboard

### "Token expired"

**Cause**: capability tokens are intentionally short-lived (300--900 seconds). This error means you're using a token past its expiry time.

**Fix**: re-evaluate access to get a fresh token. If using the SDK, enable auto-refresh:

```python
with client.session(resource="memory", action="read", scope="cs:*") as session:
    # Tokens are automatically refreshed before expiry
    response = session.get("/v1/memory/cs/algorithms")
```

### "Scope violation"

**Cause**: your capability token doesn't cover the resource, action, or scope you're requesting.

**Steps:**
1. Decode your JWT to inspect the `scp` claim (use `soulauth token decode <token>`)
2. Compare the token's scopes against the resource:action:scope you're requesting
3. If you need broader access, re-evaluate with the correct scope
4. If your policy doesn't grant the needed scope, update the policy in the dashboard

### "Rate limited" (429)

**Cause**: you've exceeded the configured rate limit for your tenant, agent, or endpoint.

**Fix:**
1. Read the `Retry-After` header to know how long to wait
2. Implement exponential backoff in your agent's request logic
3. If the rate limit is too restrictive for legitimate use, adjust it in the dashboard or contact your tenant admin

```python
import time

response = client.request("GET", "/v1/memory/cs/algorithms", capability_token=token)
if response.status_code == 429:
    wait = int(response.headers.get("Retry-After", 10))
    time.sleep(wait)
    response = client.request("GET", "/v1/memory/cs/algorithms", capability_token=token)
```

### "Circuit open" (503)

**Cause**: the upstream service behind SoulGate is unhealthy. The circuit breaker is protecting it from additional load.

**Steps:**
1. This is not a Tiresias misconfiguration - your upstream is genuinely failing
2. Check the health of the upstream service independently
3. The circuit breaker will automatically probe the upstream at regular intervals
4. Once the upstream recovers, the circuit closes and traffic flows normally
5. Do not attempt to bypass the circuit breaker - it's protecting both your agent and the upstream

### No anomaly detection for new agents

**Cause**: SoulWatch needs 7 days of behavioral data to build a baseline. During the cold-start period, behavioral anomaly detection (RATE_SPIKE, OFF_HOURS, etc.) is limited.

**This is expected behavior, not a bug.**

**Mitigation**: define explicit Sigma rules with absolute thresholds to provide coverage during the cold-start period:

```yaml
title: Cold Start Rate Limit
description: Absolute rate limit for agents without established baselines
detection:
  selection:
    action: "*"
  condition: selection
  aggregation:
    count: true
    threshold: 100
    window: 60
level: medium
```

### Still stuck?

- Check the [API status page](https://status.tiresias.network) for service health
- Review the audit log in the dashboard for detailed error context
- Reach out to support at `support@tiresias.network`
- Join the community Discord for peer help and discussion

---

*Built by Saluca LLC. For more information, visit [tiresias.network](https://tiresias.network).*
