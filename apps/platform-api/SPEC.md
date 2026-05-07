# SoulAuth — Enterprise Agent Identity & Zero-Trust Authorization System

**Version:** 1.0.0-draft
**Date:** 2026-03-17
**Author:** Alfred (Saluca LLC)
**Status:** DRAFT — Pending Implementation Planning

---

## 1. Executive Summary

SoulAuth is an enterprise-grade, zero-trust identity and authorization system for AI agent ecosystems. It provides durable agent identity (soulkeys), just-in-time policy evaluation (PDP), short-lived capability tokens, and distributed policy enforcement (PEPs) — enabling organizations to manage fleets of AI agents with the same rigor applied to human IAM.

The system is designed for multi-tenant deployment. Saluca LLC's internal Bat-Family agent network serves as tenant zero, with the architecture supporting arbitrary organizations, persona models, and resource topologies.

### Core Principles

1. **Zero standing access** — agents never hold persistent permissions; all access is JIT-evaluated
2. **Identity ≠ authorization** — soulkeys prove who an agent is; policy determines what it can do
3. **Policy-as-code** — all authorization rules are git-managed, PR-reviewed, and audit-trailed
4. **Enforce at every boundary** — PEPs validate capability tokens at each resource entry point
5. **Granular configurability** — per-persona, per-resource, per-action, per-context scoping

---

## 2. System Architecture

### 2.1 High-Level Flow

```
Agent (with soulkey)
        │
        ▼
┌─────────────────────────┐
│  1. Identity Resolution  │  soul-svc: _soulkeys table
│     (who is this?)       │  → persona_id, tenant_id, status
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  2. Policy Decision      │  PDP: evaluates policy-as-code
│     Point (PDP)          │  inputs: persona, resource, action, context
│                          │  output: GRANT or DENY + reasoning
└───────────┬─────────────┘
            │
       ┌── DENY ──→ 403 + audit log entry
       │
     GRANT
       │
       ▼
┌─────────────────────────┐
│  3. Capability Token     │  Short-lived JWT (5-15 min)
│     Issuance             │  claims: granted scopes, targets, expiry
│                          │  session-bound (anti-replay)
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  4. Policy Enforcement   │  PEPs at each resource boundary
│     Points (PEPs)        │  validate JWT, check scope, log access
└─────────────────────────┘
```

### 2.2 Component Map

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Identity Store | Supabase `_soulkeys` table | Durable agent identity records |
| Policy Repository | Git (per-tenant or namespaced) | Source-of-truth for authorization rules |
| Policy Cache | Supabase `_soulauth_policy_cache` | Resolved policy for runtime PDP lookups |
| PDP | soul-svc `/v1/auth/evaluate` | Policy evaluation + capability token issuance |
| PEPs | soul-svc middleware, node agents, API proxy | Boundary enforcement of capability tokens |
| Audit Log | Supabase `_soulauth_audit` | Immutable record of all auth events |
| Admin API | soul-svc `/v1/soulauth/admin/*` | Key lifecycle, policy sync, tenant management |

### 2.3 Coexistence with Existing Auth

SoulAuth operates **parallel** to the existing `sk_soul_*` tenant API key system:

| Concern | Existing `sk_soul_*` | SoulAuth Soulkeys |
|---------|---------------------|-------------------|
| Scope | Tenant-level service auth | Agent-level identity + JIT authorization |
| Table | `_soul_api_keys` | `_soulkeys` |
| Format | `sk_soul_<hex64>` | `sk_agent_<tenant>_<persona>_<hex32>` |
| Permissions | Full tenant access | Policy-derived, JIT, scoped |
| Use case | Service-to-service | Agent-to-resource |

Both systems coexist. `sk_soul_*` gates access to soul-svc itself; soulkeys gate what an authenticated agent can do within it.

---

## 3. Identity Layer — Soulkeys

### 3.1 Soulkey Format

```
sk_agent_<tenant_short>_<persona_slug>_<hex32>

Examples:
  sk_agent_sal_alfred_a3f8c2d9e1b04f7a8c6d2e9f0b3a5c7d
  sk_agent_sal_oracle_7b2e4f6a8d0c1e3b5a9f7d2c4e6b8a0f
  sk_agent_acme_sentinel_c4a2e8f6d0b1937a5c8e2f4b6d0a3e7c
```

The persona slug is a **human-readable hint only**. Identity resolution is always server-side via key hash lookup. The slug is never used for authorization decisions.

### 3.2 Database Schema — `_soulkeys`

```sql
CREATE TABLE _soulkeys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES _soul_tenants(id),
    persona_id      TEXT NOT NULL,
    key_hash        TEXT NOT NULL UNIQUE,  -- SHA-512 of raw key
    label           TEXT,                  -- human description
    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'suspended', 'revoked')),
    issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ,          -- NULL = permanent
    last_used_at    TIMESTAMPTZ,
    suspended_at    TIMESTAMPTZ,
    suspended_by    TEXT,
    revoked_at      TIMESTAMPTZ,
    revoked_by      TEXT,
    revocation_reason TEXT,
    metadata        JSONB DEFAULT '{}'::jsonb,  -- node affinity, issuing context
    UNIQUE(tenant_id, persona_id, status) -- one active key per persona per tenant
);

CREATE INDEX idx_soulkeys_hash ON _soulkeys(key_hash);
CREATE INDEX idx_soulkeys_tenant_persona ON _soulkeys(tenant_id, persona_id);
CREATE INDEX idx_soulkeys_status ON _soulkeys(status) WHERE status = 'active';
```

