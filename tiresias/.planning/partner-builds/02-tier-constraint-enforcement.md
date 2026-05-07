# 02: Tier Constraint Enforcement

**Status:** To Build  
**Priority:** P0 (Security Critical)  
**Author:** Saluca Engineering  
**Date:** 2026-04-06  
**Depends On:** Partner Program Spec v1.0, existing `src/tier.py`, `src/mssp/isolation.py`

---

## 1. Threat Model

### 1.1 What Happens Without Enforcement

If tier constraints are not enforced, the following scenarios become exploitable:

**Privilege Escalation:** A partner with `mssp` tier creates a sub-tenant with tier `mssp` or `saas`. That sub-tenant now has capabilities that exceed its intended scope: it can create its own sub-tenants, access SaaS management APIs, or bypass billing entirely. The `TIER_ALLOWED_CHILDREN` map in `src/tier.py` already restricts `mssp` to `{enterprise, pro, community}`, but a direct API caller crafting a request body with `tier: "mssp"` could bypass UI-only validation.

**Billing Bypass:** An MSSP partner creates a sub-tenant at tier `mssp`, which carries a different Stripe pricing model (flat MSSP base fee instead of per-seat subscription). The metered billing system in `src/saas/billing.py` would count this as a peer MSSP rather than a billable child, causing revenue leakage.

**Hierarchy Violation:** A sub-tenant at depth 1 under a partner creates its own child at depth 2. The current `MAX_HIERARCHY_DEPTH = 3` in `src/mssp/isolation.py` allows this, but partner sub-tenants must be flat (max 1 level below partner). Unchecked nesting breaks the partner billing model: `_process_partner_commission` in `src/saas/billing.py` only walks one level of `parent_tenant_id`, so deeply nested tenants would escape commission tracking.

**Feature Gate Bypass:** If a sub-tenant is assigned `mssp` or `saas` tier, it gains access to features gated at those levels in `src/middleware/feature_gate.py` (e.g., `saas_management`, `multi_tenant`). This grants unauthorized access to cross-tenant views, policy push, and SIEM aggregation.

### 1.2 Attack Vectors

| # | Vector | Entry Point | Impact |
|---|--------|-------------|--------|
| AV-1 | Direct API call: `POST /v1/mssp/tenants` with `tier: "mssp"` | `src/mssp/router.py:165` | Sub-tenant gets MSSP capabilities |
| AV-2 | Direct API call: `POST /v1/mssp/tenants` with `tier: "saas"` | `src/mssp/router.py:165` | Sub-tenant gets SaaS management access |
| AV-3 | Sub-tenant of partner calls `POST /v1/mssp/tenants` to nest deeper | `src/mssp/router.py:165` | Depth > 1 under partner; commission tracking breaks |
| AV-4 | Stripe subscription update event resolves to `mssp` tier for a sub-tenant | `src/saas/billing.py:348` | Partner sub-tenant silently promoted to MSSP via webhook |
| AV-5 | Self-service upgrade call: `upgrade_tenant_tier(tenant, "mssp")` | `src/billing/upgrade.py:34` | Sub-tenant upgrades past allowed ceiling |
| AV-6 | Future `POST /v1/partners/tenants` endpoint bypasses existing checks | New partner router | New code path lacks enforcement |

---

## 2. Implementation Approach: Middleware Guard

### 2.1 Design Principles

The tier guard is implemented as a **FastAPI dependency/decorator**, not ASGI middleware, because:

1. It needs access to the request body (tier value) which ASGI middleware cannot read without consuming the stream.
2. It needs async database access to look up the caller's tenant and hierarchy position.
3. It must be composable: applied per-route without modifying handler signatures.

The guard is a **standalone module** (`src/partner/tier_guard.py`) that exports a FastAPI `Depends()` callable. Existing endpoint handlers gain enforcement by adding a single dependency injection, with zero changes to their business logic.

### 2.2 Guard Flow

