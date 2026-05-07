# Tiresias Platform - Agent Security Model Assessment

**Assessor**: Senior AI Agent Security Architect
**Date**: 2026-03-18
**Scope**: Full top-down security review of agent identity, authorization, enforcement, and runtime monitoring
**Codebase Version**: master branch (commit 5948843)

---

## Executive Summary

The Tiresias platform demonstrates a well-structured zero-trust architecture for AI agent authorization with strong design patterns (ES256 capability tokens, SHA-512 identity hashing, policy-as-code). However, this assessment identifies **28 findings** including **5 critical**, **8 high**, **9 medium**, **4 low**, and **2 informational** issues that must be addressed before the platform can credibly serve as an enterprise agent security product.

The most severe class of issues involves: (1) ephemeral key generation in production creating a catastrophic identity collapse on restart, (2) admin endpoints lacking tenant-scoping allowing cross-tenant data access, (3) session validation being a no-op, (4) in-memory-only revocation/quarantine state, and (5) the license validator accepting unsigned JWTs when no secret is configured.

---

## Findings

---

### FINDING-01: Ephemeral JWT Key Generation in Production
**Severity**: CRITICAL
**Files**: `src/tokens/capability.py` lines 50-51, 64-65, 90-91
**Component**: Capability Token System

**Description**: When no JWT key is configured (`jwt_private_key_path` and `jwt_private_key` are both None), the system generates an ephemeral EC key in memory via `ec.generate_private_key()`. This key is cached at module level but is lost on process restart. Every capability token issued before a restart becomes unverifiable after the restart because the public key has changed. In a multi-worker deployment (gunicorn, Kubernetes), each worker generates a different ephemeral key, meaning tokens issued by worker A cannot be validated by worker B.

**Attack Scenario**: A malicious agent exploits the restart window - tokens issued under the old key are indistinguishable from forged tokens. In multi-worker mode, an agent can forge tokens and present them to a different worker that cannot distinguish valid from invalid.

**Recommended Fix**:
- NEVER generate ephemeral keys silently. If no key is configured, fail hard at startup with a clear error message.
- Add a startup check in `lifespan()` that validates JWT keys are explicitly configured.
- Log a CRITICAL-level warning if ephemeral keys are used even in debug mode.

```python
# In _load_private_key():
else:
    raise RuntimeError(
        "CRITICAL: No JWT signing key configured. "
        "Set SOULAUTH_JWT_PRIVATE_KEY_PATH or SOULAUTH_JWT_PRIVATE_KEY. "
        "Refusing to start with ephemeral keys."
    )
```

---

### FINDING-02: Session Validation is a No-Op
**Severity**: CRITICAL
**Files**: `src/auth/pdp.py` lines 473-477
**Component**: PDP / Zero-Trust Identity Model

**Description**: The `has_active_session()` function is implemented as `return bool(session_id and session_id.strip())`. This means ANY non-empty string is accepted as a valid session. The `require_active_session` JIT constraint in policy is rendered meaningless. An agent can fabricate any session ID and pass session binding checks.

**Attack Scenario**: A compromised agent that has a stolen soulkey can bypass session binding by providing any arbitrary string as `session_id`. The PEP middleware's session binding check (line 134-138) also only compares the session ID in the token to the header - but since any session ID is accepted at token issuance, the binding is meaningless.

**Recommended Fix**:
- Implement a real session store (Redis/DB-backed) with session lifecycle management.
- Sessions should have creation timestamps, TTLs, and be bound to specific soulkey IDs.
- At minimum, validate session format (e.g., UUID) and track active sessions per soulkey.

---

### FINDING-03: Admin Endpoints Lack Tenant Scoping (Cross-Tenant Data Access)
**Severity**: CRITICAL
**Files**: `src/admin/router.py` lines 293-324 (list_keys), 327-357 (get_key), 660-712 (audit_report)
**Component**: Multi-Tenant Isolation

**Description**: The admin key management and audit endpoints do NOT verify that the authenticated soulkey belongs to the tenant being queried. The RBAC system (`require_permission`) checks the role permission but never validates that the requesting admin has authority over the specific `tenant_id` being queried.