### 3.3 Key Lifecycle

```
           issue
             │
             ▼
         ┌────────┐
         │ active  │◄──── reinstate (from suspended)
         └───┬────┘
             │
        ┌────┴────┐
        ▼         ▼
  ┌───────────┐  ┌─────────┐
  │ suspended │  │ revoked  │  (terminal — no reinstatement)
  └───────────┘  └─────────┘
```

- **Issue:** Admin API generates key, stores SHA-512 hash, returns raw key once
- **Active:** Key resolves identity, PDP evaluates requests
- **Suspended:** Key resolves identity but PDP auto-denies. Reversible. Use case: incident response, maintenance
- **Revoked:** Permanent. Key hash retained for audit trail. Raw key is dead.
- **Expired:** Auto-transitions to suspended when `expires_at` passes

### 3.4 Key Generation

```python
import secrets
import hashlib

def generate_soulkey(tenant_short: str, persona_slug: str) -> tuple[str, str]:
    """Returns (raw_key, key_hash). Raw key is shown once, never stored."""
    raw = f"sk_agent_{tenant_short}_{persona_slug}_{secrets.token_hex(32)}"
    hashed = hashlib.sha512(raw.encode()).hexdigest()
    return raw, hashed
```

---

## 4. Policy Layer — Policy-as-Code

### 4.1 Policy Repository Structure

```
soulauth-policy/
├── tenants/
│   ├── saluca/
│   │   ├── tenant.yaml           # tenant-level defaults
│   │   ├── personas/
│   │   │   ├── alfred.yaml       # orchestrator
│   │   │   ├── oracle.yaml       # domain specialist
│   │   │   ├── robin.yaml        # domain specialist
│   │   │   ├── red-hood.yaml     # domain specialist
│   │   │   ├── nightwing.yaml    # domain specialist
│   │   │   └── ...
│   │   └── resources/
│   │       ├── memory.yaml       # memory access rules
│   │       ├── vault.yaml        # vault access rules
│   │       ├── mesh.yaml         # node access rules
│   │       └── external.yaml     # external API rules
│   └── acme-corp/
│       ├── tenant.yaml
│       ├── personas/
│       │   └── ...
│       └── resources/
│           └── ...
├── shared/
│   ├── roles.yaml                # role templates (orchestrator, specialist, observer)
│   └── defaults.yaml             # global defaults
├── schemas/
│   └── policy-schema.json        # JSON Schema for policy validation
└── .github/
    └── workflows/
        └── deploy.yaml           # CI: validate → deploy to soul graph
```

### 4.2 Persona Policy Schema

```yaml
# tenants/saluca/personas/alfred.yaml
apiVersion: soulauth/v1
kind: PersonaPolicy
metadata:
  tenant: saluca
  persona: alfred
  role: orchestrator
  description: "AI chief of staff — unrestricted orchestrator"

spec:
  jit:
    max_capability_ttl: 900          # seconds (15 min max)
    default_capability_ttl: 300      # seconds (5 min default)
    require_active_session: true
    allowed_nodes: ["*"]
    operating_window: "24/7"         # cron-style or "24/7"
    max_concurrent_capabilities: 10

  resources:
    memory:
      - actions: [read, write, delete]
        scopes: ["*"]
        conditions: []

    vault:
      - actions: [read, reveal]
        scopes: ["*"]
        conditions:
          - require_approval: false

    mesh:
      - actions: [ssh, execute, transfer]
        nodes: ["*"]
        conditions:
          - require_approval: false

    external_api:
      - actions: [invoke]
        services: ["*"]
        conditions:
          - rate_limit: 1000/hour

  escalation:
    can_grant_temporary_access: true   # orchestrators can delegate
    can_suspend_agents: true
    approval_required_for: []          # no gates for orchestrator
```

```yaml
# tenants/saluca/personas/oracle.yaml
apiVersion: soulauth/v1
kind: PersonaPolicy
metadata:
  tenant: saluca
  persona: oracle
  role: domain_specialist
  description: "CS & Math domain specialist"

spec:
  jit:
    max_capability_ttl: 300
    default_capability_ttl: 120
    require_active_session: true
    allowed_nodes: ["claude-code-gcp", "ai-lab"]
    operating_window: "24/7"
    max_concurrent_capabilities: 5

  resources:
    memory:
      - actions: [read, write]
        scopes: ["cs:*", "math:*"]
        conditions: []
      - actions: [read]
        scopes: ["*"]
        conditions:
          - require_approval: true
          - approver_role: orchestrator

    vault:
      - actions: [read]
        scopes: ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"]
        conditions:
          - require_approval: false
      - actions: [reveal]
        scopes: ["*"]
        conditions:
          - require_approval: true
          - approver_role: orchestrator

    mesh:
      - actions: [ssh]
        nodes: ["ai-lab"]
        conditions: []
      - actions: [ssh, execute]
        nodes: ["*"]
        conditions:
          - require_approval: true

    external_api:
      - actions: [invoke]
        services: ["openai", "anthropic", "google"]
        conditions:
          - rate_limit: 500/hour

  escalation:
    can_grant_temporary_access: false
    can_suspend_agents: false
    approval_required_for:
      - cross_scope_memory_access
      - vault_reveal
      - multi_node_ssh
```