```
Request arrives at guarded endpoint
    |
    v
tier_guard dependency fires BEFORE handler
    |
    +-- Extract caller tenant_id from X-Tenant-ID header
    +-- Look up SoulTenant to get caller tier, parent_tenant_id, hierarchy_depth
    +-- If caller is a partner (has SoulPartner record):
    |     +-- Extract requested tier from request body
    |     +-- Validate: requested tier in PARTNER_ALLOWED_CHILD_TIERS
    |     +-- Validate: hierarchy_depth of new child <= partner_depth + 1
    |     +-- On violation: return 403, log to audit
    +-- If caller is a sub-tenant of a partner (parent_tenant_id is not null):
    |     +-- Block any tenant creation (sub-tenants cannot nest)
    |     +-- On upgrade: block target tiers mssp/saas
    |     +-- On violation: return 403, log to audit
    +-- Pass: handler executes normally
```

### 2.3 Error Response Format

All constraint violations return HTTP 403 with a consistent JSON body:

```json
{
    "detail": "Tier constraint violation: <specific message>",
    "error_code": "TIER_CONSTRAINT_VIOLATION",
    "constraint": "<constraint_id>",
    "context": {
        "caller_tenant_id": "<uuid>",
        "caller_tier": "<tier>",
        "requested_tier": "<tier>",
        "hierarchy_depth": <int>,
        "partner_id": "<uuid or null>"
    }
}
```

HTTP 403 (not 422) is used because this is an authorization boundary, not a validation error. The caller is authenticated but not authorized for this operation.

### 2.4 Audit Log Entry Format

Every constraint violation is written to `_soulauth_audit` using the existing `AuditLog` model:

```python
AuditLog(
    tenant_id=caller_tenant_id,
    event_type="tier_guard.constraint_violation",
    persona_id=persona_from_soulkey_or_session,
    resource="tenant",
    action=action,           # "create" | "upgrade" | "webhook_tier_change"
    scope="partner",
    decision="deny",
    reason=f"Blocked: {constraint_id} - {detail_message}",
    context={
        "constraint_id": constraint_id,
        "requested_tier": requested_tier,
        "caller_tier": caller_tier,
        "hierarchy_depth": hierarchy_depth,
        "partner_id": str(partner_id),
        "endpoint": request_path,
        "method": request_method,
        "ip_address": client_ip,
    },
)
```

---

## 3. Six Enforcement Points

### Point 1: `POST /v1/mssp/tenants` (MSSP tenant provisioning)

**File:** `src/mssp/router.py`, function `provision_child_tenant` (line 165)

**Where guard attaches:** Add `Depends(require_tier_guard)` to the endpoint's dependency list.

```python
@router.post(
    "/tenants",
    ...
    dependencies=[
        Depends(require_permission("multi_tenant")),
        Depends(require_tier_guard("create")),     # <-- NEW
    ],
)
```

**What it checks:**
- Caller tenant exists and has tier `mssp` or `saas`
- `body.tier` is in `PARTNER_ALLOWED_CHILD_TIERS` = `{community, starter, pro, enterprise}`
- Caller's `hierarchy_depth + 1 <= MAX_PARTNER_CHILD_DEPTH` (1 level below partner)
- If caller is itself a sub-tenant (`parent_tenant_id is not None`), reject entirely

**What it blocks:**
- `body.tier` = `mssp` -> 403
- `body.tier` = `saas` -> 403
- Caller is a sub-tenant trying to create children -> 403
- New child would exceed depth 1 below the nearest partner root -> 403

**Error response:**
```json
{
    "detail": "Tier constraint violation: MSSP partners cannot provision sub-tenants with tier 'mssp'. Allowed tiers: community, enterprise, pro, starter.",
    "error_code": "TIER_CONSTRAINT_VIOLATION",
    "constraint": "TC-01-BLOCKED_CHILD_TIER"
}
```

**Audit log entry:**
```
event_type: tier_guard.constraint_violation
action: create
reason: "Blocked: TC-01-BLOCKED_CHILD_TIER - Attempted to create sub-tenant with tier 'mssp'"
```

---

