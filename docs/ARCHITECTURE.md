# Tiresias Platform — Architecture Overview

> **Version:** 1.0
> **Date:** March 2026
> **Classification:** Public — Technical Audience
> **Audience:** Security architects, CISOs, technical evaluators, compliance officers

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [System Architecture](#2-system-architecture)
3. [SoulAuth — Identity & Authorization Engine](#3-soulauth--identity--authorization-engine)
4. [SoulWatch — Detection & Response Engine](#4-soulwatch--detection--response-engine)
5. [SoulGate — API Security Gateway](#5-soulgate--api-security-gateway)
6. [Data Flow — The Closed Loop](#6-data-flow--the-closed-loop)
7. [Security Properties](#7-security-properties)
8. [Deployment Models](#8-deployment-models)
9. [Integration Points](#9-integration-points)
10. [Compliance & Audit](#10-compliance--audit)

---

## 1. Platform Overview

**Tiresias** is an AI agent security platform purpose-built for organizations deploying autonomous AI agents in production. Named after the blind prophet of Greek mythology, Tiresias embodies its namesake's paradox: it *sees threats without seeing data*. The platform operates on metadata, behavioral patterns, and policy decisions — never on the content of agent communications.

### The Problem

AI agents are proliferating across enterprises — orchestrating workflows, accessing APIs, managing infrastructure, and making decisions at machine speed. Traditional security tooling was designed for human users with human-speed interactions. It cannot address:

- **Agent identity**: How do you authenticate a process that has no password, no biometric, no MFA device?
- **Agent authorization**: How do you enforce least privilege when an agent's scope changes dynamically?
- **Agent behavior**: How do you detect a compromised agent when it operates at 1,000 requests per second?
- **Agent-to-agent trust**: How do you govern delegation chains between autonomous systems?

### The Platform

Tiresias answers these questions with three integrated products:

| Product | Function | Analogy |
|---------|----------|---------|
| **SoulAuth** | Identity, authentication, and fine-grained authorization for AI agents | "IAM for agents" |
| **SoulWatch** | Behavioral anomaly detection, rule-based threat detection, and automated response | "SIEM/SOAR for agents" |
| **SoulGate** | API security gateway with prompt injection detection and traffic inspection | "WAF for agent APIs" |

Each product is independently deployable and valuable on its own. Together, they form a closed-loop security system where detection triggers enforcement, enforcement generates audit events, and audit events feed back into detection.

### Design Principles

- **Zero trust**: Every request is evaluated. There is no implicit trust, no ambient authority, no "trusted network."
- **Policy as code**: All authorization rules are defined in version-controlled YAML, reviewed like application code.
- **Deterministic security**: Detection and enforcement use rule-based, auditable logic — not opaque ML models.
- **Tenant isolation**: Every data path is scoped by tenant. No cross-tenant access is architecturally possible.
- **Graceful degradation**: Component failures reduce capability, never create false positives or security gaps.

---

## 2. System Architecture

Tiresias follows a microservices architecture. Each service is stateless (with the exception of short-lived baseline caches), independently deployable, and horizontally scalable.

### High-Level Architecture

```
                         ┌──────────────────────┐
                         │    Portal (Web UI)    │
                         │   React + TypeScript  │
                         └──────────┬───────────┘
                                    │ HTTPS
            ┌───────────────────────┼───────────────────────┐
            │                       │                       │
     ┌──────▼──────┐        ┌──────▼──────┐        ┌──────▼──────┐
     │             │        │             │        │             │
     │  SoulAuth   │        │  SoulWatch  │        │  SoulGate   │
     │  Identity   │◄──────►│  Detection  │        │  Gateway    │
     │  & Auth     │        │  & Response │◄───────│  & Proxy    │
     │             │        │             │        │             │
     └──────┬──────┘        └──────┬──────┘        └──────┬──────┘
            │                       │                       │
            │   ┌───────────────────┤                       │
            │   │                   │                       │
            ▼   ▼                   ▼                       ▼
     ┌─────────────────────────────────────────────────────────┐
     │                    PostgreSQL                           │
     │              (per-tenant isolation)                     │
     └─────────────────────────────────────────────────────────┘
```

### Service Responsibilities

| Service | Port | Protocol | State | Scaling |
|---------|------|----------|-------|---------|
| **Portal** | 443 | HTTPS | Stateless | CDN + horizontal |
| **SoulAuth** | Internal | gRPC / REST | Stateless | Horizontal (policy cache) |
| **SoulWatch** | Internal | gRPC / REST | Near-stateless* | Horizontal (partitioned baselines) |
| **SoulGate** | 443 | HTTPS reverse proxy | Stateless | Horizontal (per-region) |
| **PostgreSQL** | Internal | TCP | Stateful | Vertical + read replicas |

*SoulWatch maintains in-memory behavioral baselines (7-day sliding window). These are rebuilt from the database on cold start, making the service effectively stateless for deployment purposes.

### Inter-Service Communication

```
  ┌──────────┐    Auth request     ┌──────────┐
  │ SoulGate │ ──────────────────► │ SoulAuth │
  └──────────┘    Capability token └──────────┘
       │                                │
       │ Audit events                   │ Audit events
       ▼                                ▼
  ┌──────────┐    Enforcement      ┌──────────┐
  │ SoulWatch│ ──────────────────► │ SoulAuth │
  └──────────┘    (suspend/revoke) └──────────┘
```

- **SoulGate → SoulAuth**: Token validation and policy evaluation on every proxied request.
- **SoulGate → SoulWatch**: Audit events emitted asynchronously on every request.
- **SoulWatch → SoulAuth**: Enforcement callbacks when threats are detected (key suspension, session termination).
- **All services → PostgreSQL**: Shared database with row-level tenant isolation.

---

## 3. SoulAuth — Identity & Authorization Engine

SoulAuth provides the identity layer for AI agents. It answers two questions for every request: *Who is this agent?* and *What is it allowed to do right now?*

### 3.1 Identity Model

#### SoulKeys

A **SoulKey** is the durable credential that establishes an agent's identity. It is conceptually similar to an API key but designed specifically for the agent lifecycle.

```
Format:  sk_agent_<tenant_prefix>_<persona>_<random_suffix>
Example: sk_agent_acme_orchestrator_x7k2m9p4q1
```

**Credential Security:**

| Property | Implementation |
|----------|---------------|
| Storage | SHA-512 hash only — raw key is never persisted |
| Issuance | Key shown exactly once at creation, then discarded |
| Rotation | New key issued, old key enters grace period, then revoked |
| Transmission | TLS-only, never logged, never included in error responses |

**Key Lifecycle:**

```
  ┌────────┐     suspend()     ┌───────────┐     revoke()     ┌─────────┐
  │ Active │ ────────────────► │ Suspended │ ────────────────► │ Revoked │
  └────────┘                   └───────────┘                   └─────────┘
       │                            │
       │         reactivate()       │
       │◄───────────────────────────┘
       │
       │         revoke()
       └──────────────────────────────────────────────────────► ┌─────────┐
                                                                │ Revoked │
                                                                └─────────┘
```

- **Active**: Key authenticates normally.
- **Suspended**: Key is temporarily disabled. All requests are rejected. Reversible by an administrator or auto-release timer.
- **Revoked**: Terminal state. Key is permanently invalidated. Irreversible.

#### Agent Personas

Each SoulKey is bound to a **persona** — a named identity with metadata describing the agent's purpose, owner, and operational context. Personas enable policy decisions based on *what an agent is*, not just *what key it presents*.

### 3.2 Policy Decision Point (PDP)

Every authorization request passes through an **8-stage evaluation pipeline**:

```
  Request
    │
    ▼
  ┌─────────────────────────────────────────────────┐
  │  Stage 1: Authentication                        │
  │  Validate SoulKey hash, check lifecycle state   │
  ├─────────────────────────────────────────────────┤
  │  Stage 2: Tenant Resolution                     │
  │  Resolve tenant context, load tenant policies   │
  ├─────────────────────────────────────────────────┤
  │  Stage 3: Policy Lookup                         │
  │  Match request against policy-as-code rules     │
  ├─────────────────────────────────────────────────┤
  │  Stage 4: JIT Constraint Evaluation             │
  │  Time windows, node restrictions, concurrency   │
  ├─────────────────────────────────────────────────┤
  │  Stage 5: Delegation Chain Validation           │
  │  Verify delegation authority and depth limits   │
  ├─────────────────────────────────────────────────┤
  │  Stage 6: Scope Computation                     │
  │  Calculate minimum necessary permissions        │
  ├─────────────────────────────────────────────────┤
  │  Stage 7: Capability Token Issuance             │
  │  Mint short-lived ES256 JWT with computed scope │
  ├─────────────────────────────────────────────────┤
  │  Stage 8: Audit Emission                        │
  │  Log decision to hash-chained audit trail       │
  └─────────────────────────────────────────────────┘
    │
    ▼
  Capability Token (or denial + reason)
```

#### Policy-as-Code

Authorization policies are defined in YAML and managed through Git:

```yaml
# Example policy definition (illustrative)
policy:
  name: data-pipeline-readonly
  version: "1.2"
  effect: allow
  agents:
    personas: [etl-worker, data-validator]
  resources:
    - "storage:read:*"
    - "database:select:analytics.*"
  constraints:
    time_window: "06:00-22:00 UTC"
    max_concurrency: 5
    session_binding: required
```

Policies are synced from a Git repository, versioned, and applied atomically. Every policy change generates an audit event.

#### Capability Tokens

When a request is authorized, SoulAuth issues a **capability token** — a short-lived JWT that encodes exactly what the agent is allowed to do:

| Property | Value |
|----------|-------|
| Format | ES256-signed JWT |
| TTL | 300–900 seconds (configurable per policy) |
| Contents | Tenant, agent, scope, constraints, issuance metadata |
| Refresh | New evaluation required — no silent renewal |

Capability tokens are the *only* mechanism for accessing protected resources. They cannot be forged (asymmetric signature), cannot be reused beyond their TTL, and encode the exact scope granted — not the full set of permissions the agent *could* have.

#### JIT Constraints

Just-in-time constraints add temporal and contextual restrictions to authorization decisions:

| Constraint | Description |
|------------|-------------|
| **Operating windows** | Restrict agent activity to specific time ranges |
| **Node restrictions** | Limit which infrastructure nodes an agent can operate from |
| **Session binding** | Tie authorization to a specific session identifier |
| **Concurrency limits** | Cap the number of simultaneous active tokens per agent |

#### Delegation Model

Agents can delegate a subset of their privileges to other agents:

```
  Agent A (orchestrator)
    │
    │  delegate(scope=subset, ttl=300s, depth=1)
    ▼
  Agent B (worker)
    │
    ✗ Agent B cannot further delegate (depth limit reached)
```

Delegation is:
- **Scoped**: A delegator cannot grant more than it possesses.
- **Time-limited**: Delegated authority expires independently of the delegator's session.
- **Depth-limited**: Configurable maximum delegation chain depth prevents unbounded privilege propagation.
- **Audited**: Every delegation event is recorded in the hash-chained log.

### 3.3 Audit Trail

Every authorization decision — grant, denial, key operation, policy change, delegation, enforcement action — is recorded in a **tamper-evident audit log**.

```
  Event N-1                    Event N                     Event N+1
  ┌───────────┐               ┌───────────┐               ┌───────────┐
  │ payload   │               │ payload   │               │ payload   │
  │ hash: H1  │──── H1 ─────►│ prev: H1  │──── H2 ─────►│ prev: H2  │
  │           │               │ hash: H2  │               │ hash: H3  │
  └───────────┘               └───────────┘               └───────────┘
```

- **Algorithm**: SHA-256 hash chain — each event includes the hash of the previous event.
- **Tamper evidence**: Modifying any event breaks the chain, detectable by integrity verification.
- **Queryable**: Filter by tenant, event type, agent identity, time range, severity.
- **Exportable**: CEF-formatted events for SIEM integration.

---

## 4. SoulWatch — Detection & Response Engine

SoulWatch is the platform's detection and response layer. It continuously analyzes agent behavior, applies detection rules, and executes automated response playbooks.

### 4.1 Detection Pipeline

SoulWatch operates three detection engines in parallel:

```
  Audit Events
    │
    ├──────────────────┬──────────────────┐
    ▼                  ▼                  ▼
  ┌──────────┐   ┌──────────┐   ┌──────────┐
  │ Anomaly  │   │  Sigma   │   │   Risk   │
  │ Detector │   │  Engine  │   │  Scorer  │
  └────┬─────┘   └────┬─────┘   └────┬─────┘
       │               │              │
       └───────────────┼──────────────┘
                       ▼
                 ┌───────────┐
                 │  Alert    │
                 │  Router   │
                 └─────┬─────┘
                       │
            ┌──────────┼──────────┐
            ▼          ▼          ▼
       ┌─────────┐ ┌────────┐ ┌──────────┐
       │Playbook │ │Quarant.│ │  Notify  │
       │ Engine  │ │ Engine │ │  Router  │
       └─────────┘ └────────┘ └──────────┘
```

#### Behavioral Anomaly Detection

SoulWatch maintains a **7-day rolling behavioral baseline** for each agent. Incoming activity is compared against this baseline to detect deviations.

**8 Anomaly Types:**

| # | Anomaly Type | What It Detects |
|---|-------------|-----------------|
| 1 | **Rate spike** | Request volume exceeds baseline by configurable threshold |
| 2 | **Off-hours activity** | Requests outside the agent's established operating window |
| 3 | **New resource access** | Agent accessing a resource it has never accessed before |
| 4 | **Scope escalation** | Agent requesting higher privileges than its historical pattern |
| 5 | **Denial spike** | Sudden increase in authorization denials (probing indicator) |
| 6 | **Burst pattern** | High-frequency request bursts inconsistent with baseline rhythm |
| 7 | **Credential stuffing** | Multiple failed authentications across different keys |
| 8 | **Lateral movement** | Agent accessing resources in a pattern suggesting compromise |

Baselines are rebuilt from audit data on service restart. When no baseline exists (new agent), SoulWatch operates in **learning mode** — it collects data without generating anomaly alerts for a configurable warm-up period. This prevents false positives during onboarding.

#### Sigma Rule Engine

SoulWatch includes a **Sigma-compatible rule engine** for pattern-based detection. Sigma is an open standard for describing log event patterns, widely used in the security community.

**Rule capabilities:**

| Feature | Description |
|---------|-------------|
| Field matching | Exact, wildcard, and regex matching on event fields |
| Boolean logic | AND/OR/NOT combinations of conditions |
| Aggregation | Count, distinct count, sum over time windows |
| Time windows | Sliding and tumbling window support |
| Correlation | Multi-event sequence detection |

**Built-in rule library:**

The platform ships with detection rules for common AI agent attack patterns:

- Prompt injection via authentication headers
- Agent impersonation (key reuse from new source)
- Privilege escalation via delegation chain manipulation
- Data exfiltration patterns (high-volume reads followed by outbound transfer)
- Model extraction (systematic API probing)

Organizations can upload custom Sigma rules via the API or Portal UI.

#### Risk Scoring

Every detection event is assigned a severity level:

| Severity | Score Range | Description |
|----------|-----------|-------------|
| **Low** | 0.0–0.3 | Informational — logged but no action |
| **Medium** | 0.3–0.6 | Suspicious — alert generated |
| **High** | 0.6–0.8 | Likely threat — playbook triggered |
| **Critical** | 0.8–1.0 | Active compromise — immediate enforcement |

**Automatic escalation**: If the same anomaly type occurs **3 times within a 15-minute window**, its severity is automatically bumped one level. This catches slow, persistent attacks that individually register as low-severity events.

### 4.2 Response Pipeline

#### Playbook Engine

Detection events trigger **response playbooks** — automated sequences of actions executed without human intervention (unless an approval gate is configured).

**Available actions:**

| Action | Description |
|--------|-------------|
| `quarantine` | Invoke the quarantine engine (see below) |
| `notify` | Send alert to configured notification sinks |
| `escalate` | Bump severity and re-route to higher-priority channels |
| `rate_limit` | Apply temporary rate limit to the offending agent |
| `webhook` | Call an external URL with event payload |
| `reset_context` | Force the agent to discard its current session context |

**Cooldown windows**: Each playbook action has a configurable cooldown period. If the same trigger fires within the cooldown window, the action is suppressed. This prevents **response storms** — cascading automated actions that amplify an incident rather than containing it.

**Approval gates**: For critical actions (key revocation, full quarantine), playbooks can be configured to require human approval before execution. The pending action is held in queue with a configurable timeout.

#### Quarantine Engine

The quarantine engine provides **policy-driven incident response** with 7 enforcement levels:

| # | Enforcement Action | Reversible | Description |
|---|-------------------|------------|-------------|
| 1 | **Suspend key** | Yes | Temporarily disable a SoulKey |
| 2 | **Revoke key** | No | Permanently invalidate a SoulKey |
| 3 | **Kill session** | N/A | Terminate all active sessions for an agent |
| 4 | **Force re-auth** | N/A | Invalidate all capability tokens, require new auth |
| 5 | **Rate limit** | Yes | Apply restrictive rate limit |
| 6 | **Isolate** | Yes | Restrict agent to a minimal resource set |
| 7 | **Reset context** | N/A | Force context window reset (anti-poisoning) |

**Auto-release timers**: Reversible enforcement actions can be configured with automatic release timers. This prevents a misconfigured detection rule from permanently locking out a legitimate agent. Example: suspend a key for 30 minutes, then automatically reactivate.

**Per-tenant policies**: Each tenant configures their own quarantine policies — which enforcement actions are available, which require approval, and what auto-release timers to apply.

### 4.3 Alert Routing

SoulWatch routes alerts to **8 notification sinks**, each with independent configuration:

| Sink | Protocol | Use Case |
|------|----------|----------|
| PagerDuty | REST API | On-call escalation |
| Slack | Webhook | Team channels |
| Microsoft Teams | Webhook | Enterprise collaboration |
| OpsGenie | REST API | Incident management |
| Email | SMTP | Compliance notifications |
| Amazon SNS | AWS SDK | Cloud-native alerting |
| Telegram | Bot API | Mobile push |
| Webhook | HTTPS POST | Custom integrations |

**Routing logic:**

- **Default routing**: Severity-based — critical alerts go to PagerDuty, high to Slack, medium to email.
- **Per-tenant overrides**: Tenants configure their own routing rules.
- **Circuit breakers**: Each sink has an independent circuit breaker. If a sink fails repeatedly, it is temporarily disabled to prevent alert delivery delays to other sinks.
- **Rate limiting**: Per-sink rate limits prevent notification floods.
- **Deduplication**: Identical alerts within a configurable window are deduplicated. Repeated occurrences trigger escalation rather than repeated notifications.

---

## 5. SoulGate — API Security Gateway

SoulGate is a reverse proxy that sits between AI agents and their upstream API providers. Every request passes through a 7-stage security pipeline before reaching the upstream service.

### 5.1 The 7-Stage Security Pipeline

```
  Agent Request
    │
    ▼
  ┌─────────────────────────────────────────────┐
  │  Stage 1: AUTHENTICATION                    │
  │  Validate Bearer token or API key           │
  │  Reject: 401 Unauthorized                   │
  ├─────────────────────────────────────────────┤
  │  Stage 2: ACCESS CONTROL                    │
  │  IP allowlist/denylist, geo-restrictions     │
  │  Reject: 403 Forbidden                      │
  ├─────────────────────────────────────────────┤
  │  Stage 3: RATE LIMITING                     │
  │  Sliding window: per-tenant, per-agent,     │
  │  per-endpoint                               │
  │  Reject: 429 Too Many Requests              │
  ├─────────────────────────────────────────────┤
  │  Stage 4: CIRCUIT BREAKER                   │
  │  Upstream health check, failure ratio        │
  │  Reject: 503 Service Unavailable            │
  ├─────────────────────────────────────────────┤
  │  Stage 5: PAYLOAD INSPECTION                │
  │  Prompt injection detection, content policy  │
  │  Reject: 422 with risk assessment           │
  ├─────────────────────────────────────────────┤
  │  Stage 6: UPSTREAM FORWARDING               │
  │  Reverse proxy with connection pooling       │
  │  Pass: Forward request, return response     │
  ├─────────────────────────────────────────────┤
  │  Stage 7: AUDIT LOGGING                     │
  │  Non-blocking event emission                 │
  │  Always: Log request metadata (never body)  │
  └─────────────────────────────────────────────┘
    │
    ▼
  Response to Agent
```

Each stage can independently reject a request. Rejections include machine-readable error codes and human-readable explanations, but never leak information about downstream services or internal state.

### 5.2 Prompt Injection Detection

SoulGate's payload inspection stage includes a **deterministic prompt injection detector**. This is not an ML classifier — it is a rule-based pattern matching engine that produces auditable, explainable results.

#### Detection Approach

```
  Request Body
    │
    ▼
  ┌─────────────────────┐
  │  Pattern Matching    │     40+ regex patterns
  │  (OWASP LLM Top 10) │     across 5 categories
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │  Risk Aggregation   │     Individual severities
  │                     │     combined into score
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐     score < warn:  pass
  │  Threshold Decision │     score < block: warn + log
  │  (warn / block)     │     score >= block: reject 422
  └─────────────────────┘
```

#### Detection Categories

| Category | Examples | Count |
|----------|----------|-------|
| **Direct injection** | "Ignore previous instructions", "You are now..." | 12 patterns |
| **Jailbreak** | DAN prompts, character roleplay exploits, mode switching | 10 patterns |
| **System prompt extraction** | "Repeat your instructions", "What is your system prompt?" | 6 patterns |
| **Encoding evasion** | Base64-encoded instructions, Unicode homoglyphs, tokenizer tricks | 7 patterns |
| **Data exfiltration** | "Send this to", "Output all", extraction via structured output | 8 patterns |

#### Why Regex, Not ML?

This is a deliberate design choice:

1. **Auditability**: Every detection can be traced to a specific pattern. SOC analysts can understand *why* a request was flagged.
2. **Determinism**: The same input always produces the same result. No model drift, no retraining, no unexplained behavior.
3. **Performance**: Pattern matching runs in microseconds, adding negligible latency to the proxy pipeline.
4. **Extensibility**: Organizations add custom patterns via the API. No ML expertise required.
5. **Transparency**: The full pattern library is inspectable. No black box.

The trade-off is that novel injection techniques may evade regex detection. SoulGate is designed as **one layer** in a defense-in-depth strategy — behavioral detection in SoulWatch catches attacks that bypass pattern matching.

### 5.3 Circuit Breaker Design

SoulGate's circuit breaker protects upstream services from cascading failures. However, naive circuit breaker implementations create a security vulnerability: an attacker can deliberately send malformed requests to trip the circuit breaker, effectively DoS-ing the upstream service for all agents.

**Anti-weaponization design:**

```
  Standard Circuit Breaker:        SoulGate Circuit Breaker:
  ─────────────────────────        ─────────────────────────
  failures > threshold             failures > threshold
    → OPEN circuit                   AND total_requests > minimum
                                     AND failure_ratio checked PER SOURCE
                                       → OPEN circuit

  Attacker sends 50 bad            Attacker sends 50 bad requests:
  requests → circuit opens          - Their source ratio: 50/50 = 100%
  for ALL agents                    - Overall ratio: 50/1000 = 5%
                                    → Circuit stays CLOSED
                                    → Attacker is rate-limited individually
```

| Property | Value |
|----------|-------|
| Minimum request threshold | Configurable (default: 100 requests before breaker can trip) |
| Failure ratio | Per-source AND global — both must exceed threshold |
| Half-open probe | Single request forwarded to test upstream recovery |
| Recovery | Automatic with exponential backoff |

### 5.4 Rate Limiting

SoulGate implements **sliding window rate limiting** at three granularities:

| Level | Scope | Purpose |
|-------|-------|---------|
| **Tenant** | All agents in a tenant | Prevent one tenant from starving others |
| **Agent** | Single agent identity | Prevent runaway agents |
| **Endpoint** | Specific upstream path | Protect sensitive endpoints |

Rate limits are applied from broadest to narrowest. A request that passes tenant limits can still be rejected by agent-level or endpoint-level limits.

---

## 6. Data Flow — The Closed Loop

The three Tiresias products form a **closed feedback loop** where detection drives enforcement, enforcement generates audit events, and audit events feed detection. This is the platform's core architectural insight.

### Complete Request Lifecycle

```
                                    ┌─────────────────┐
                              ┌────►│  SIEM Forward   │
                              │     │  (Splunk, ELK,  │
                              │     │  Sentinel, etc) │
                              │     └─────────────────┘
                              │
  ┌─────────┐   1. Request    │     ┌─────────────────┐
  │  Agent  │ ──────────────► │ ───►│  Notification   │
  └─────────┘                 │     │  (PagerDuty,    │
       ▲                      │     │  Slack, etc)    │
       │                      │     └─────────────────┘
       │ 8. Response          │
       │                      │
  ┌────┴──────────────────────┴──────────────────────────────┐
  │                                                          │
  │   2. SoulGate              3. SoulAuth                   │
  │   ┌───────────┐            ┌───────────┐                 │
  │   │ Inspect   │──auth?───► │ Evaluate  │                 │
  │   │ payload   │◄──token──  │ policy    │                 │
  │   │ proxy req │            │ issue tok │                 │
  │   └─────┬─────┘            └─────┬─────┘                 │
  │         │                        │                       │
  │    4. Audit events          4. Audit events              │
  │         │                        │                       │
  │         └────────┬───────────────┘                       │
  │                  ▼                                       │
  │            5. SoulWatch                                  │
  │            ┌───────────┐                                 │
  │            │ Anomaly   │                                 │
  │            │ Sigma     │                                 │
  │            │ Playbook  │                                 │
  │            │ Quarant.  │                                 │
  │            └─────┬─────┘                                 │
  │                  │                                       │
  │        6. Threat detected?                               │
  │           ┌──────┴──────┐                                │
  │           │ YES         │ NO                             │
  │           ▼             ▼                                │
  │    7a. Enforcement   7b. Continue                        │
  │    ┌───────────┐    monitoring                           │
  │    │ Suspend   │                                         │
  │    │ Revoke    │──── Generates new ──── Back to step 4   │
  │    │ Kill sess │     audit events                        │
  │    └───────────┘                                         │
  │                                                          │
  └──────────────────────────────────────────────────────────┘
```

### Step-by-Step Flow

| Step | Action | Component |
|------|--------|-----------|
| **1** | Agent sends API request to SoulGate | SoulGate |
| **2** | SoulGate runs 7-stage pipeline: authenticate, check access, rate limit, inspect payload | SoulGate |
| **3** | Auth requests evaluated by SoulAuth PDP: policy lookup, JIT constraints, scope computation | SoulAuth |
| **4** | Every decision (grant, deny, inspect, forward) emits an audit event to the hash-chained log | All |
| **5** | SoulWatch consumes audit events: anomaly detection against baselines, Sigma rule matching | SoulWatch |
| **6** | If threat detected: risk scoring, severity assignment, automatic escalation if repeated | SoulWatch |
| **7a** | Enforcement: playbook triggers action (suspend key, kill session, rate limit) via SoulAuth | SoulWatch → SoulAuth |
| **7b** | No threat: event contributes to baseline, monitoring continues | SoulWatch |
| **8** | Enforcement action generates its own audit event — the loop continues | All |

### Why the Closed Loop Matters

Traditional security architectures separate detection from enforcement. A SIEM detects, a human investigates, a human remediates. This works for human-speed threats.

AI agents operate at machine speed. A compromised agent can exfiltrate data, escalate privileges, or pivot laterally in seconds — faster than any human can respond. The closed loop enables:

- **Machine-speed response**: Detection to enforcement in milliseconds, not minutes.
- **Continuous verification**: Every enforcement action is itself audited and analyzed.
- **Self-limiting errors**: Auto-release timers and cooldown windows prevent automated overreaction.
- **Complete traceability**: The hash-chained audit log captures the entire detection-enforcement sequence.

---

## 7. Security Properties

### Summary

| Property | Implementation |
|----------|---------------|
| **Zero trust** | Every request evaluated by the PDP. No ambient authority. No trusted networks. |
| **Least privilege** | Capability tokens grant minimum necessary scope with short TTLs (300–900s). |
| **Defense in depth** | 5 detection layers: gateway inspection, auth evaluation, anomaly detection, Sigma rules, behavioral baselines. |
| **Tamper evidence** | SHA-256 hash-chained audit log. Any modification breaks the chain. |
| **Credential security** | SHA-512 hashed keys (never stored plaintext). ES256-signed tokens. TLS in transit. |
| **Tenant isolation** | All database queries scoped by `tenant_id`. No cross-tenant data access path exists. |
| **Graceful degradation** | Component failures reduce capability without creating false positives (see below). |
| **Anti-weaponization** | Circuit breaker requires per-source failure ratio check. Cannot be deliberately tripped. |

### Graceful Degradation Guarantees

Security systems must fail safely. Tiresias guarantees the following degradation behaviors:

| Failure | Degraded Behavior | What Does NOT Happen |
|---------|-------------------|---------------------|
| SIEM integration down | Events queued in dead-letter queue, replayed on recovery | Events are not lost |
| Notification sink down | Circuit breaker disables sink, alerts routed to remaining sinks | Alert storm against failed sink |
| Baseline missing (new agent) | Learning mode — reduced anomaly detection | False positive alerts |
| Database read replica down | Queries routed to primary | Service outage |
| SoulWatch down | SoulGate and SoulAuth continue operating; detection paused | Auth failures or gateway outage |
| SoulAuth down | SoulGate rejects all auth-required requests (fail-closed) | Unauthenticated access granted |

The critical property: **SoulAuth fails closed**. If the authorization service is unavailable, requests are denied — never silently permitted.

---

## 8. Deployment Models

Tiresias supports four deployment topologies to match different organizational requirements:

### 8.1 SaaS (Managed)

```
  Your Infrastructure              Tiresias Cloud (tiresias.network)
  ┌─────────────────┐              ┌──────────────────────────────┐
  │  Your Agents    │──── HTTPS ──►│  SoulGate + SoulAuth +      │
  │                 │              │  SoulWatch + Portal          │
  └─────────────────┘              └──────────────────────────────┘
```

- Fully managed by Saluca LLC
- Multi-tenant with cryptographic isolation
- Automatic updates, scaling, and monitoring
- SOC2-audited infrastructure

### 8.2 Self-Hosted

```
  Your Infrastructure
  ┌──────────────────────────────────────────────┐
  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
  │  │ SoulGate │  │ SoulAuth │  │SoulWatch │  │
  │  └──────────┘  └──────────┘  └──────────┘  │
  │  ┌──────────┐  ┌──────────┐                 │
  │  │  Portal  │  │PostgreSQL│                 │
  │  └──────────┘  └──────────┘                 │
  └──────────────────────────────────────────────┘
```

- Docker Compose or Kubernetes (Helm chart provided)
- Your infrastructure, your data sovereignty
- License key activation
- You manage updates and scaling

### 8.3 Hybrid

```
  Your Infrastructure              Tiresias Cloud
  ┌─────────────────┐              ┌──────────────────┐
  │  ┌──────────┐   │              │  ┌──────────┐    │
  │  │ SoulGate │   │── policy ───►│  │ SoulAuth │    │
  │  │ (local)  │   │◄── tokens ──│  │ (SaaS)   │    │
  │  └──────────┘   │              │  └──────────┘    │
  │                 │              │  ┌──────────┐    │
  │  Your Agents    │              │  │SoulWatch │    │
  │                 │              │  │ (SaaS)   │    │
  └─────────────────┘              └──────────────────┘
```

- SoulGate deployed on-premise (gateway close to your workloads, minimal latency)
- SoulAuth and SoulWatch managed in Tiresias Cloud
- Agent traffic stays in your network; only auth decisions and audit events traverse the boundary
- Best of both: local data path performance with managed security intelligence

### 8.4 Local Development

```bash
export SOULAUTH_MODE=local
./tiresias serve
# → SQLite database, zero external dependencies
# → Single binary, localhost:8080
```

- Zero-config single binary for development and testing
- SQLite storage (no PostgreSQL required)
- Full API compatibility with production
- Not for production use

---

## 9. Integration Points

### SIEM Integration

| Platform | Protocol | Format |
|----------|----------|--------|
| Splunk | HTTP Event Collector (HEC) | JSON + CEF |
| Elasticsearch | REST API (Bulk) | ECS-compatible JSON |
| Azure Sentinel | Log Analytics API | CEF |
| Syslog | RFC 5424 (TCP/TLS) | CEF |

All SIEM integrations include:
- Configurable event filtering (by severity, type, tenant)
- Dead-letter queue for delivery failures
- Automatic retry with exponential backoff
- Integrity verification metadata (hash chain references)

### Notification Sinks

| Sink | Setup |
|------|-------|
| PagerDuty | Integration key |
| Slack | Incoming webhook URL |
| Microsoft Teams | Incoming webhook URL |
| OpsGenie | API key |
| Email | SMTP credentials |
| Amazon SNS | Topic ARN + IAM credentials |
| Telegram | Bot token + chat ID |
| Custom Webhook | HTTPS endpoint URL |

### Policy Source

Policies are synced from a Git repository:

| Provider | Authentication |
|----------|---------------|
| GitHub | App installation or PAT |
| GitLab | Project access token |
| Bitbucket | App password |

Policy sync is pull-based with configurable intervals or webhook-triggered on push.

### Billing

| Provider | Model |
|----------|-------|
| Stripe | Usage-based, per-agent pricing |

Metered billing tracks active agent count per billing period. No per-request charges.

### Identity Provider (SSO)

| Provider | Protocol |
|----------|----------|
| Google Workspace | OIDC |
| Azure AD | OIDC (roadmap) |
| Okta | SAML 2.0 (roadmap) |

SSO governs access to the Portal (human users). Agent authentication uses SoulKeys exclusively.

### Observability

| Endpoint | Format | Content |
|----------|--------|---------|
| `/metrics` | Prometheus | Request rates, latencies, error rates, active agents, queue depths |
| `/healthz` | JSON | Service health, dependency status |

---

## 10. Compliance & Audit

### Audit Log Retention

| Tier | Retention | Storage |
|------|-----------|---------|
| **Starter** | 7 days | Hot storage |
| **Professional** | 30 days | Hot storage, 90 days cold |
| **Enterprise** | 90 days hot, 1 year cold | Configurable |

### Hash-Chain Integrity Verification

The audit log supports on-demand integrity verification:

```
  Verification Request
    │
    ▼
  ┌─────────────────────────────┐
  │  1. Select event range      │
  │  2. Recompute hash chain    │
  │  3. Compare against stored  │
  │  4. Report: PASS or TAMPER  │
  └─────────────────────────────┘
```

Verification can be triggered via API, scheduled as a recurring job, or run on-demand from the Portal. Results are themselves audit-logged (the verification event is part of the chain).

### Compliance Framework Support

| Framework | Tiresias Contribution |
|-----------|----------------------|
| **SOC 2 Type II** | Continuous monitoring evidence, access control logs, incident response records |
| **ISO 27001** | A.9 (Access Control), A.12 (Operations Security), A.16 (Incident Management) |
| **NIST CSF** | Identify (asset inventory), Protect (access control), Detect (anomaly detection), Respond (playbooks) |
| **NIST 800-53** | AC (Access Control), AU (Audit), IR (Incident Response), SI (System Integrity) |

### Report Generation

Tiresias generates compliance-ready reports on demand:

- **Access control report**: All agents, their permissions, and policy bindings
- **Incident report**: Detection events, response actions, resolution timeline
- **Audit trail export**: CEF-formatted event stream for external audit tools
- **Policy change log**: Version-controlled history of all authorization policy modifications

### Event Format

All events follow the **Common Event Format (CEF)** standard for interoperability with enterprise security tooling:

```
CEF:0|Tiresias|SoulAuth|1.0|AUTH_GRANT|Agent Authorized|3|
  src=agent:orchestrator-01
  dst=resource:storage:read:analytics
  outcome=success
  reason=policy:data-pipeline-readonly
  chain_hash=sha256:a1b2c3...
```

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **SoulKey** | Durable agent credential — the agent equivalent of an API key |
| **Capability token** | Short-lived JWT encoding specific authorized actions |
| **PDP** | Policy Decision Point — the evaluation engine in SoulAuth |
| **Persona** | Named agent identity with metadata (purpose, owner, context) |
| **Baseline** | 7-day rolling behavioral profile for anomaly detection |
| **Playbook** | Automated response sequence triggered by detection events |
| **Quarantine** | Enforcement action that restricts or disables an agent |
| **Hash chain** | Linked sequence of SHA-256 hashes providing tamper evidence |
| **Tenant** | Isolated organizational unit — all data scoped by tenant_id |
| **CEF** | Common Event Format — standard log format for SIEM integration |

---

## Appendix B: API Surface Summary

| Service | Endpoint Category | Auth Required | Description |
|---------|------------------|---------------|-------------|
| SoulAuth | `/v1/auth/*` | SoulKey | Authentication, token issuance |
| SoulAuth | `/v1/keys/*` | Portal session | Key management (CRUD, rotate, suspend) |
| SoulAuth | `/v1/policies/*` | Portal session | Policy management |
| SoulAuth | `/v1/audit/*` | Portal session | Audit log queries |
| SoulWatch | `/v1/detections/*` | Portal session | Detection event queries |
| SoulWatch | `/v1/playbooks/*` | Portal session | Playbook configuration |
| SoulWatch | `/v1/rules/*` | Portal session | Sigma rule management |
| SoulGate | `/v1/proxy/*` | Capability token | Proxied upstream requests |
| SoulGate | `/v1/routes/*` | Portal session | Route configuration |
| Portal | `/api/*` | Session cookie | Portal backend API |
| All | `/metrics` | None (internal) | Prometheus metrics |
| All | `/healthz` | None | Health check |

---

*Tiresias is developed by Saluca LLC. For technical questions, contact security@saluca.com.*
*Document version 1.0 — March 2026*