### 4.3 Role Templates

```yaml
# shared/roles.yaml
apiVersion: soulauth/v1
kind: RoleTemplates

roles:
  orchestrator:
    description: "Unrestricted agent with delegation authority"
    defaults:
      jit:
        max_capability_ttl: 900
        allowed_nodes: ["*"]
      escalation:
        can_grant_temporary_access: true
        can_suspend_agents: true

  domain_specialist:
    description: "Scoped to specific knowledge domains and resources"
    defaults:
      jit:
        max_capability_ttl: 300
        allowed_nodes: []  # must be explicitly set
      escalation:
        can_grant_temporary_access: false
        can_suspend_agents: false

  observer:
    description: "Read-only access for monitoring and analytics"
    defaults:
      jit:
        max_capability_ttl: 120
        allowed_nodes: []
      resources:
        memory:
          - actions: [read]
            scopes: ["*"]
        vault:
          - actions: []
            scopes: []
        mesh:
          - actions: []
            nodes: []

  service_account:
    description: "Machine-to-machine with fixed scope"
    defaults:
      jit:
        max_capability_ttl: 60
        require_active_session: false
```

### 4.4 Policy Sync Pipeline

```
Git push to policy repo
        │
        ▼
┌─────────────────────┐
│  CI: Validate        │  JSON Schema validation
│  - schema check      │  Detect scope conflicts
│  - conflict check    │  Ensure no orphan references
│  - diff report       │  Generate human-readable diff
└───────────┬─────────┘
            │
            ▼
┌─────────────────────┐
│  CI: Deploy          │  Resolve all policies into flat records
│  - resolve policies  │  Upsert into _soulauth_policy_cache
│  - sync to Supabase  │  Invalidate PDP cache
│  - invalidate cache  │  Log deployment event
└───────────┬─────────┘
            │
            ▼
┌─────────────────────┐
│  PDP picks up new    │  Next auth request uses fresh policy
│  policy on next eval │  Zero downtime, no agent restart
└─────────────────────┘
```

### 4.5 Policy Cache Schema — `_soulauth_policy_cache`

```sql
CREATE TABLE _soulauth_policy_cache (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES _soul_tenants(id),
    persona_id      TEXT NOT NULL,
    policy_version  TEXT NOT NULL,        -- git SHA
    resolved_policy JSONB NOT NULL,       -- flattened, evaluated policy
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, persona_id)
);
```

---

## 5. Authorization Layer — PDP (Policy Decision Point)

### 5.1 PDP Endpoint

```
POST /v1/auth/evaluate
Authorization: Bearer <sk_soul_*>  (tenant service key)
X-Soulkey: <sk_agent_*>           (agent identity)

Request:
{
    "resource": "memory",
    "action": "write",
    "scope": "cs:algorithms",
    "context": {
        "node": "ai-lab",
        "session_id": "oracle-main",
        "request_id": "uuid"
    }
}

Response (GRANT):
{
    "decision": "grant",
    "capability_token": "eyJhbG...",  // JWT
    "expires_in": 300,
    "granted_scopes": ["memory:write:cs:algorithms"],
    "audit_id": "uuid"
}

Response (DENY):
{
    "decision": "deny",
    "reason": "persona 'oracle' lacks mesh:execute on node 'batcave01'",
    "escalation_available": true,
    "escalation_approver_role": "orchestrator",
    "audit_id": "uuid"
}
```

### 5.2 PDP Evaluation Logic