### Point 2: `POST /v1/partners/tenants` (new partner-specific provisioning)

**File:** `src/partner/router.py` (new endpoint to be added, or guarded when added)

**Where guard attaches:** Same `Depends(require_tier_guard("create"))` dependency. When this endpoint is built, the guard is included from day one.

**What it checks:** Identical to Point 1. The guard is endpoint-agnostic; it reads the request body for `tier` and validates against the caller's partner context.

**What it blocks:** Same as Point 1.

**Error response:**
```json
{
    "detail": "Tier constraint violation: Partner sub-tenants are limited to tiers: community, enterprise, pro, starter.",
    "error_code": "TIER_CONSTRAINT_VIOLATION",
    "constraint": "TC-02-PARTNER_PROVISION_BLOCKED_TIER"
}
```

**Audit log entry:**
```
event_type: tier_guard.constraint_violation
action: create
reason: "Blocked: TC-02-PARTNER_PROVISION_BLOCKED_TIER - Partner tenant provisioning attempted with tier 'saas'"
```

---

### Point 3: Depth enforcement in `src/mssp/isolation.py`

**File:** `src/mssp/isolation.py`, function `validate_partner_child_creation` (line 171, already exists as a stub)

**Where guard attaches:** The tier guard calls `validate_partner_child_creation` internally when it detects the caller is a partner or a partner sub-tenant. This is invoked from within `require_tier_guard`, not as a separate dependency.

**What it checks:**
- Parent tenant's `hierarchy_depth`: if >= 1 under a partner root, reject child creation
- Walks `parent_tenant_id` chain to find the nearest partner root (tenant with `SoulPartner` record)
- Computes distance from partner root to caller; if distance >= 1, caller cannot create children

**What it blocks:**
- An enterprise sub-tenant (depth 1 under MSSP partner) creating its own children
- Any tenant at depth >= 2 in the partner hierarchy creating children

**Error response:**
```json
{
    "detail": "Tier constraint violation: Sub-tenants of partner hierarchies cannot create their own child tenants. Maximum nesting depth is 1 level below the partner.",
    "error_code": "TIER_CONSTRAINT_VIOLATION",
    "constraint": "TC-03-DEPTH_EXCEEDED"
}
```

**Audit log entry:**
```
event_type: tier_guard.constraint_violation
action: create
reason: "Blocked: TC-03-DEPTH_EXCEEDED - Tenant at depth 2 attempted to create child (max allowed: 1 below partner)"
```

---

### Point 4: `src/billing/upgrade.py` (tier upgrade path)

**File:** `src/billing/upgrade.py`, function `upgrade_tenant_tier` (line 34)

**Where guard attaches:** The guard is applied as a pre-check callable invoked from the billing router that calls `upgrade_tenant_tier`. Alternatively, a `Depends(require_tier_upgrade_guard)` is added to the billing upgrade endpoint in `src/billing/router.py`.

**What it checks:**
- If `tenant.parent_tenant_id is not None` (tenant is a sub-tenant): `new_tier` must not be in `{mssp, saas}`
- Existing check at line 55 of `upgrade.py` already handles this; the guard adds the audit trail and consistent error format

**What it blocks:**
- Sub-tenant upgrading from `enterprise` to `mssp`
- Sub-tenant upgrading from any tier to `saas`

**Error response:**
```json
{
    "detail": "Tier constraint violation: Partner sub-tenants cannot be upgraded to 'mssp'. Maximum allowed tier for sub-tenants is 'enterprise'.",
    "error_code": "TIER_CONSTRAINT_VIOLATION",
    "constraint": "TC-04-UPGRADE_BLOCKED"
}
```

**Audit log entry:**
```
event_type: tier_guard.constraint_violation
action: upgrade
reason: "Blocked: TC-04-UPGRADE_BLOCKED - Sub-tenant attempted upgrade to 'mssp'"
```

---

### Point 5: Portal UI tier selector (client-side, cosmetic)

**File:** Portal Next.js component (new; path TBD under `portal/src/components/partner/`)

