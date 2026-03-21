# Tiresias SoulAuth — Quick Start Guide

**Service URL:** `https://tiresias-soulauth-253892677982.us-central1.run.app`
**Swagger Docs:** `https://tiresias-soulauth-253892677982.us-central1.run.app/docs`
**Version:** 1.1.0 (Enterprise mode, Postgres-backed)

---

## 1. Get Your SoulKey

SoulKeys are agent identity credentials. Each maps to a persona within a tenant.

**Admin endpoint** (requires owner/admin soulkey):
```bash
curl -X POST https://tiresias-soulauth-253892677982.us-central1.run.app/v1/soulauth/admin/keys \
  -H 'Content-Type: application/json' \
  -H 'X-SoulKey: <your-admin-soulkey>' \
  -d '{
    "tenant_id": "<your-tenant-uuid>",
    "persona_id": "my_agent",
    "label": "My Agent",
    "metadata": {"role": "agent", "admin_role": "viewer"}
  }'
```

The response includes `raw_key` — **save it immediately, it is shown exactly once.**

**Self-service trial** (no auth needed):
```bash
curl -X POST https://tiresias-soulauth-253892677982.us-central1.run.app/v1/trial/register \
  -H 'Content-Type: application/json' \
  -d '{
    "contact_name": "Your Name",
    "contact_email": "you@company.com",
    "company_name": "Your Company",
    "company_domain": "company.com"
  }'
```

---

## 2. Verify Your Identity

```bash
curl https://tiresias-soulauth-253892677982.us-central1.run.app/v1/auth/whoami \
  -H 'X-Soulkey: <your-soulkey>'
```

Returns your persona, tenant, status, and policy summary.

---

## 3. Evaluate Access (PDP)

Request a capability token for a specific resource/action/scope:

```bash
curl -X POST https://tiresias-soulauth-253892677982.us-central1.run.app/v1/auth/evaluate \
  -H 'Content-Type: application/json' \
  -H 'X-Soulkey: <your-soulkey>' \
  -d '{
    "resource": "memory",
    "action": "read",
    "scope": "global"
  }'
```

**Response (grant):**
```json
{
  "decision": "grant",
  "capability_token": "eyJhbGciOi...",
  "expires_in": 120,
  "granted_scopes": ["memory:read:global"]
}
```

**Response (deny):**
```json
{
  "decision": "deny",
  "reason": "no matching scope in policy"
}
```

The capability token is an ES256-signed JWT valid for the policy-defined TTL.

---

## 4. Model Routing

Policies define which LLMs each persona can use per task type:

```yaml
# Example: Alfred's policy
model_policies:
  task_routing:
    reasoning:
      required: ["claude-opus-4-20250514"]
    code_generation:
      allowed: ["claude-sonnet-4-20250514", "claude-opus-4-20250514"]
    code_review:
      allowed: ["claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"]
  forbidden_models: ["gpt-3.5-turbo"]
  enforcement: "strict"
```

Model routing is evaluated by the SoulGate proxy (separate service).

---

## 5. RSAC Demo

**Demo SoulKey (RSAC 2026):**
```
sk_agent_rsa_demo_agent_28605dca8a60a454ceb85dd08a23e7039f7da632c518442cfc961450fd65570a
```

**Try it:**
```bash
# Check identity
curl https://tiresias-soulauth-253892677982.us-central1.run.app/v1/auth/whoami \
  -H 'X-Soulkey: sk_agent_rsa_demo_agent_28605dca8a60a454ceb85dd08a23e7039f7da632c518442cfc961450fd65570a'

# Request capability token
curl -X POST https://tiresias-soulauth-253892677982.us-central1.run.app/v1/auth/evaluate \
  -H 'Content-Type: application/json' \
  -H 'X-Soulkey: sk_agent_rsa_demo_agent_28605dca8a60a454ceb85dd08a23e7039f7da632c518442cfc961450fd65570a' \
  -d '{"resource": "memory", "action": "read", "scope": "global"}'
```

---

## Key Concepts

| Concept | Description |
|---------|-------------|
| **SoulKey** | SHA-512-hashed agent credential. Shown once at issuance. |
| **Tenant** | Isolated namespace (org). Each has its own keys, policies, audit. |
| **Persona** | Agent identity within a tenant (e.g., "alfred", "nanoclaw"). |
| **PDP** | Policy Decision Point. Evaluates access requests against YAML policies. |
| **Capability Token** | Short-lived ES256 JWT granting specific resource/action/scope. |
| **JIT Access** | Just-in-time: tokens are ephemeral, not persistent permissions. |

---

## API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /health | None | Service health check |
| GET | /docs | None | Swagger UI |
| GET | /v1/auth/identity | X-Soulkey | Resolve agent identity |
| GET | /v1/auth/whoami | X-Soulkey | Self-inspection with policy summary |
| POST | /v1/auth/evaluate | X-Soulkey | PDP: evaluate access request |
| POST | /v1/soulauth/admin/tenants | X-SoulKey (owner) | Create tenant |
| GET | /v1/soulauth/admin/tenants | X-SoulKey (viewer+) | List tenants |
| POST | /v1/soulauth/admin/keys | X-SoulKey (admin+) | Issue soulkey |
| GET | /v1/soulauth/admin/keys | X-SoulKey (viewer+) | List soulkeys |
| GET | /v1/soulauth/admin/audit/report | X-SoulKey (viewer+) | Query audit log |
| POST | /v1/trial/register | None | Self-service trial registration |

---

*Tiresias SoulAuth by Saluca Labs — Zero-trust authorization for AI agents.*
