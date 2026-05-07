# Tiresias Platform - Application Security Assessment

**Date:** 2026-03-18
**Assessor:** AppSec Architect (automated)
**Scope:** SoulAuth core + SoulGate + SoulWatch + Portal
**Version:** 1.0.0 (pre-GA)

---

## Executive Summary

The Tiresias platform demonstrates strong security fundamentals - ES256 JWTs, SHA-512 key hashing, structured audit logging, and a well-designed zero-trust authorization model. However, this assessment identified **27 findings** across the application layer that must be addressed before GA. The most critical issues involve missing tenant isolation in admin endpoints, a session validation bypass, and the SoulKey being stored in plaintext cookies on the portal.

| Severity | Count |
|----------|-------|
| CRITICAL | 3     |
| HIGH     | 7     |
| MEDIUM   | 9     |
| LOW      | 5     |
| INFO     | 3     |

---

## CRITICAL Findings

### C1. Admin Endpoints Missing Tenant Isolation (IDOR)

**Severity:** CRITICAL
**Files:** `src/admin/router.py` (lines 327-357, 360-483), `src/auth/rbac.py`
**Description:** Admin endpoints like `GET /v1/soulauth/admin/keys/{key_id}` perform RBAC permission checks but never verify that the authenticated SoulKey belongs to the same tenant as the resource being accessed. Any authenticated user with `keys:read` permission can read, suspend, revoke, or rotate SoulKeys belonging to ANY tenant.

**Proof of Concept:**
```bash
# Tenant A's admin key can read/modify Tenant B's keys
curl -H "X-SoulKey: sk_agent_tenA_admin_..." \
  https://tiresias.saluca.com/v1/soulauth/admin/keys/<TENANT_B_KEY_UUID>
```

The `admin_get_key` endpoint (line 332) queries `Soulkey.id == key_id` without filtering by `tenant_id`. Same issue affects `admin_suspend_key`, `admin_reinstate_key`, `admin_revoke_key`, `admin_rotate_key`.

**Recommended Fix:** Add tenant scoping to every admin endpoint. After RBAC check, verify `soulkey.tenant_id == request.state.rbac_soulkey.tenant_id`:
```python
@router.get("/keys/{key_id}", ...)
async def admin_get_key(key_id: uuid.UUID, db: AsyncSession = Depends(get_db), request: Request):
    result = await db.execute(select(Soulkey).where(Soulkey.id == key_id))
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(status_code=404, detail="Soulkey not found")
    # ADD: tenant isolation check
    if key.tenant_id != request.state.rbac_soulkey.tenant_id:
        raise HTTPException(status_code=404, detail="Soulkey not found")
```

---

### C2. Session Validation is a No-Op (Authentication Bypass)

**Severity:** CRITICAL
**File:** `src/auth/pdp.py` (lines 473-477)
**Description:** The `has_active_session()` function is implemented as a stub that accepts ANY non-empty string as a valid session ID. This completely nullifies the `require_active_session` JIT constraint.

```python
async def has_active_session(db: AsyncSession, persona_id: str, session_id: str) -> bool:
    """Check if a persona has an active session."""
    # Simplified implementation - in production would check session store
    # For now, we'll accept any non-empty session_id as valid
    return bool(session_id and session_id.strip())
```

**Proof of Concept:**
```bash
curl -X POST https://tiresias.saluca.com/v1/auth/evaluate \
  -H "X-SoulKey: ..." \
  -d '{"resource":"vault","action":"read","scope":"*","context":{"session_id":"anything-works"}}'
```

An agent with `require_active_session: true` in its policy can bypass this by providing any arbitrary session_id string.

**Recommended Fix:** Implement actual session validation against a session store (Redis/DB table). At minimum, validate session IDs are UUIDs and check a sessions table:
```python
async def has_active_session(db: AsyncSession, persona_id: str, session_id: str) -> bool:
    if not session_id:
        return False
    try:
        uuid.UUID(session_id)
    except ValueError:
        return False
    result = await db.execute(
        select(SoulSession).where(
            SoulSession.persona_id == persona_id,
            SoulSession.session_id == session_id,
            SoulSession.status == "active",
            SoulSession.expires_at > datetime.now(timezone.utc),
        )
    )
    return result.scalar_one_or_none() is not None
```