**Where guard attaches:** This is not a server-side guard. The portal's tenant creation form filters the tier dropdown based on the authenticated user's partner context.

**What it checks:**
- If user session contains `partner: true` or tenant tier is `mssp`: the tier selector only shows `community, starter, pro, enterprise`
- The `mssp` and `saas` options are removed from the `<select>` / radio group

**What it blocks:** Nothing server-side. This is defense-in-depth UX only. All real enforcement is Points 1 through 4 and 6.

**Error response:** N/A (no server response; the UI simply does not render disallowed options).

**Audit log entry:** N/A (client-side only).

---

### Point 6: Stripe webhook handler

**File:** `src/saas/billing.py`, function `handle_stripe_event` (line 348)

**Where guard attaches:** A post-resolution check is added inside `handle_stripe_event`. After the tenant is resolved and the new tier is extracted from the Stripe event, but BEFORE the tier is written to the database, the guard validates:

```python
# Inside handle_stripe_event, after new_tier is resolved:
from src.partner.tier_guard import validate_tier_for_subtenant

if tenant.parent_tenant_id and new_tier:
    violation = validate_tier_for_subtenant(tenant, new_tier)
    if violation:
        # Log alert, do NOT update tier, return rejection
        ...
```

This is the one point where the guard cannot be a pure dependency injection (webhooks are not user-initiated requests with headers). Instead, the guard exports a standalone validation function that the webhook handler calls inline.

**What it checks:**
- Tenant resolved from the Stripe event has `parent_tenant_id` (is a sub-tenant)
- Resolved `new_tier` from the Stripe subscription metadata is in `{mssp, saas}`

**What it blocks:**
- A Stripe subscription update that would set a sub-tenant's tier to `mssp` or `saas`
- This covers the case where someone manually changes the Stripe subscription metadata to `tiresias_tier: mssp`

**Error response:** Webhook returns 200 to Stripe (to prevent retries) but does NOT apply the tier change. The violation is logged as a critical alert.

**Audit log entry:**
```
event_type: tier_guard.webhook_constraint_violation
action: webhook_tier_change
reason: "Blocked: TC-06-WEBHOOK_TIER_BLOCKED - Stripe event attempted to set sub-tenant tier to 'mssp'"
context: {
    "stripe_event_type": "customer.subscription.updated",
    "stripe_customer_id": "cus_xxx",
    "attempted_tier": "mssp",
    "tenant_id": "<uuid>",
    "parent_tenant_id": "<uuid>"
}
```

---

## 4. New Files

### 4.1 `src/partner/tier_guard.py`

The middleware/decorator module. Exports:

```python
# --- Public API ---

def require_tier_guard(action: str = "create") -> Callable:
    """
    FastAPI dependency that enforces partner tier constraints.
    
    Usage:
        @router.post("/tenants", dependencies=[Depends(require_tier_guard("create"))])
    
    Args:
        action: "create" for tenant provisioning, "upgrade" for tier changes.
    
    Raises:
        HTTPException(403) on constraint violation.
    """

def require_tier_upgrade_guard() -> Callable:
    """
    FastAPI dependency for tier upgrade endpoints.
    Checks that the target tenant is not a sub-tenant upgrading to mssp/saas.
    """

async def validate_tier_for_subtenant(
    tenant: SoulTenant,
    new_tier: str,
) -> Optional[dict]:
    """
    Standalone validation for non-request contexts (e.g., Stripe webhooks).
    Returns None if allowed, or a dict with violation details if blocked.
    """

async def _log_tier_violation(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    constraint_id: str,
    action: str,
    detail: str,
    context: dict,
) -> None:
    """Write a tier constraint violation to the audit log."""
```

Internal helpers:

```python
async def _resolve_partner_context(
    db: AsyncSession,
    tenant_id: uuid.UUID,
) -> PartnerContext:
    """
    Look up whether a tenant is a partner, a sub-tenant of a partner,
    or neither. Returns a PartnerContext dataclass.
    """

@dataclass
class PartnerContext:
    is_partner: bool               # Has SoulPartner record
    is_subtenant: bool             # Has parent_tenant_id
    partner_id: Optional[uuid.UUID]
    partner_root_tenant_id: Optional[uuid.UUID]
    depth_below_partner: int       # 0 = is the partner, 1 = direct child, etc.
    caller_tier: str
    caller_hierarchy_depth: int
```

### 4.2 `src/partner/tier_constants.py`

Canonical constants for tier constraint enforcement. Imported by `tier_guard.py` and tests.

```python
"""
Partner tier constraint constants.
Single source of truth for what partners can and cannot do.
"""

# Tiers that partners can assign to sub-tenants
PARTNER_ALLOWED_CHILD_TIERS: frozenset[str] = frozenset({
    "community", "starter", "pro", "enterprise"
})

# Tiers that are NEVER allowed for sub-tenants (hard block)
PARTNER_BLOCKED_TIERS: frozenset[str] = frozenset({
    "mssp", "saas"
})

# Maximum hierarchy depth below a partner root tenant
# 1 = flat children only (partner -> child, no deeper nesting)
MAX_PARTNER_CHILD_DEPTH: int = 1

# Constraint ID constants for audit trail
TC_01_BLOCKED_CHILD_TIER = "TC-01-BLOCKED_CHILD_TIER"
TC_02_PARTNER_PROVISION_BLOCKED = "TC-02-PARTNER_PROVISION_BLOCKED_TIER"
TC_03_DEPTH_EXCEEDED = "TC-03-DEPTH_EXCEEDED"
TC_04_UPGRADE_BLOCKED = "TC-04-UPGRADE_BLOCKED"
TC_05_UI_FILTER = "TC-05-UI_FILTER"  # cosmetic only
TC_06_WEBHOOK_TIER_BLOCKED = "TC-06-WEBHOOK_TIER_BLOCKED"

# Event types for audit log
AUDIT_EVENT_CONSTRAINT_VIOLATION = "tier_guard.constraint_violation"
AUDIT_EVENT_WEBHOOK_VIOLATION = "tier_guard.webhook_constraint_violation"
```

### 4.3 `tests/test_tier_guard.py`

Full test suite. See Section 6 for the testing matrix.

---

## 5. Database Requirements

### 5.1 Existing Schema (No New Migrations)

The guard relies entirely on existing columns:

| Table | Column | Usage |
|-------|--------|-------|
| `_soul_tenants` | `tier` | Caller's current tier |
| `_soul_tenants` | `parent_tenant_id` | Determines if tenant is a sub-tenant |
| `_soul_tenants` | `hierarchy_depth` | Depth check for nesting constraints |
| `_soul_partners` | `tenant_id` | Links partner record to tenant |
| `_soul_partners` | `status` | Only active partners can provision |
| `_soulauth_audit` | all columns | Constraint violation logging |

### 5.2 Audit Log Entries

Constraint violations are logged using the existing `AuditLog` model. No new table is required. The `event_type` field distinguishes tier guard entries:

- `tier_guard.constraint_violation` for request-time blocks
- `tier_guard.webhook_constraint_violation` for Stripe webhook blocks

The `context` JSON column stores structured violation details (see Section 2.4).

### 5.3 Future Consideration

If violation volume warrants a dedicated view, a Postgres materialized view can be created:

```sql
CREATE MATERIALIZED VIEW partner_tier_violations AS
SELECT id, tenant_id, timestamp, reason, context
FROM _soulauth_audit
WHERE event_type LIKE 'tier_guard.%'
ORDER BY timestamp DESC;
```

This is not required for initial implementation.

---

## 6. Testing Matrix

### 6.1 Tenant Creation Tests