For example, `admin_list_keys` accepts any `tenant_id` as a query parameter. An admin soulkey from Tenant A with `keys:read` permission can list all soulkeys for Tenant B by simply providing Tenant B's UUID.

Similarly, `admin_get_key` retrieves any key by its UUID regardless of tenant, and `admin_audit_report` accepts any `tenant_id` and returns that tenant's full audit trail.

**Attack Scenario**: A malicious tenant administrator enumerates all tenant IDs (e.g., via timing attacks on the API or social engineering), then queries the audit trail and key listings of competing tenants, extracting sensitive operational data about their agent deployments.

**Recommended Fix**:
- After RBAC check, extract the authenticated soulkey's `tenant_id` and enforce that the requested `tenant_id` matches.
- For `admin_get_key`, join on `Soulkey.tenant_id` to ensure the key belongs to the admin's tenant.
- Add a `get_current_tenant_id()` dependency that extracts tenant from the authenticated soulkey.

---

### FINDING-04: In-Memory Token Revocation List (Lost on Restart)
**Severity**: CRITICAL
**Files**: `src/tokens/capability.py` lines 36, 163-170
**Component**: Capability Token System

**Description**: The token revocation list (`_revoked_tokens`) is an in-memory Python `set()`. When the process restarts, ALL revocations are lost. Revoked tokens become valid again. In a multi-worker deployment, revocations are process-local - revoking in worker A has no effect on worker B.

**Attack Scenario**: An agent's capability token is revoked due to detected malicious behavior. The agent waits for the next deployment or worker restart, and the token becomes valid again (as long as it hasn't expired). In multi-worker setups, the agent can immediately retry against a different worker.

**Recommended Fix**:
- Back `_revoked_tokens` with a Redis set or database table with TTL matching `max_token_ttl`.
- On startup, load all non-expired revocations from the backing store.
- Distribute revocation events across workers via pub/sub or shared store.

---

### FINDING-05: License Validator Accepts Unsigned JWTs Without Secret
**Severity**: CRITICAL
**Files**: `src/license/validator.py` lines 87-101
**Component**: License Enforcement

**Description**: The `_decode_jwt_claims()` function only verifies the HMAC signature when `TIRESIAS_LICENSE_SECRET` environment variable is set. If the secret is not configured (which is common in development and potentially in misconfigured production), ANY JWT with valid structure and claims is accepted as a valid license. An attacker can craft an enterprise-tier license JWT with arbitrary features and expiry.

**Attack Scenario**: An attacker crafts a base64-encoded JWT with `{"tier": "enterprise", "exp": 9999999999, "sub": "attacker"}`, sets it as `TIRESIAS_LICENSE_KEY`, and gains full enterprise-tier access to all features without paying, bypassing all feature gates.

**Recommended Fix**:
- Require `TIRESIAS_LICENSE_SECRET` to be configured when `license_required=True`.
- Use asymmetric (RSA/EC) signatures for license JWTs so the signing key never needs to be on the customer's server.
- Always verify the signature; never silently skip verification.

---

### FINDING-06: Rate Limit Fails Open
**Severity**: HIGH
**Files**: `src/auth/pdp.py` lines 522-523
**Component**: PDP Authorization Engine

**Description**: The `exceeds_rate_limit()` function has a catch-all exception handler at line 522-523 that returns `False` (allow the request) when rate limit parsing fails. This means any malformed rate limit string in policy (e.g., `"100/millennia"`, `"abc"`, `""`) silently disables rate limiting.

**Attack Scenario**: A policy author makes a typo in a rate limit value (e.g., `"100/hrs"` instead of `"100/hour"`). The rate limit silently fails open, allowing unlimited requests. A malicious agent that discovers this can abuse the unprotected resource without triggering rate limits.

**Recommended Fix**:
- Fail closed: return `True` (deny) on parse errors.
- Add strict validation of rate limit strings during policy loading/sync.
- Log a warning when an unrecognized rate limit format is encountered.

---

### FINDING-07: Operating Window Check Only Validates Start Time
**Severity**: HIGH
**Files**: `src/auth/pdp.py` lines 48-68
**Component**: PDP Authorization Engine