---

### C3. SoulKey Stored in Plaintext Browser Cookie

**Severity:** CRITICAL
**File:** `portal/src/lib/auth.ts` (lines 45-58)
**Description:** The raw SoulKey (the equivalent of an API key/password) is stored in a browser cookie called `tiresias_session`. While the cookie has `SameSite=Strict`, it is NOT marked `HttpOnly`, making it accessible to any JavaScript running on the page. This means any XSS vulnerability (even in a third-party script) immediately exfiltrates the SoulKey.

```typescript
document.cookie = `${config.sessionCookie}=${encodeURIComponent(session.soulkey)}${base}`;
```

Additionally, the cookie only gets the `Secure` flag conditionally (`window.location.protocol === "https:"`), meaning in development or misconfigured deployments, the key travels over plaintext HTTP.

**Recommended Fix:**
1. Never store the raw SoulKey in a cookie. Use a server-side session (e.g., encrypted session cookie or a session ID that maps to a server-side store).
2. If client-side cookie storage is required, encrypt the SoulKey before storing it and use `HttpOnly; Secure; SameSite=Strict` flags via a server-side `Set-Cookie` header.
3. Consider issuing short-lived portal session tokens instead of storing the long-lived SoulKey.

---

## HIGH Findings

### H1. Rate Limiting Fails Open

**Severity:** HIGH
**File:** `src/auth/pdp.py` (lines 522-523)
**Description:** The `exceeds_rate_limit()` function catches all parsing exceptions and returns `False` (allow), meaning malformed rate limit strings in policy YAML silently disable rate limiting.

```python
except (ValueError, KeyError):
    # If parsing fails, allow the request (fail open for rate limiting)
    return False
```

**Recommended Fix:** Fail closed. If the rate limit string cannot be parsed, deny the request and log a policy error:
```python
except (ValueError, KeyError) as e:
    logger.error("pdp.rate_limit_parse_error", rate_limit_str=rate_limit_str, error=str(e))
    return True  # Fail closed
```

---

### H2. Enforcement Endpoints Have No Authentication

**Severity:** HIGH
**File:** `src/enforcement/router.py` (lines 257-482)
**Description:** The enforcement router endpoints (`/v1/enforcement/*`) have NO authentication dependencies. Unlike the admin router which uses `require_permission()`, quarantine endpoints are completely open. Any unauthenticated user can:
- List quarantined agents (`GET /v1/enforcement/quarantine`)
- Quarantine any agent (`POST /v1/enforcement/quarantine/{soulkey_id}`)
- Release quarantined agents (`POST /v1/enforcement/quarantine/{quarantine_id}/release`)
- CRUD quarantine policies (`GET/POST/PATCH/DELETE /v1/enforcement/policies`)

The feature gate middleware blocks access at the tier level (enterprise only), but this is insufficient - any request from an enterprise-tier tenant is unrestricted.

**Proof of Concept:**
```bash
# No X-SoulKey needed - just need enterprise tier
curl -X POST https://tiresias.saluca.com/v1/enforcement/quarantine/<any-soulkey-uuid> \
  -d '{"actions":["suspend_key","kill_session"],"reason":"attacker"}'
```

**Recommended Fix:** Add `dependencies=[Depends(require_permission("enforcement:*"))]` to all enforcement endpoints, matching the pattern used in admin endpoints.

---

### H3. Detection Engine Endpoints Have No Authentication

**Severity:** HIGH
**File:** `src/detection/router.py` (lines 106-324)
**Description:** Similar to H2, the detection router (`/v1/detection/*`) has no authentication. Any caller who passes the feature gate can:
- Add arbitrary Sigma detection rules
- Delete existing rules
- Modify rule configurations
- Inject malicious playbook YAML