```python
async def evaluate(
    soulkey: SoulkeyIdentity,
    resource: str,
    action: str,
    scope: str,
    context: AuthContext
) -> AuthDecision:

    # 1. Check key status
    if soulkey.status != "active":
        return deny(f"soulkey status: {soulkey.status}")

    # 2. Check expiry
    if soulkey.expires_at and soulkey.expires_at < now():
        await suspend_key(soulkey.id, reason="expired")
        return deny("soulkey expired")

    # 3. Load resolved policy from cache
    policy = await load_policy(soulkey.tenant_id, soulkey.persona_id)
    if not policy:
        return deny("no policy found for persona")

    # 4. JIT constraint checks
    if policy.jit.require_active_session:
        if not await has_active_session(soulkey.persona_id, context.session_id):
            return deny("no active soul session")

    if context.node not in policy.jit.allowed_nodes and "*" not in policy.jit.allowed_nodes:
        return deny(f"node {context.node} not in allowed_nodes")

    if not within_operating_window(policy.jit.operating_window):
        return deny("outside operating window")

    if await count_active_capabilities(soulkey.id) >= policy.jit.max_concurrent_capabilities:
        return deny("max concurrent capabilities reached")

    # 5. Resource + action + scope check
    resource_rules = policy.resources.get(resource, [])
    matching_rule = find_matching_rule(resource_rules, action, scope)

    if not matching_rule:
        return deny(f"no rule grants {action} on {resource}:{scope}")

    # 6. Condition evaluation
    for condition in matching_rule.conditions:
        if condition.require_approval:
            approval = await check_approval(soulkey, resource, action, scope)
            if not approval:
                return deny_with_escalation(
                    reason=f"requires {condition.approver_role} approval",
                    approver_role=condition.approver_role
                )
        if condition.rate_limit:
            if await exceeds_rate_limit(soulkey.id, resource, condition.rate_limit):
                return deny("rate limit exceeded")

    # 7. Issue capability token
    capability = issue_capability_token(
        soulkey_id=soulkey.id,
        tenant_id=soulkey.tenant_id,
        persona_id=soulkey.persona_id,
        granted_scopes=[f"{resource}:{action}:{scope}"],
        ttl=min(context.requested_ttl or policy.jit.default_capability_ttl,
                policy.jit.max_capability_ttl),
        session_binding=context.session_id
    )

    # 8. Audit log
    await log_auth_event(
        event="grant",
        soulkey_id=soulkey.id,
        resource=resource,
        action=action,
        scope=scope,
        capability_id=capability.jti,
        context=context
    )

    return grant(capability)
```

### 5.3 Capability Token (JWT)

```python
def issue_capability_token(...) -> str:
    payload = {
        "iss": "soulauth",
        "sub": soulkey_id,           # which soulkey
        "tid": tenant_id,            # tenant isolation
        "pid": persona_id,           # persona hint
        "scp": granted_scopes,       # ["memory:write:cs:algorithms"]
        "sid": session_binding,      # anti-replay: tied to session
        "jti": uuid4(),              # unique token ID
        "iat": now(),
        "exp": now() + ttl,
    }
    return jwt.encode(payload, signing_key, algorithm="ES256")
```

**Signing:** ES256 (ECDSA P-256) — asymmetric so PEPs can verify with public key without accessing the signing key.

**Token properties:**
- Short-lived (5-15 min, configurable per policy)
- Narrowly scoped (only the requested resource:action:scope)
- Session-bound (anti-replay via `sid` claim)
- Non-renewable (agent must re-evaluate at PDP for fresh token)

---

## 6. Enforcement Layer — PEPs (Policy Enforcement Points)

### 6.1 PEP Placement

| Resource | PEP Location | Enforcement |
|----------|-------------|-------------|
| Soul memory | soul-svc FastAPI middleware | Validate JWT, check `scp` contains `memory:<action>:<topic>` |
| Vault secrets | soul-svc vault router | Validate JWT, check `scp` contains `vault:<action>:<key>` |
| Mesh nodes | Node-local soulauth agent | Validate JWT, check `scp` contains `mesh:<action>:<node>` |
| External APIs | LiteLLM / API proxy | Validate JWT, check `scp` contains `external_api:<service>` |
| Agent-to-agent | soul-svc relay endpoint | Validate JWT, check both parties authorized |

### 6.2 PEP Middleware (soul-svc)

```python
async def soulauth_pep(request: Request, call_next):
    """FastAPI middleware — validates capability token on protected endpoints."""

    capability_token = request.headers.get("X-Capability-Token")
    if not capability_token:
        raise HTTPException(401, "missing capability token")

    try:
        claims = jwt.decode(
            capability_token,
            public_key,
            algorithms=["ES256"],
            options={"require": ["exp", "sub", "tid", "scp", "sid", "jti"]}
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "capability token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "invalid capability token")

    # Check token hasn't been revoked (emergency kill)
    if await is_token_revoked(claims["jti"]):
        raise HTTPException(401, "capability token revoked")

    # Derive required scope from request
    required_scope = derive_scope_from_request(request)

    # Validate scope
    if not scope_matches(claims["scp"], required_scope):
        await log_auth_event(event="scope_violation", ...)
        raise HTTPException(403, f"scope {required_scope} not in capability token")

    # Validate session binding
    session_id = request.headers.get("X-Session-ID")
    if claims["sid"] and claims["sid"] != session_id:
        raise HTTPException(403, "session binding mismatch")

    # Inject auth context for downstream handlers
    request.state.soulauth = SoulAuthContext(
        soulkey_id=claims["sub"],
        tenant_id=claims["tid"],
        persona_id=claims["pid"],
        scopes=claims["scp"],
        capability_id=claims["jti"]
    )

    response = await call_next(request)

    # Log successful access
    await log_auth_event(event="access", ...)

    return response
```

### 6.3 Node-Local PEP Agent

For mesh node enforcement, a lightweight agent runs on each Tailscale node:

```yaml
# Deployed via systemd on each mesh node
# soulauth-pep.service
[Unit]
Description=SoulAuth PEP Agent
After=tailscaled.service

[Service]
ExecStart=/usr/local/bin/soulauth-pep \
    --verify-key=/etc/soulauth/public.pem \
    --soul-svc-url=https://soul-svc.saluca.com \
    --node-id=%H
Restart=always
```