**Description**: The `_within_operating_window()` function parses windows like `"09:00-17:00"` but only checks if the current time is past the start time. The end time is never parsed or checked. A window of `"09:00-17:00"` would allow access at 23:00 as long as it's past 09:00. Additionally, unrecognized formats default to `True` (allow).

**Attack Scenario**: A policy specifies that an agent should only operate during business hours. The agent operates at 3:00 AM, exfiltrating data outside the monitoring window. The operating window constraint provides false assurance.

**Recommended Fix**:
```python
def _within_operating_window(window: str) -> bool:
    if window == "24/7":
        return True
    try:
        if "-" in window:
            parts = window.split("-")
            start_h, start_m = map(int, parts[0].strip().split(":"))
            end_h, end_m = map(int, parts[1].strip().split(":")[:2])
            now = datetime.now(timezone.utc)
            start = now.replace(hour=start_h, minute=start_m, second=0)
            end = now.replace(hour=end_h, minute=end_m, second=0)
            if end <= start:  # overnight window
                return now >= start or now <= end
            return start <= now <= end
    except (ValueError, IndexError):
        pass
    return False  # Fail closed for unrecognized formats
```

---

### FINDING-08: Delegation Chain Lacks Grantor Authority Validation
**Severity**: HIGH
**Files**: `src/auth/delegation.py` lines 24-102
**Component**: Delegation & Escalation

**Description**: The `create_delegation()` function accepts a `grantor_soulkey` and creates a delegation, but it NEVER verifies that the grantor actually has the permissions they're delegating. The docstring says "The grantor must have the required scope in their own policy" but this is not enforced in code. Any agent can delegate any permission to any other agent.

**Attack Scenario**: Agent "intern-bot" (with minimal read-only permissions) creates a delegation granting Agent "helper-bot" full write access to the vault. Since the grantor's own policy is never checked, the delegation is created successfully, and "helper-bot" gains unauthorized write access.

**Recommended Fix**:
- Before creating a delegation, load the grantor's policy and verify they have a rule granting the delegated `resource:action:scope`.
- Add: `policy = await load_cached_policy(db, grantor_soulkey.tenant_id, grantor_soulkey.persona_id)` and check `find_matching_rule()`.

---

### FINDING-09: PDP Does Not Check Delegation for Access Grants
**Severity**: HIGH
**Files**: `src/auth/pdp.py` lines 281-307
**Component**: PDP / Delegation Integration

**Description**: The PDP's `evaluate()` function checks delegations only within the `conditions` block (line 310-337) via `check_delegation_approval()`. However, when no policy rule matches at step 5 (line 282-307), the PDP immediately denies without checking if an active delegation exists that would grant the access. The delegation system is documented as augmenting policy decisions, but the PDP only checks delegations when a rule already exists but requires approval.

**Attack Scenario**: An orchestrator delegates write access to a specialist agent for an emergency. The specialist's policy has no rule for the resource. The PDP denies the request without ever checking the delegation, making the delegation system non-functional for its primary use case.

**Recommended Fix**:
- After the "no matching rule" check at line 285, add a delegation check:
```python
if not matching_rule:
    delegation = await check_delegation(db, soulkey.tenant_id, soulkey.persona_id, resource, action, scope)
    if delegation:
        # Grant via delegation - issue token with delegation context
        ...
```

---

### FINDING-10: Quarantine State is In-Memory Only (Lost on Restart)
**Severity**: HIGH
**Files**: `src/enforcement/quarantine.py` lines 112-128
**Component**: Agent Behavioral Security

**Description**: All quarantine state - `_quarantine_store`, `_rate_limits`, `_force_reauth_flags`, `_isolation_flags`, `_reset_context_signals`, `_killed_sessions` - is stored in Python `dict`/`set` objects in process memory. A process restart clears all quarantine state. Quarantined agents are silently released.

While the `suspend_key` action persists (it modifies the DB-backed soulkey status), the `rate_limit`, `force_reauth`, `isolate`, and `reset_context` actions are entirely in-memory and lost on restart.