| # | Caller Type | Caller Tier | Requested Child Tier | Hierarchy Depth | Expected | Constraint |
|---|-------------|-------------|---------------------|-----------------|----------|------------|
| 1 | MSSP Partner | mssp | enterprise | 0 | ALLOW | -- |
| 2 | MSSP Partner | mssp | pro | 0 | ALLOW | -- |
| 3 | MSSP Partner | mssp | starter | 0 | ALLOW | -- |
| 4 | MSSP Partner | mssp | community | 0 | ALLOW | -- |
| 5 | MSSP Partner | mssp | mssp | 0 | DENY 403 | TC-01 |
| 6 | MSSP Partner | mssp | saas | 0 | DENY 403 | TC-01 |
| 7 | Enterprise sub-tenant (under MSSP) | enterprise | pro | 1 | DENY 403 | TC-03 |
| 8 | Enterprise sub-tenant (under MSSP) | enterprise | community | 1 | DENY 403 | TC-03 |
| 9 | Pro sub-tenant (under MSSP) | pro | community | 1 | DENY 403 | TC-03 |
| 10 | SaaS operator (not partner) | saas | mssp | 0 | ALLOW | -- (SaaS can create mssp per `TIER_ALLOWED_CHILDREN`) |
| 11 | Direct enterprise (no parent) | enterprise | pro | 0 | ALLOW | -- (not partner-managed) |

### 6.2 Tier Upgrade Tests

| # | Tenant Type | Current Tier | Target Tier | Has parent_tenant_id | Expected | Constraint |
|---|-------------|-------------|-------------|---------------------|----------|------------|
| 12 | Partner sub-tenant | pro | enterprise | Yes | ALLOW | -- |
| 13 | Partner sub-tenant | enterprise | mssp | Yes | DENY 403 | TC-04 |
| 14 | Partner sub-tenant | starter | saas | Yes | DENY 403 | TC-04 |
| 15 | Direct tenant (no parent) | pro | enterprise | No | ALLOW | -- |
| 16 | Direct tenant (no parent) | enterprise | mssp | No | ALLOW | -- |

### 6.3 Stripe Webhook Tests

| # | Scenario | Tenant Has Parent | Resolved Tier | Expected | Constraint |
|---|----------|-------------------|---------------|----------|------------|
| 17 | Subscription update, sub-tenant, tier=enterprise | Yes | enterprise | ALLOW | -- |
| 18 | Subscription update, sub-tenant, tier=mssp | Yes | mssp | DENY (silent) | TC-06 |
| 19 | Subscription update, sub-tenant, tier=saas | Yes | saas | DENY (silent) | TC-06 |
| 20 | Subscription update, direct tenant, tier=mssp | No | mssp | ALLOW | -- |

### 6.4 Edge Case Tests

| # | Scenario | Expected | Notes |
|---|----------|----------|-------|
| 21 | Caller tenant does not exist in DB | 404 (existing behavior) | Guard defers to existing `_require_mssp_tier` |
| 22 | Request body missing `tier` field | 422 (Pydantic validation) | Guard not reached; Pydantic rejects first |
| 23 | Caller is a partner but `status != "active"` | ALLOW creation | Guard checks tier, not partner status (partner status is a business rule, not a security constraint) |
| 24 | Race condition: two concurrent create requests that would exceed max_children | One succeeds, one gets 422 | Existing `max_children` check handles this |
| 25 | Partner with `hierarchy_depth = 0` creates child (depth 1) | ALLOW | Normal operation |

**Total test cases: 25 (minimum 15 required, exceeds requirement)**

---

## 7. Integration Plan

### 7.1 Mounting the Guard on Existing Endpoints

The guard is applied by adding a single `Depends()` entry to existing endpoint decorators. No handler code changes.

**Step 1:** Add dependency to `POST /v1/mssp/tenants` in `src/mssp/router.py`:

```python
# Before:
@router.post("/tenants", ..., dependencies=[Depends(require_permission("multi_tenant"))])

# After:
from src.partner.tier_guard import require_tier_guard

@router.post("/tenants", ..., dependencies=[
    Depends(require_permission("multi_tenant")),
    Depends(require_tier_guard("create")),
])
```

**Step 2:** Add inline validation call in `src/saas/billing.py` `handle_stripe_event`:

```python
# After new_tier is resolved and tenant is found:
from src.partner.tier_guard import validate_tier_for_subtenant

if tenant and tenant.parent_tenant_id and new_tier:
    violation = validate_tier_for_subtenant(tenant, new_tier)
    if violation:
        logger.critical("tier_guard.webhook_blocked", **violation)
        # Do NOT apply tier change; return success to Stripe
        return {"action": "tier_change_blocked", "violation": violation}
```

**Step 3:** The existing check in `src/billing/upgrade.py` (line 55) already blocks sub-tenant upgrades to mssp/saas. The guard wraps this with audit logging. The `require_tier_upgrade_guard` dependency is added to the billing upgrade endpoint in `src/billing/router.py`.

**Step 4:** When `POST /v1/partners/tenants` is built, it includes `Depends(require_tier_guard("create"))` from day one.

### 7.2 Dependency Loading Order

The guard depends on:
- `src/database/connection.get_db` (async session)
- `src/database/models.SoulTenant`, `SoulPartner`, `AuditLog`
- `src/partner/tier_constants` (new, no external deps)

No circular import risk: the guard imports from `database` and `partner`, which do not import from the guard.

### 7.3 Rollback Plan

**Risk level:** Low. The guard is additive (adds a dependency) and defensive (only rejects requests that were not previously validated consistently).

**Rollback steps:**

1. Remove the `Depends(require_tier_guard(...))` entries from endpoint decorators (2 lines in `src/mssp/router.py`, 1 line in `src/billing/router.py`).
2. Remove the `validate_tier_for_subtenant` call from `src/saas/billing.py` (3 lines).
3. The `src/partner/tier_guard.py`, `src/partner/tier_constants.py`, and `tests/test_tier_guard.py` files can remain in the tree without effect (dead code).
4. Deploy. No database migration to reverse.

**Canary deployment:** The guard can be feature-flagged via an environment variable:

```python
TIER_GUARD_ENABLED = os.getenv("TIER_GUARD_ENABLED", "true").lower() == "true"
```

If disabled, `require_tier_guard` becomes a no-op dependency that passes all requests through. This allows deploying the code to production in monitor-only mode before enforcing.

---

## 8. Estimated Effort

### 8.1 Implementation

| Task | Estimated Hours | Dependency |
|------|----------------|------------|
| `src/partner/tier_constants.py` | 0.5 | None |
| `src/partner/tier_guard.py` (guard + audit logging) | 4 | tier_constants.py |
| Integration: `src/mssp/router.py` dependency addition | 0.5 | tier_guard.py |
| Integration: `src/saas/billing.py` webhook check | 1 | tier_guard.py |
| Integration: `src/billing/router.py` upgrade guard | 0.5 | tier_guard.py |
| `tests/test_tier_guard.py` (25 test cases) | 4 | tier_guard.py |
| Manual QA + edge case verification | 2 | All above |
| **Total** | **12.5 hours** | |

### 8.2 Dependencies

- `SoulTenant.parent_tenant_id` and `hierarchy_depth` columns must exist in the ORM model. Per the Partner Program Spec, these are noted as a key gap. However, they already exist in the current `src/database/models.py` (lines 39-42) and are referenced by `src/mssp/isolation.py` and `src/mssp/router.py`. Verified: no migration needed.
- The `src/tier.py` module must be importable (it is; exists today).

### 8.3 Risk Factors

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Guard blocks legitimate SaaS operator from creating mssp children | Low | Guard checks for SoulPartner record; SaaS operators without partner records are not affected. `TIER_ALLOWED_CHILDREN["saas"]` includes `mssp`. |
| Performance: additional DB query per guarded request | Low | One `SELECT` for partner context lookup. Cached in request state if multiple guards fire. |
| False positive in webhook guard blocking legitimate Stripe events | Low | Guard only fires when `parent_tenant_id is not None` AND `new_tier in BLOCKED_TIERS`. Direct tenants are never blocked. |
| Circular import from `tier_guard` importing models | None | Import path is one-directional: `tier_guard -> models`, `tier_guard -> tier_constants`. |