The node PEP intercepts SSH sessions initiated with a capability token and validates before allowing the connection. For nodes using Tailscale SSH, this integrates as a post-auth hook.

---

## 7. Audit System

### 7.1 Audit Log Schema — `_soulauth_audit`

```sql
CREATE TABLE _soulauth_audit (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
    event_type      TEXT NOT NULL,
    -- CHECK (event_type IN (
    --   'key_issued', 'key_suspended', 'key_revoked', 'key_reinstated',
    --   'auth_grant', 'auth_deny', 'scope_violation',
    --   'capability_issued', 'capability_used', 'capability_revoked',
    --   'policy_synced', 'policy_violation',
    --   'escalation_requested', 'escalation_approved', 'escalation_denied'
    -- ))
    soulkey_id      UUID,
    persona_id      TEXT,
    resource        TEXT,
    action          TEXT,
    scope           TEXT,
    decision        TEXT,                  -- grant | deny
    reason          TEXT,
    capability_id   UUID,
    context         JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- context includes: node, session_id, request_id, ip, user_agent
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_tenant_time ON _soulauth_audit(tenant_id, timestamp DESC);
CREATE INDEX idx_audit_soulkey ON _soulauth_audit(soulkey_id, timestamp DESC);
CREATE INDEX idx_audit_event ON _soulauth_audit(event_type);

-- Partition by month for large-scale deployments
-- CREATE TABLE _soulauth_audit_2026_03 PARTITION OF _soulauth_audit
--     FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
```

### 7.2 Audit Events

| Event | Trigger | Logged Fields |
|-------|---------|---------------|
| `key_issued` | Admin issues new soulkey | persona, label, expires_at |
| `key_suspended` | Manual or auto (expiry) | reason, suspended_by |
| `key_revoked` | Admin revocation | reason, revoked_by |
| `key_reinstated` | Admin reinstates suspended key | reinstated_by |
| `auth_grant` | PDP grants access | resource, action, scope, capability_id |
| `auth_deny` | PDP denies access | resource, action, scope, reason |
| `scope_violation` | PEP rejects over-scope request | requested vs. granted scope |
| `capability_issued` | PDP issues JWT | ttl, scopes, session_binding |
| `capability_used` | PEP validates JWT at resource | resource accessed |
| `capability_revoked` | Emergency kill of live token | reason |
| `policy_synced` | CI deploys new policy | git SHA, diff summary |
| `escalation_requested` | Agent requests cross-scope access | target resource, approver_role |
| `escalation_approved` | Orchestrator approves escalation | approver persona, ttl granted |
| `escalation_denied` | Orchestrator denies escalation | reason |

### 7.3 Compliance Reporting

```
GET /v1/soulauth/admin/audit/report
Authorization: Bearer <sk_soul_*>

Query params:
  - tenant_id (required)
  - start_date, end_date
  - persona_id (optional filter)
  - event_type (optional filter)
  - format: json | csv

Response: Paginated audit records for compliance review
```

---

## 8. Escalation & Delegation

### 8.1 Cross-Scope Access Requests