**Attack Scenario**: A malicious agent triggers quarantine, then causes a service restart (e.g., via resource exhaustion or crash-inducing input). After restart, the quarantine state is gone, and the agent can continue malicious activity. The `_quarantine_store` record is also lost, so there's no record the quarantine ever existed.

**Recommended Fix**:
- Persist quarantine records to the `_soulauth_quarantine_policies` table or a new `_soulauth_quarantine_records` table.
- On startup, reload active quarantine states from the database.
- For rate limits and flags, use Redis or a similar shared store.

---

### FINDING-11: No `iss` (Issuer) Validation in Capability Token Verification
**Severity**: HIGH
**Files**: `src/tokens/capability.py` lines 142-160
**Component**: Capability Token System

**Description**: Although the token payload includes `"iss": "soulauth"` at issuance (line 115), the `validate_capability_token()` function requires `"iss"` to be present (line 148) but never validates its value. A token with `"iss": "malicious"` would pass validation. In a federated deployment scenario, this allows tokens from other systems to be accepted.

**Recommended Fix**:
```python
claims = jwt.decode(
    token, public_key, algorithms=["ES256"],
    options={"require": ["exp", "sub", "tid", "scp", "jti", "iss"]},
    issuer="soulauth",  # PyJWT validates this automatically
)
```

---

### FINDING-12: X-Forwarded-For IP Spoofing in Rate Limiters
**Severity**: HIGH
**Files**: `src/middleware/rate_limit.py` lines 184-195, `soulGate/src/proxy/gateway.py` lines 253-260
**Component**: Rate Limiting / SoulGate

**Description**: Both `get_client_ip()` implementations trust the `X-Forwarded-For` header unconditionally. An attacker behind no proxy can set `X-Forwarded-For: 1.2.3.4` to appear as a different IP, bypassing IP-based rate limits. Each request with a different spoofed IP gets its own rate limit bucket.

**Attack Scenario**: An attacker performing trial registration abuse sets a random `X-Forwarded-For` header on each request, making each request appear from a unique IP. The per-IP rate limiter (3/hour, 10/day) is entirely defeated.

**Recommended Fix**:
- Only trust `X-Forwarded-For` when behind a known proxy. Configure a trusted proxy list.
- Use the rightmost-untrusted IP from `X-Forwarded-For` rather than the leftmost.
- Consider requiring the `X-Real-IP` header set by the reverse proxy.

---

### FINDING-13: SoulKey Expiry Suspends Instead of Denying
**Severity**: HIGH
**Files**: `src/auth/soulkey.py` lines 161-172
**Component**: Zero-Trust Identity Model

**Description**: When a soulkey is found to be expired in `check_key_expiry()`, it calls `suspend_soulkey()` which changes status to "suspended". Suspended keys can be reinstated via `reinstate_soulkey()`. This means an expired key can be reinstated without re-validating the expiry date, effectively resurrecting an expired identity.

**Attack Scenario**: An agent's key expires. An admin (or an agent with admin role via FINDING-03) reinstates the key. The key is now active again despite having passed its expiry date. The expiry date is never cleared, so the next `check_key_expiry()` will suspend it again, but there's a window of exploitation.

**Recommended Fix**:
- Expired keys should be revoked (terminal state), not suspended.
- Or: `reinstate_soulkey()` should check `expires_at` and refuse to reinstate if the key is past expiry.

---

### FINDING-14: Policy Git Sync Has No Signature Verification
**Severity**: MEDIUM
**Files**: `src/policy/git_sync.py` lines 135-153, 156-178
**Component**: Policy Decision Point

**Description**: The `pull_policy_repo()` and `async_pull_policy_repo()` functions perform a `git pull` without verifying commit signatures. If the policy git repository is compromised (or if a man-in-the-middle attack occurs during fetch), malicious policies are silently loaded.

**Attack Scenario**: An attacker compromises the git repository (or DNS-hijacks the remote URL) and pushes a policy granting `*:*:*` (full access) to their agent's persona. The auto-sync picks it up within `sync_interval` seconds and loads the malicious policy into the database cache.

**Recommended Fix**:
- Verify GPG signatures on commits using `git log --show-signature`.
- Only accept commits signed by trusted keys.
- Implement a policy diff review step before applying changes.

---