**Recommended Fix:** Add RBAC dependencies to all detection endpoints.

---

### H4. Analytics Endpoints Have No Authentication

**Severity:** HIGH
**File:** `src/analytics/router.py` (lines 29-106)
**Description:** Analytics endpoints (`/v1/analytics/*`) expose agent behavioral data without authentication. An attacker can enumerate anomalies, view agent baselines, and trigger baseline rebuilds.

**Recommended Fix:** Add RBAC dependencies.

---

### H5. Operating Window Check is Incomplete

**Severity:** HIGH
**File:** `src/auth/pdp.py` (lines 48-68)
**Description:** The `_within_operating_window()` function only checks the start time of a window, never the end time. A window of "09:00-17:00" will allow access at any time after 09:00, including 23:00. It also defaults to `True` for any unrecognized format, silently disabling the constraint.

```python
if "-" in window:
    start_end = window.split("-")[0].strip()  # Only parses start, ignores end!
    if ":" in start_end:
        hour, minute = map(int, start_end.split(":"))
        now = datetime.now(timezone.utc)
        start_time = now.replace(hour=hour, minute=minute, ...)
        return now >= start_time  # Never checks end time
```

**Recommended Fix:**
```python
def _within_operating_window(window: str) -> bool:
    if window == "24/7":
        return True
    try:
        if "-" in window:
            parts = window.split("-")
            start_str = parts[0].strip()
            end_str = parts[1].strip().split(" ")[0]  # Strip cron suffix
            start_h, start_m = map(int, start_str.split(":"))
            end_h, end_m = map(int, end_str.split(":"))
            now = datetime.now(timezone.utc)
            current_minutes = now.hour * 60 + now.minute
            start_minutes = start_h * 60 + start_m
            end_minutes = end_h * 60 + end_m
            if start_minutes <= end_minutes:
                return start_minutes <= current_minutes <= end_minutes
            else:  # Overnight window
                return current_minutes >= start_minutes or current_minutes <= end_minutes
    except (ValueError, IndexError):
        pass
    return False  # Fail closed for unrecognized formats
```

---

### H6. X-Forwarded-For IP Spoofing

**Severity:** HIGH
**File:** `src/middleware/rate_limit.py` (lines 184-195)
**Description:** The `get_client_ip()` function trusts the `X-Forwarded-For` header unconditionally. An attacker can bypass trial registration rate limiting by spoofing this header with a different IP on each request.

```python
def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()  # Trusts client-supplied value
```

**Proof of Concept:**
```bash
for i in $(seq 1 100); do
  curl -X POST https://tiresias.saluca.com/v1/trial/register \
    -H "X-Forwarded-For: 10.0.0.$i" \
    -d '{"contact_name":"test","contact_email":"test$i@evil.com",...}'
done
```

**Recommended Fix:** Only trust `X-Forwarded-For` from known reverse proxy IPs. Use a trusted proxy configuration:
```python
TRUSTED_PROXIES = {"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.1"}

def get_client_ip(request: Request) -> str:
    if request.client and is_trusted_proxy(request.client.host):
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
```

---

### H7. Verification Token Not Cleared After Use

**Severity:** HIGH
**File:** `src/trial/service.py` (lines 91-113)
**Description:** After successful email verification in `verify_trial()`, the `verification_token` is not cleared from the database. Combined with the fact that `activate_trial()` only checks `status == "pending"`, there is a race condition window where the verification link can be used to trigger multiple activations concurrently.

Additionally, in the GET verification endpoint (`trial/verify`), verification and activation are separate, non-atomic operations (lines 244-248 in `src/trial/router.py`). Two concurrent requests with the same valid token could both pass `verify_trial()` before either calls `activate_trial()`.

**Recommended Fix:**
1. Clear the verification token after use: `trial.verification_token = None`
2. Change trial status to "verified" in `verify_trial()` and check for "verified" in `activate_trial()` (not "pending")
3. Use database-level locking (`SELECT ... FOR UPDATE`) for atomicity

---

## MEDIUM Findings