When an agent needs access outside its policy (e.g., Oracle needs to read Nightwing's business:strategy memories):

```
POST /v1/auth/escalate
X-Soulkey: <oracle's key>

{
    "resource": "memory",
    "action": "read",
    "scope": "business:strategy",
    "justification": "Cross-referencing market data for ML model evaluation",
    "requested_ttl": 300
}

Response:
{
    "escalation_id": "uuid",
    "status": "pending",
    "approver_role": "orchestrator",
    "notification_sent": true
}
```

### 8.2 Approval Flow

Orchestrator agents (Alfred, Batman) receive escalation requests via Telegram / soul relay and can approve or deny:

```
POST /v1/auth/escalate/{escalation_id}/approve
X-Soulkey: <alfred's key>

{
    "approved": true,
    "granted_ttl": 300,
    "note": "Approved for Q1 analysis"
}
```

Approval issues a one-time capability token with the escalated scope. The approval itself is audit-logged.

### 8.3 Delegation

Orchestrators can pre-authorize temporary scope expansions:

```
POST /v1/auth/delegate
X-Soulkey: <alfred's key>

{
    "target_persona": "oracle",
    "resource": "memory",
    "action": "read",
    "scope": "business:strategy",
    "ttl": 3600,
    "reason": "Q1 cross-domain analysis sprint"
}
```

Creates a time-bound policy override stored in `_soulauth_delegations`:

```sql
CREATE TABLE _soulauth_delegations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    grantor_id      UUID NOT NULL REFERENCES _soulkeys(id),
    grantee_persona TEXT NOT NULL,
    resource        TEXT NOT NULL,
    action          TEXT NOT NULL,
    scope           TEXT NOT NULL,
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,
    reason          TEXT,
    revoked_at      TIMESTAMPTZ,
    revoked_by      TEXT
);
```

PDP checks delegations alongside static policy. Delegation always has a TTL — no permanent overrides outside the policy repo.

---

## 9. Admin API

### 9.1 Key Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/soulauth/admin/keys` | POST | Issue new soulkey for persona |
| `/v1/soulauth/admin/keys` | GET | List all soulkeys for tenant |
| `/v1/soulauth/admin/keys/{id}` | GET | Get soulkey details |
| `/v1/soulauth/admin/keys/{id}/suspend` | POST | Suspend soulkey |
| `/v1/soulauth/admin/keys/{id}/reinstate` | POST | Reinstate suspended key |
| `/v1/soulauth/admin/keys/{id}/revoke` | POST | Permanently revoke soulkey |
| `/v1/soulauth/admin/keys/{id}/rotate` | POST | Issue new key, revoke old |

### 9.2 Policy Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/soulauth/admin/policy/sync` | POST | Trigger policy sync from git |
| `/v1/soulauth/admin/policy/current` | GET | Get resolved policy for persona |
| `/v1/soulauth/admin/policy/diff` | GET | Compare cached vs. git policy |
| `/v1/soulauth/admin/policy/validate` | POST | Validate policy YAML |

### 9.3 Tenant Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/soulauth/admin/tenant` | GET | Tenant dashboard (keys, usage, audit) |
| `/v1/soulauth/admin/tenant/onboard` | POST | Initialize new tenant with default policy |
| `/v1/soulauth/admin/tenant/offboard` | POST | GDPR-compliant tenant removal |

---

## 10. Multi-Tenant Architecture

### 10.1 Tenant Isolation

Every table, query, and operation is scoped by `tenant_id`. There is no cross-tenant data access at any layer:

- Soulkeys: `WHERE tenant_id = ?`
- Policy cache: `WHERE tenant_id = ?`
- Audit log: `WHERE tenant_id = ?`
- Delegations: `WHERE tenant_id = ?`
- Capability tokens: `tid` claim verified at PEP

### 10.2 Tenant Onboarding Flow

```
1. Create tenant record in _soul_tenants
2. Create tenant namespace in policy repo (or fork template)
3. Define personas + policies in YAML
4. CI syncs policies to _soulauth_policy_cache
5. Issue soulkeys for each persona
6. Distribute soulkeys to agent instances
7. Agents authenticate → PDP evaluates → PEPs enforce
```

### 10.3 Tier-Based Defaults

```yaml
# shared/defaults.yaml
tiers:
  free:
    max_personas: 3
    max_keys_per_persona: 1
    max_capability_ttl: 300
    audit_retention_days: 30
    escalation: false

  pro:
    max_personas: 25
    max_keys_per_persona: 3
    max_capability_ttl: 900
    audit_retention_days: 365
    escalation: true

  enterprise:
    max_personas: unlimited
    max_keys_per_persona: 10
    max_capability_ttl: 3600
    audit_retention_days: unlimited
    escalation: true
    custom_policy_repo: true
    sla: true
```

---

## 11. Cryptographic Details

### 11.1 Key Material

| Material | Algorithm | Purpose |
|----------|-----------|---------|
| Soulkey hash | SHA-512 | Identity verification (one-way) |
| Capability JWT signing | ES256 (ECDSA P-256) | Asymmetric — PEPs verify with public key |
| Signing key storage | GCP Secret Manager / Vault | Never in env vars or code |
| Key rotation | Automatic, 90-day cycle | Old public keys retained for token verification |

### 11.2 Signing Key Distribution

```
Signing private key: soul-svc only (GCP Secret Manager)
Verification public key: distributed to all PEPs
    - soul-svc middleware (local)
    - Node PEP agents (/etc/soulauth/public.pem)
    - API proxy (config)
```

Public key rotation: new key issued → both old and new keys valid during overlap period → old key retired after max_capability_ttl passes.

---

## 12. Integration Points

### 12.1 soul-svc Changes

- New router: `/v1/soulauth/` (admin + evaluate endpoints)
- New middleware: `soulauth_pep` on protected memory/vault endpoints
- New tables: `_soulkeys`, `_soulauth_policy_cache`, `_soulauth_audit`, `_soulauth_delegations`
- New dependency: `require_soulauth()` FastAPI dependency

### 12.2 MCP Integration

Soul-MCP gains new tools:

```typescript
// Agent requests capability before accessing resources
soul_auth_request({
    resource: "memory",
    action: "write",
    scope: "cs:algorithms"
})
// → returns capability_token or denial reason

// Agent checks its current permissions
soul_auth_whoami()
// → returns persona, active capabilities, policy summary
```

### 12.3 Tailscale Mesh Integration

Node PEP agent integrates with Tailscale SSH:

```
Agent SSH request
    → Tailscale SSH authenticates identity (mesh trust)
    → Post-auth hook calls PEP agent
    → PEP validates capability token for mesh:<action>:<node>
    → Allow or deny session
```

### 12.4 Observability

- **Metrics:** Auth latency (p50/p95/p99), grant/deny ratio, capability token issuance rate, policy sync lag
- **Alerts:** Spike in denials, policy sync failures, key compromise (unusual usage patterns)
- **Dashboard:** Grafana integration via existing Alloy/OTel pipeline

---

## 13. Security Considerations

### 13.1 Threat Model

| Threat | Mitigation |
|--------|-----------|
| Soulkey theft | SHA-512 hashed storage, immediate revocation, audit trail |
| Capability token replay | Session binding (`sid`), short TTL, JTI uniqueness |
| Policy tampering | Git-signed commits, PR review gates, immutable audit log |
| Privilege escalation | JIT evaluation, no standing access, approval gates |
| Cross-tenant leakage | `tenant_id` isolation on every query, JWT `tid` claim |
| Signing key compromise | GCP Secret Manager, 90-day rotation, key revocation propagation |
| Insider threat | All actions audited, separation of duties (policy review ≠ key issuance) |

### 13.2 Incident Response

1. **Suspend** — immediately suspend compromised soulkey(s)
2. **Kill** — revoke any live capability tokens via emergency revocation list
3. **Audit** — pull audit log for affected soulkey(s) to determine blast radius
4. **Rotate** — issue new soulkeys to affected personas
5. **Review** — policy review to tighten access if needed
6. **Report** — compliance report generated from audit log

---

## 14. Saluca Internal Deployment (Tenant Zero)

### 14.1 Initial Persona Map

| Persona | Role | Key Resources |
|---------|------|---------------|
| alfred | orchestrator | All memory, all vault, all mesh, all APIs |
| batman | orchestrator | All memory, all vault, all mesh, all APIs |
| oracle | domain_specialist | Memory: cs/math, Mesh: ai-lab, APIs: openai/anthropic/google |
| robin | domain_specialist | Memory: robotics, Mesh: ai-lab, APIs: openai/anthropic |
| red-robin | domain_specialist | Memory: physics/math/robotics/cs, Mesh: ai-lab, APIs: all research |
| red-hood | domain_specialist | Memory: security, Mesh: staging-*, APIs: security tools |
| nightwing | domain_specialist | Memory: business, Mesh: none, APIs: analytics |
| harvey-dent | domain_specialist | Memory: legal, Mesh: none, APIs: legal research |
| dr-thompkins | domain_specialist | Memory: medical, Mesh: none, APIs: medical research |

### 14.2 Mesh Node Map

| Node | Accessible By | Restricted Operations |
|------|--------------|----------------------|
| claude-code-gcp | all personas | execute: orchestrators only |
| mindset-api | all personas | execute: orchestrators only |
| ai-lab | oracle, robin, red-robin, orchestrators | unrestricted for assigned |
| batcave01 | orchestrators only | full access |
| staging-* | red-hood, orchestrators | security testing |
| gemini-cli | all personas (read), orchestrators (execute) | — |
| claude-code | all personas | execute: orchestrators only |
| nas00 | orchestrators only | storage management |

---

## 15. Migration Path

### Phase 1: Foundation
- Create database tables (`_soulkeys`, `_soulauth_policy_cache`, `_soulauth_audit`, `_soulauth_delegations`)
- Implement soulkey issuance + identity resolution in soul-svc
- Set up policy repo with Saluca tenant zero config

### Phase 2: PDP
- Implement `/v1/auth/evaluate` endpoint
- Implement capability token issuance (JWT ES256)
- Policy sync pipeline (git → CI → Supabase)

### Phase 3: PEPs
- soul-svc middleware PEP (memory + vault)
- Node-local PEP agent (mesh SSH)
- API proxy PEP (external services)

### Phase 4: Escalation & Delegation
- Escalation request/approval flow
- Delegation API
- Telegram notification integration

### Phase 5: Enterprise
- Multi-tenant onboarding API
- Tenant policy repo templating
- Tier-based limits enforcement
- Compliance reporting endpoints
- Billing integration hooks

### Phase 6: Observability
- Grafana dashboards
- Alert rules
- Usage analytics per tenant

---

## Appendix A: API Reference Summary

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /v1/auth/evaluate` | sk_soul + soulkey | PDP: evaluate access request |
| `POST /v1/auth/escalate` | soulkey | Request cross-scope access |
| `POST /v1/auth/escalate/{id}/approve` | soulkey (orchestrator) | Approve escalation |
| `POST /v1/auth/delegate` | soulkey (orchestrator) | Grant temporary scope |
| `GET /v1/auth/whoami` | soulkey | Agent self-inspection |
| `POST /v1/soulauth/admin/keys` | sk_soul | Issue soulkey |
| `GET /v1/soulauth/admin/keys` | sk_soul | List soulkeys |
| `POST /v1/soulauth/admin/keys/{id}/suspend` | sk_soul | Suspend key |
| `POST /v1/soulauth/admin/keys/{id}/revoke` | sk_soul | Revoke key |
| `POST /v1/soulauth/admin/keys/{id}/rotate` | sk_soul | Rotate key |
| `POST /v1/soulauth/admin/policy/sync` | sk_soul | Trigger policy sync |
| `GET /v1/soulauth/admin/policy/current` | sk_soul | View resolved policy |
| `GET /v1/soulauth/admin/audit/report` | sk_soul | Compliance report |
| `POST /v1/soulauth/admin/tenant/onboard` | sk_soul (platform) | New tenant setup |

## Appendix B: Glossary

| Term | Definition |
|------|-----------|
| **Soulkey** | Durable, opaque identity credential for an AI agent |
| **PDP** | Policy Decision Point — evaluates access requests against policy |
| **PEP** | Policy Enforcement Point — validates capability tokens at resource boundaries |
| **Capability Token** | Short-lived JWT encoding JIT-granted scopes |
| **Policy-as-code** | Git-managed YAML files defining persona authorization rules |
| **Escalation** | Process for agents to request access outside their policy scope |
| **Delegation** | Orchestrator-granted temporary scope expansion |
| **Tenant Zero** | Saluca LLC's internal deployment — the reference implementation |

## Appendix C: Patent Relevance

This system may be covered by or relevant to the following Saluca LLC provisional patents:
- Agent identity and memory systems
- Multi-persona AI orchestration
- Zero-trust authorization for AI agent ecosystems

Review with Harvey Dent (legal persona) before any public disclosure beyond this internal spec.

---

## 16. Trial & Demo Key Provisioning

### 16.1 Self-Service Trial Flow

Enterprise prospects can provision time-limited soulkeys via a public-facing form — no human approval needed for trial tier.

```
Prospect fills contact form
        │
        ▼
┌─────────────────────────┐
│  1. Lead Capture         │  Name, email, company, use case
│     (saluca.com form)    │  Stored in _soulauth_trials
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  2. Automated Validation │  Email verification (magic link)
│                          │  Domain check (disposable email block)
│                          │  Rate limit (1 trial per domain per 90 days)
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  3. Trial Tenant + Key   │  Auto-create:
│     Provisioning         │  - _soul_tenants record (tier: trial)
│                          │  - Default trial policy (from template)
│                          │  - Single soulkey (7-day TTL)
│                          │  - Sandbox resource allocation
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  4. Delivery             │  Email: soulkey + quickstart guide
│                          │  Dashboard: trial usage metrics
│                          │  CRM: lead record created
└─────────────────────────┘
```

### 16.2 Trial Constraints

```yaml
# shared/trial-defaults.yaml
trial:
  max_duration_days: 7
  max_personas: 2
  max_keys: 1
  max_capability_ttl: 120           # 2 min — shorter for trial
  max_requests_per_day: 500
  resources:
    memory:
      actions: [read, write]
      max_records: 1000
    vault:
      actions: []                    # no vault access in trial
    mesh:
      actions: []                    # no mesh access in trial
    external_api:
      actions: [invoke]
      services: ["openai", "anthropic"]  # limited model access
      rate_limit: 100/hour
  escalation: false
  delegation: false
  audit_retention_days: 7            # purged after trial ends
```

### 16.3 Trial Database Schema — `_soulauth_trials`

```sql
CREATE TABLE _soulauth_trials (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID REFERENCES _soul_tenants(id),
    contact_name    TEXT NOT NULL,
    contact_email   TEXT NOT NULL,
    company_name    TEXT NOT NULL,
    company_domain  TEXT NOT NULL,
    use_case        TEXT,
    email_verified  BOOLEAN DEFAULT false,
    verification_token TEXT,
    soulkey_id      UUID REFERENCES _soulkeys(id),
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN (
                      'pending',         -- awaiting email verification
                      'active',          -- trial running
                      'expired',         -- 7 days elapsed
                      'converted',       -- upgraded to paid
                      'churned'          -- expired without conversion
                    )),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    activated_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,         -- activated_at + 7 days
    converted_at    TIMESTAMPTZ,
    metadata        JSONB DEFAULT '{}'::jsonb,  -- UTM params, referral source
    UNIQUE(company_domain, status)       -- one active trial per domain
);