### FINDING-15: Audit Log Has No Integrity Protection
**Severity**: MEDIUM
**Files**: `src/audit/logger.py`, `src/database/models.py` lines 84-107
**Component**: Audit Trail Integrity

**Description**: The audit log is stored as regular database rows with no integrity protection. There is no hash chain, no HMAC, no write-once enforcement. Any database administrator or SQL injection can modify, delete, or fabricate audit entries. The `event_type` is not validated against `VALID_EVENT_TYPES` - arbitrary event types can be logged.

**Attack Scenario**: A malicious agent (or compromised admin) deletes or modifies audit entries to cover their tracks. Since there's no cryptographic chain linking entries, the tampering is undetectable.

**Recommended Fix**:
- Implement a hash chain: each audit entry's hash includes the previous entry's hash.
- Validate `event_type` against `VALID_EVENT_TYPES` before writing.
- Consider append-only table permissions (no UPDATE/DELETE on audit table).
- Forward audit entries to an immutable external store (SIEM) in real-time.

---

### FINDING-16: Detection Engine Exception Swallowing
**Severity**: MEDIUM
**Files**: `src/audit/logger.py` lines 84-112
**Component**: Agent Behavioral Security

**Description**: Both the SIEM forwarding block (lines 74-82) and the Sigma detection block (lines 84-112) have bare `except Exception: pass` handlers. If the Sigma engine crashes, detection silently stops working. If the SIEM forwarder fails, audit events silently stop forwarding. No alerting, no logging, no metric increment.

**Attack Scenario**: A malicious agent crafts events that cause the Sigma engine to crash (e.g., with deeply nested context dicts). The exception is silently swallowed. The agent's subsequent attacks go undetected because the Sigma engine stopped processing events.

**Recommended Fix**:
- Log exceptions at ERROR level instead of silently passing.
- Increment a Prometheus counter for detection/forwarding failures.
- Add a health check that verifies the detection engine is responsive.

---

### FINDING-17: Scope Wildcard Matching Allows Escalation
**Severity**: MEDIUM
**Files**: `src/tokens/capability.py` lines 173-212
**Component**: Capability Token System / PEP

**Description**: The `scope_matches()` function treats `*` at any position as matching "rest of scope". A granted scope of `memory:*` matches `memory:write:admin:secrets`. This is by design, but combined with the PEP's scope derivation (`_derive_scope_from_request`), an agent with `memory:write:*` capability can write to any memory path. The wildcard expansion is unbounded.

More critically, the scope `"*"` (bare wildcard at line 186) matches absolutely everything. If a policy or delegation grants scope `"*"`, it's equivalent to superuser access.

**Attack Scenario**: A policy author grants `"*"` scope intending "all scopes within this resource" but actually grants access to all resources, all actions, all scopes.

**Recommended Fix**:
- Disallow bare `"*"` as a valid scope in policy validation.
- Require scopes to have at least `resource:action:path` format.
- Document wildcard semantics clearly and validate during policy sync.

---

### FINDING-18: Capability Token extra_claims Can Overwrite Core Claims
**Severity**: MEDIUM
**Files**: `src/tokens/capability.py` lines 126-128
**Component**: Capability Token System

**Description**: The `issue_capability_token()` function merges `extra_claims` into the JWT payload using `payload.update(extra_claims)` at line 128. Since `extra_claims` is populated from user context and is ultimately derived from the request's `user_context` dict, an attacker who controls user context can overwrite core JWT claims like `sub`, `tid`, `scp`, `exp`, or `iss`.

**Attack Scenario**: An agent sends an evaluate request with `user_context: {"user_id": "x", "sub": "admin-soulkey-id", "tid": "different-tenant-id", "scp": ["*"]}`. The `extra_claims` from `apply_user_context()` include `uid` and `ucl` but the user_context input is not sanitized for reserved claim names.

**Recommended Fix**:
- Whitelist allowed extra_claims keys: only `uid`, `ucl`, `urt`.
- Or apply extra_claims before setting core claims, so core claims always take precedence.
- Filter out reserved JWT claim names from extra_claims.