### M1. License Validation Skips Signature When No Secret Configured

**Severity:** MEDIUM
**File:** `src/license/validator.py` (lines 71-101)
**Description:** The `_decode_jwt_claims()` function only verifies HMAC signature if `TIRESIAS_LICENSE_SECRET` is set. Without it, anyone can forge a license JWT with arbitrary tier and features - the claims are decoded and trusted without any cryptographic verification.

**Recommended Fix:** Require `TIRESIAS_LICENSE_SECRET` in production. If not set and `license_required=true`, refuse to start.

---

### M2. Ephemeral JWT Keys in Development Mode

**Severity:** MEDIUM
**File:** `src/tokens/capability.py` (lines 50-51)
**Description:** When no JWT key is configured, the system generates an ephemeral EC key. If the server restarts, all previously issued capability tokens become invalid (denial of service). More critically, if `_load_private_key()` and `_load_public_key()` are called separately without the key cache being set, each generates a DIFFERENT key, making validation always fail.

The caching at lines 68-92 mitigates this, but the `_load_public_key()` function (line 54-65) calls `_load_private_key()` which generates a NEW ephemeral key, not the cached one, if the cache is empty when `_load_public_key()` is called first.

**Recommended Fix:** When no keys are configured, generate an ephemeral key ONCE at startup and store it, or refuse to start in enterprise mode without keys.

---

### M3. Token Revocation is In-Memory Only

**Severity:** MEDIUM
**File:** `src/tokens/capability.py` (lines 36, 163-170)
**Description:** The token revocation set is an in-memory Python set. In a multi-instance deployment, revoking a token on one instance has no effect on other instances. Tokens revoked during an emergency continue to be accepted by other pods.

**Recommended Fix:** Back the revocation set with Redis or a database table. Check revocation status from the shared store in `validate_capability_token()`.

---

### M4. Audit Log Not Truly Immutable

**Severity:** MEDIUM
**File:** `src/database/models.py` (lines 84-107)
**Description:** The audit log table has no protections against UPDATE or DELETE operations. While the application code only INSERTs, any SQL access (migration, admin script, SQL injection) can tamper with the audit trail.

**Recommended Fix:**
1. Add a PostgreSQL trigger to prevent UPDATE/DELETE on `_soulauth_audit`
2. Consider implementing cryptographic chaining (hash of previous record) for tamper detection
3. Use database-level RLS to restrict write access to INSERT-only for the application role

---

### M5. HTML Template Injection in Trial Verification Page

**Severity:** MEDIUM
**File:** `src/trial/router.py` (lines 141-216)
**Description:** The `_verify_page_html()` function uses Python f-strings to embed user-controlled data (`tenant_id`, `soulkey_id`, `raw_key`, `expires_at`, `message`) directly into HTML without escaping. While `tenant_id` and `soulkey_id` are UUIDs (safe), the `message` parameter in the error case comes from kwargs and could contain HTML/JavaScript.

The `raw_key` value follows a predictable format (`sk_agent_...`) and is safe, but this is a fragile assumption.

**Recommended Fix:** Use `html.escape()` on all interpolated values:
```python
import html
body = f"<p>{html.escape(kwargs.get('message', ''))}</p>"
```

---

### M6. Email Injection via Contact Name/Company Name

**Severity:** MEDIUM
**File:** `src/trial/email.py` (lines 113-117)
**Description:** The `send_verification_email()` function interpolates `contact_name` and `company_name` directly into the HTML email body using `.format()`. An attacker could inject HTML into the email by registering with a name like `<script>alert(1)</script>` or inject email headers.

**Recommended Fix:** HTML-escape all user-supplied values before interpolation:
```python
from html import escape
html = VERIFICATION_EMAIL_HTML.format(
    contact_name=escape(contact_name),
    company_name=escape(company_name),
    verify_url=verify_url,
)
```

---

### M7. Unbounded Context Dict in Auth Evaluate Request

