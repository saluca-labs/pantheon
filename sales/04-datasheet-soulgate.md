# SoulGate - Product Datasheet

**API Security Gateway for AI Agents**

---

## Overview

SoulGate is a reverse proxy gateway that secures the perimeter between your AI agents and external services. It enforces rate limiting, detects prompt injection attacks, manages circuit breakers, and provides API key management - all agent-aware and policy-driven.

Every request passes through a 7-step security pipeline before reaching upstream services. SoulGate validates tokens issued by SoulAuth and logs all traffic for audit.

**Status**: Generally Available
**Version**: 3.6.1
**Deployment**: Docker sidecar alongside SoulAuth
**Docker Hub**: salucalabs/tiresias-soulgate

---

## Core Capabilities

### 7-Step Security Pipeline
Every request passes through:
1. **Authentication** - Token validation (ES256 local + SoulAuth callback)
2. **IP Access Control** - IP/CIDR allowlist and blocklist enforcement
3. **Rate Limiting** - Sliding window rate limiter (in-memory + DB config)
4. **Circuit Breaking** - 3-state machine (closed/open/half-open)
5. **Request Inspection** - Prompt injection detection (40+ OWASP patterns)
6. **Proxy** - Reverse proxy to upstream services
7. **Audit Logging** - Async batch audit trail

### Prompt Injection Detection
- 40+ detection patterns based on OWASP known injection techniques
- Pattern matching on request content
- Custom threat pattern support
- Block or alert modes

### Rate Limiting
- Sliding window algorithm for accurate throttling
- Per-agent, per-endpoint, or global rate limits
- In-memory fast path with database-backed configuration
- Configurable windows and thresholds

### Circuit Breakers
- 3-state machine: closed (healthy), open (failing), half-open (testing)
- Anti-weaponization protections to prevent abuse of circuit breaker triggers
- Per-upstream circuit isolation
- Configurable failure thresholds and recovery windows
- Prevents cascade failures across your agent fleet

### CoT Policy Enforcement
- Chain-of-Thought policy evaluation at the gateway layer
- Enforce reasoning transparency requirements before forwarding requests

### API Key Management
- Bcrypt-hashed key storage
- Key rotation with zero-downtime overlap
- Key revocation with immediate effect
- Per-key rate limits and access scoping

### IP/CIDR Access Controls
- Allowlist and blocklist support
- CIDR range matching (stdlib ipaddress)
- Per-upstream access rules
- IPv4 and IPv6 support

---

## Technical Specifications

| Specification | Detail |
|---|---|
| API | RESTful, ~32 operations |
| Pipeline | 7-step request processing |
| Injection Patterns | 40+ OWASP detection signatures |
| Rate Limiter | Sliding window (memory + DB) |
| Circuit Breaker | 3-state machine per upstream |
| Key Hashing | Bcrypt |
| Token Validation | ES256 local + SoulAuth callback |
| Audit | Async batch logging |
| Database | PostgreSQL 16 (shared cluster, isolated tables) |
| CoT Enforcement | Gateway-level policy evaluation |
| Circuit Breaker | 3-state with anti-weaponization |
| Test Coverage | 40 tests (rate limit, inspection, circuit breaker) |
| Container | Docker sidecar |
| Orchestration | Kubernetes-ready (GCP Cloud Run verified) |

---

## Architecture

```
Inbound Request
        |
+-------v--------------------------+
|       SoulGate Pipeline           |
|                                   |
|  1. Auth ---- Token validation    |
|  2. IP ------ CIDR access check   |
|  3. Rate ---- Sliding window      |
|  4. Circuit - Breaker check       |
|  5. Inspect - Injection detection |
|  6. Proxy --- Forward to upstream |
|  7. Audit --- Async batch log     |
|                                   |
+------|------|--------------------+
       |      |
  Upstream    Audit DB
  Services    (PostgreSQL)
```

**Key principle**: SoulGate never writes to SoulAuth or SoulWatch tables. It calls their APIs for token validation and event forwarding.

---

## Database Tables

| Table | Purpose |
|---|---|
| _soulgate_api_keys | API key store (bcrypt hashed) |
| _soulgate_rate_limits | Rate limit configuration |
| _soulgate_access_rules | IP/CIDR access control rules |
| _soulgate_upstreams | Upstream service registry |
| _soulgate_request_log | Async audit trail |
| _soulgate_circuit_states | Circuit breaker state persistence |
| _soulgate_threat_patterns | Custom injection detection patterns |

---

## Pricing

SoulGate is not sold separately. It is included as part of the unified Tiresias platform.

| Tier | Platform Price | SoulGate Access |
|---|---|---|
| **Open** | **Free** | Reverse proxy, basic rate limiting, prompt injection detection (40+ patterns), request audit, 7-day retention |
| **Starter** | **$49/mo** | Everything in Open + circuit breakers, enhanced rate limiting, 30-day retention |
| **Pro** | **$199/mo** | Everything in Starter + API key management with rotation, IP access controls (CIDR), CoT policy enforcement, custom threat patterns, 90-day retention, upstream health monitoring |
| **Enterprise** | **$2,499/mo** | Everything in Pro + geographic access controls, custom retention, full audit export (CSV/API), dedicated gateway instance, custom payload inspection rules, dedicated support (8h SLA) |
| **MSSP** | **$4,999/mo base + $199/tenant** | Multi-tenant gateway management, cross-tenant access rules |

Annual billing: 17% discount (2 months free). Also available as part of the Tiresias Platform bundle (save up to 18%).

---

## Use Cases

**LLM API Protection** - Protect your OpenAI/Anthropic/internal LLM endpoints with rate limiting, prompt injection detection, and circuit breakers.

**Multi-Service Gateway** - Route and protect traffic across multiple upstream services with per-upstream circuit breakers and access controls.

**API Key Governance** - Replace scattered API keys with centralized, rotatable, revocable key management with per-key rate limits.

**Threat Surface Reduction** - Detect and block prompt injection attacks at the perimeter before they reach your agent infrastructure.

---

*Saluca LLC | tiresias.network/platform/soulgate*