```python
RESERVED_CLAIMS = {"iss", "sub", "tid", "pid", "scp", "sid", "jti", "iat", "exp"}
if extra_claims:
    safe_claims = {k: v for k, v in extra_claims.items() if k not in RESERVED_CLAIMS}
    payload.update(safe_claims)
```

---

### FINDING-19: Tenant Context Middleware Does Not Validate Tenant Existence
**Severity**: MEDIUM
**Files**: `src/middleware/tenant.py` lines 80-98
**Component**: Multi-Tenant Isolation

**Description**: The `TenantContextMiddleware` accepts any UUID in the `X-Tenant-ID` header and creates a `TenantContext` with empty slug, name, tier, and `status="active"` without querying the database. This means a non-existent tenant ID is treated as valid, and a suspended tenant's context shows `status="active"`.

**Attack Scenario**: An agent presents a fabricated `X-Tenant-ID` header. The middleware creates a context with `status="active"` for a tenant that doesn't exist or is suspended. If downstream handlers check `request.state.tenant_context.status`, they see "active" for a suspended tenant.

**Recommended Fix**:
- Query the database to validate the tenant exists and is active.
- Cache tenant lookups with a short TTL for performance.
- Return 404 or 403 for invalid/suspended tenant IDs.

---

### FINDING-20: Admin Endpoints Open in PEP Middleware
**Severity**: MEDIUM
**Files**: `src/middleware/pep.py` lines 30-38
**Component**: PEP / Multi-Tenant Isolation

**Description**: The `OPEN_PREFIXES` list includes `"/v1/soulauth/admin/"`, meaning admin endpoints bypass PEP capability token enforcement entirely. While admin endpoints have RBAC via `require_permission()`, they don't require a capability token. This creates an inconsistency - admin operations are not subject to the same zero-trust token model as agent operations.

**Recommended Fix**:
- Consider requiring capability tokens for admin endpoints, or document the design decision clearly.
- Ensure RBAC enforcement is comprehensive (covered in FINDING-03).

---

### FINDING-21: Verification Token Has No Expiry Check
**Severity**: MEDIUM
**Files**: `src/trial/service.py` lines 91-113
**Component**: Trial Registration

**Description**: The `verify_trial()` function checks the token value but does not check if the trial registration has expired. A trial created months ago can still be verified if the token is known, even though `expires_at` was set at creation time (line 75). The status check is for `"pending"` only, but there's no cleanup of old pending trials.

**Recommended Fix**:
- Add `Trial.expires_at > datetime.now(timezone.utc)` to the verify query.
- Run periodic cleanup of expired pending trials.

---

### FINDING-22: Sigma Detection Rules Can Be Modified at Runtime Without Auth
**Severity**: MEDIUM
**Files**: `src/detection/sigma_engine.py` lines 329-341, `src/detection/router.py`
**Component**: Agent Behavioral Security

**Description**: The `SigmaEngine` has `add_rule()` and `remove_rule()` methods that modify detection rules at runtime. If the detection API router exposes these (and it does via the `/v1/detection/` prefix), detection rules can be added/removed. The feature gate puts this behind "pro" tier, but within that tier, there's no granular authorization check on which rules a tenant can modify.

**Attack Scenario**: A malicious Pro-tier tenant disables detection rules that would catch their agent's malicious behavior, then re-enables them after the attack.

**Recommended Fix**:
- Add audit logging for all rule modifications.
- Require `detection:write` RBAC permission for rule mutations.
- Consider making built-in rules immutable (only custom rules can be modified).

---

### FINDING-23: SoulGate Proxy SSRF via Upstream URL Construction
**Severity**: MEDIUM
**Files**: `soulGate/src/proxy/gateway.py` lines 263-268
**Component**: API Gateway Security

**Description**: The `_build_upstream_url()` function concatenates the configured upstream `base_url` with the request `path`. If the `path` contains URL-encoded characters or path traversal sequences (e.g., `../`), it could potentially direct requests to unintended upstream paths. While the upstream URL is configured by an admin, the path comes from the client request.

**Recommended Fix**:
- Normalize and sanitize the `path` parameter before concatenation.
- Strip `..` sequences and URL-decode before building the upstream URL.
- Validate that the final URL still points to the expected upstream host.