**Severity:** MEDIUM
**File:** `src/auth/schemas.py` (lines 70-78)
**Description:** The `AuthEvaluateRequest` schema accepts arbitrary `context` and `user_context` dicts with no size or depth limits. An attacker can send massive nested JSON structures that consume memory and processing time (JSON bomb), and these dicts are stored verbatim in the audit log.

**Recommended Fix:** Add Pydantic validators to limit dict size and depth:
```python
context: Optional[dict] = Field(default_factory=dict, max_length=50)

@validator('context')
def validate_context_size(cls, v):
    import json
    if v and len(json.dumps(v)) > 10000:
        raise ValueError("Context too large (max 10KB)")
    return v
```

---

### M8. Policy Sync via Git Pull Exposes to Supply Chain Attack

**Severity:** MEDIUM
**File:** `src/policy/git_sync.py` (lines 135-153, 156-178)
**Description:** The `pull_policy_repo()` and `async_pull_policy_repo()` functions execute `git pull origin main` on the configured repo path. If an attacker compromises the git remote, they can push malicious YAML policies that grant themselves unrestricted access. While YAML is loaded with `safe_load`, the policy content itself controls authorization decisions.

**Recommended Fix:**
1. Verify git commit signatures (GPG) before applying synced policies
2. Implement policy diff review / approval workflow
3. Add policy validation that checks for dangerous patterns (e.g., `actions: ["*"]` with `scopes: ["*"]`)

---

### M9. Portal Middleware Only Checks Cookie Existence, Not Validity

**Severity:** MEDIUM
**File:** `portal/src/middleware.ts` (lines 12-33)
**Description:** The Next.js middleware protects routes by checking `request.cookies.has(SESSION_COOKIE)` -- it only checks if the cookie EXISTS, not if its value is valid. An attacker can set `tiresias_session=anything` and bypass the middleware redirect to access protected routes. The routes still need a valid SoulKey for API calls, but they can render the dashboard UI and potentially access cached data.

**Recommended Fix:** Validate the cookie value in middleware, or better, use encrypted server-side sessions that can be validated without calling the backend API.

---

## LOW Findings

### L1. SoulKey Hash Uses SHA-512 Without Salt

**Severity:** LOW
**File:** `src/auth/soulkey.py` (lines 29-31)
**Description:** SoulKeys are hashed with plain SHA-512 without a per-key salt. While the keys have high entropy (32 bytes of `secrets.token_hex`), the lack of salt means identical keys (if ever reissued) produce identical hashes, and rainbow tables could theoretically be precomputed for the key format.

**Recommended Fix:** Use HMAC-SHA512 with a server-side pepper, or use bcrypt/argon2 for key hashing:
```python
import hmac
SOULKEY_PEPPER = os.environ.get("SOULKEY_PEPPER", "default-change-me")

def hash_soulkey(raw_key: str) -> str:
    return hmac.new(SOULKEY_PEPPER.encode(), raw_key.encode(), hashlib.sha512).hexdigest()
```

---

### L2. Default Database Credentials in Settings

**Severity:** LOW
**File:** `config/settings.py` (lines 34-40)
**Description:** The default `database_url` contains hardcoded credentials: `postgresql+asyncpg://postgres:postgres@localhost:5432/soulauth`. If the .env file is not properly configured, the application connects with default credentials.

**Recommended Fix:** Remove default credentials. Require explicit configuration:
```python
database_url: str = Field(..., description="Required: Async database connection URL")
```

---

### L3. In-Memory Rate Limiter Resets on Restart

**Severity:** LOW
**File:** `src/middleware/rate_limit.py` (lines 87-176)
**Description:** The trial registration rate limiter uses an in-memory dict. On application restart or across multiple instances, rate limits are not enforced. An attacker can bypass limits by waiting for a restart.

**Recommended Fix:** Use Redis or a database-backed rate limiter for persistence across restarts and instances.

---

### L4. Metrics Endpoint Exposed Without Authentication