CREATE INDEX idx_trials_email ON _soulauth_trials(contact_email);
CREATE INDEX idx_trials_domain ON _soulauth_trials(company_domain);
CREATE INDEX idx_trials_status ON _soulauth_trials(status) WHERE status = 'active';
```

### 16.4 Trial API Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /v1/trial/register` | Public (rate-limited) | Submit contact form, trigger email verification |
| `GET /v1/trial/verify/{token}` | Public (magic link) | Verify email, provision tenant + soulkey |
| `GET /v1/trial/status` | Trial soulkey | Check trial usage, days remaining |
| `POST /v1/trial/convert` | Trial soulkey | Initiate upgrade to paid tier |

### 16.5 Trial → Conversion Flow

```
Day 1-5: Trial active, usage tracked
Day 5:   Automated email — "2 days remaining, here's what you built"
Day 6:   Automated email — "Last day tomorrow, upgrade to keep your data"
Day 7:   Trial soulkey auto-expires (suspended)
Day 7+:  Data retained for 30 days (grace period for late conversion)
Day 37:  Data purged if not converted (GDPR compliance)
```

On conversion:
- Tenant tier upgraded (trial → pro/enterprise)
- New permanent soulkey(s) issued
- Trial data migrated to production tenant
- Trial soulkey revoked
- CRM updated

### 16.6 Anti-Abuse

- **Rate limit:** 1 trial per company domain per 90 days
- **Disposable email block:** Reject known throwaway domains
- **Usage monitoring:** Flag trials with anomalous patterns (automated scraping, excessive API calls)
- **IP reputation:** Optional integration with abuse detection service
- **Manual review queue:** Trials from flagged domains require human approval