---

### FINDING-24: Playbook Webhook Handler Has No URL Validation
**Severity**: LOW
**Files**: `src/detection/playbooks.py` lines 484-502
**Component**: Agent Behavioral Security

**Description**: The `_handle_webhook` action accepts a `url` parameter from playbook configuration. In the current implementation, the handler only logs the URL and returns success without actually making an HTTP call. However, when the TODO "In production, use httpx to POST" is implemented, there's no URL validation. An SSRF vulnerability would allow playbooks to target internal services.

**Recommended Fix**:
- Validate webhook URLs against an allowlist.
- Block private/internal IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, ::1).
- Require HTTPS for webhook URLs.

---

### FINDING-25: No Brute-Force Protection on SoulKey Authentication
**Severity**: LOW
**Files**: `src/auth/soulkey.py` lines 34-51, `src/auth/router.py`
**Component**: Zero-Trust Identity Model

**Description**: The identity resolution endpoint (`/v1/auth/identity`) and PDP evaluation endpoint (`/v1/auth/evaluate`) have no rate limiting on failed soulkey authentication attempts. An attacker can perform unlimited brute-force attempts against the SHA-512 hash lookup. While 256-bit soulkeys are computationally infeasible to brute-force, the lack of rate limiting allows credential stuffing attacks using leaked key material.

**Recommended Fix**:
- Implement per-IP rate limiting on authentication endpoints.
- Track and alert on failed authentication spikes per source IP.
- Consider account lockout after N consecutive failures from the same source.

---

### FINDING-26: Identity Resolution Updates last_used_at Without Status Check
**Severity**: LOW
**Files**: `src/auth/soulkey.py` lines 34-51
**Component**: Zero-Trust Identity Model

**Description**: The `resolve_identity()` function updates `last_used_at` for any soulkey it finds, regardless of status. A suspended or revoked key still gets its `last_used_at` updated, which could confuse forensic analysis (making it look like a revoked key was successfully used recently).

**Recommended Fix**:
- Only update `last_used_at` for active keys.
- Move the update to after the status check in the PDP flow.

---

### FINDING-27: Circuit Breaker Can Be Weaponized (Forced Open)
**Severity**: LOW
**Files**: `soulGate/src/circuit/breaker.py` lines 88-91
**Component**: API Gateway Security

**Description**: The `manual_trip()` method allows any caller to force a circuit breaker open, immediately blocking all requests to that upstream. If the circuit breaker API is exposed without proper authorization, a malicious tenant could DoS other tenants by tripping circuit breakers on shared upstreams.

**Recommended Fix**:
- Ensure circuit breaker management endpoints require enterprise-tier + admin RBAC.
- Add audit logging for manual circuit breaker operations.
- Consider per-tenant circuit breakers instead of per-upstream.

---

### FINDING-28: SDK Client Does Not Verify TLS Certificates by Default
**Severity**: INFO
**Files**: `src/sdk/client.py` lines 62-73
**Component**: SDK Security

**Description**: The `SoulAuthClient` creates an `httpx.AsyncClient` without explicitly configuring TLS certificate verification. While `httpx` defaults to verifying certificates, the client does not enforce HTTPS or provide an option to pin certificates. The default `base_url` is `http://localhost:8000` (plaintext HTTP).

**Recommended Fix**:
- Add a `verify_ssl` parameter defaulting to `True`.
- Warn when `base_url` uses `http://` instead of `https://` in non-localhost scenarios.
- Document TLS requirements for production SDK usage.
- Consider certificate pinning for high-security deployments.

---

### FINDING-29: Soulkey Format Leaks Tenant and Persona Information
**Severity**: INFO
**Files**: `src/auth/soulkey.py` lines 18-26
**Component**: Zero-Trust Identity Model

**Description**: The soulkey format is `sk_agent_{tenant_short}_{persona_slug}_{hex32}`. The tenant short name and persona slug are embedded in the raw key. While the key is hashed before storage, the raw key (which is given to the agent) reveals organizational structure. An agent or interceptor can extract tenant and persona information from the key format.