**Severity:** LOW
**File:** `src/monitoring/metrics.py` (lines 239-261), `src/middleware/pep.py` (line 36)
**Description:** The `/metrics` endpoint exposes Prometheus metrics (tenant counts, soulkey counts, request rates, error rates) without any authentication. This leaks operational intelligence.

**Recommended Fix:** Either require authentication for `/metrics` or restrict access via network policy (only allow Prometheus scraper IPs).

---

### L5. Checkout Endpoint Trusts Client-Supplied tenant_id

**Severity:** LOW
**File:** `portal/src/app/api/billing/checkout/route.ts` (lines 78-141)
**Description:** The Stripe checkout endpoint accepts `tenant_id` and `soulkey` from the client request body without verifying that the soulkey belongs to the claimed tenant. An attacker could initiate a checkout for a different tenant, potentially upgrading their tier.

**Recommended Fix:** Validate the soulkey against the SoulAuth API before creating the Stripe session. Verify the soulkey's tenant_id matches the claimed tenant_id.

---

## INFO Findings

### I1. OpenAPI/Docs Exposed in Production

**Severity:** INFO
**Files:** `src/main.py`, `src/middleware/pep.py` (line 35)
**Description:** The `/docs`, `/redoc`, and `/openapi.json` endpoints are in the OPEN_PREFIXES list and are accessible without authentication. This exposes the full API schema to potential attackers.

**Recommended Fix:** Disable docs endpoints in production:
```python
app = FastAPI(
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    openapi_url="/openapi.json" if settings.debug else None,
)
```

---

### I2. Verbose Error Messages in Auth Denial Reasons

**Severity:** INFO
**File:** `src/auth/pdp.py` (various lines)
**Description:** PDP denial reasons expose internal details: `"no policy found for persona"`, `"node nexus-01 not in allowed_nodes"`, `"soulkey status: suspended"`. These help attackers understand the system's internal state and policy structure.

**Recommended Fix:** Return generic denial messages to the client; log detailed reasons server-side only. Use the `audit_id` for correlation.

---

### I3. YAML Policy Loading Uses safe_load (Good) but No Schema Validation

**Severity:** INFO
**File:** `src/policy/loader.py` (line 112)
**Description:** YAML is loaded with `yaml.safe_load()`, which prevents arbitrary code execution. However, there is no JSON Schema or structural validation of the policy content beyond basic field presence checks. Malformed policies could cause runtime errors or unexpected authorization behavior.

**Recommended Fix:** Define a JSON Schema or Pydantic model for policy YAML and validate on load.

---

## Summary of Required Actions (Priority Order)

### Before GA (Must Fix)

1. **C1** - Add tenant isolation to ALL admin endpoints (IDOR)
2. **C2** - Implement real session validation or remove `require_active_session` constraint
3. **C3** - Stop storing raw SoulKey in browser cookie; use encrypted server-side sessions
4. **H1** - Change rate limit parsing to fail closed
5. **H2** - Add RBAC to enforcement endpoints
6. **H3** - Add RBAC to detection endpoints
7. **H4** - Add RBAC to analytics endpoints
8. **H5** - Fix operating window to check end time; fail closed on parse error
9. **H6** - Only trust X-Forwarded-For from known proxies
10. **H7** - Clear verification token after use; make verify+activate atomic

### Before Production Scale

11. **M1** - Require license secret in production
12. **M2** - Require JWT keys in production; no ephemeral fallback
13. **M3** - Back token revocation with Redis/DB
14. **M4** - Add immutability protections to audit log
15. **M5** - HTML-escape all template interpolations
16. **M6** - HTML-escape email template values
17. **M7** - Limit context dict size
18. **M8** - Add git commit signature verification for policy sync
19. **M9** - Validate session cookie value in portal middleware

### Hardening

20. **L1** - Add salt/pepper to SoulKey hashing
21. **L2** - Remove default database credentials
22. **L3** - Use Redis-backed rate limiter
23. **L4** - Restrict metrics endpoint access
24. **L5** - Validate soulkey ownership in checkout

---

*Assessment generated 2026-03-18. Next review recommended after fixes are applied.*