**Recommended Fix**:
- Consider using opaque key formats that don't embed metadata.
- If the format is kept for usability, document that the key format is not a secret.
- Ensure tenant_short is not sufficient to identify the tenant (use first 3 chars of slug as done currently).

---

## Summary Matrix

| # | Title | Severity | Component |
|---|-------|----------|-----------|
| 01 | Ephemeral JWT Key Generation in Production | CRITICAL | Capability Tokens |
| 02 | Session Validation is a No-Op | CRITICAL | PDP |
| 03 | Admin Endpoints Lack Tenant Scoping | CRITICAL | Multi-Tenant Isolation |
| 04 | In-Memory Token Revocation List | CRITICAL | Capability Tokens |
| 05 | License Validator Accepts Unsigned JWTs | CRITICAL | License Enforcement |
| 06 | Rate Limit Fails Open | HIGH | PDP |
| 07 | Operating Window Check Only Validates Start Time | HIGH | PDP |
| 08 | Delegation Chain Lacks Grantor Authority Validation | HIGH | Delegation |
| 09 | PDP Does Not Check Delegation for Access Grants | HIGH | PDP / Delegation |
| 10 | Quarantine State is In-Memory Only | HIGH | Enforcement |
| 11 | No iss Validation in Token Verification | HIGH | Capability Tokens |
| 12 | X-Forwarded-For IP Spoofing | HIGH | Rate Limiting |
| 13 | SoulKey Expiry Suspends Instead of Revoking | HIGH | Identity |
| 14 | Policy Git Sync Has No Signature Verification | MEDIUM | Policy |
| 15 | Audit Log Has No Integrity Protection | MEDIUM | Audit |
| 16 | Detection Engine Exception Swallowing | MEDIUM | Detection |
| 17 | Scope Wildcard Allows Unrestricted Escalation | MEDIUM | Tokens / PEP |
| 18 | extra_claims Can Overwrite Core JWT Claims | MEDIUM | Capability Tokens |
| 19 | Tenant Context Middleware Skips DB Validation | MEDIUM | Multi-Tenant |
| 20 | Admin Endpoints Bypass PEP | MEDIUM | PEP |
| 21 | Verification Token Has No Expiry Check | MEDIUM | Trial |
| 22 | Sigma Rules Modifiable Without Granular Auth | MEDIUM | Detection |
| 23 | SoulGate Proxy SSRF Risk | MEDIUM | SoulGate |
| 24 | Playbook Webhook No URL Validation | LOW | Detection |
| 25 | No Brute-Force Protection on Auth Endpoints | LOW | Identity |
| 26 | Identity Resolution Updates Timestamps for Inactive Keys | LOW | Identity |
| 27 | Circuit Breaker Can Be Weaponized | LOW | SoulGate |
| 28 | SDK Does Not Enforce TLS | INFO | SDK |
| 29 | SoulKey Format Leaks Metadata | INFO | Identity |

---

## Remediation Priority

### Immediate (before any production deployment):
1. **FINDING-01**: Replace ephemeral key generation with hard failure
2. **FINDING-03**: Add tenant scoping to all admin endpoints
3. **FINDING-04**: Back token revocation with persistent storage
4. **FINDING-05**: Enforce license signature verification

### Sprint 1 (within 2 weeks):
5. **FINDING-02**: Implement real session store
6. **FINDING-08**: Add grantor authority validation to delegation
7. **FINDING-09**: Integrate delegation checks into PDP deny path
8. **FINDING-10**: Persist quarantine state to database
9. **FINDING-11**: Add issuer validation to JWT verification
10. **FINDING-18**: Filter reserved claims from extra_claims

### Sprint 2 (within 4 weeks):
11. **FINDING-06**: Rate limit fail closed
12. **FINDING-07**: Fix operating window end time
13. **FINDING-12**: Trusted proxy configuration
14. **FINDING-13**: Revoke instead of suspend on expiry
15. **FINDING-15**: Audit log integrity (hash chain)
16. **FINDING-19**: Tenant context DB validation

### Hardening (ongoing):
17. All remaining MEDIUM, LOW, and INFO findings

---

*Assessment conducted 2026-03-18. Findings based on static code analysis of the Tiresias platform source code at commit 5948843.*
