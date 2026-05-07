# Tiresias Multi-Level Tenant Hierarchy -- Implementation Plan

**Date:** 2026-04-02
**Status:** Draft
**Author:** Alfred (Claude Code session)

---

## 1. Current State Assessment

### What exists today

| Component | File | Status |
|-----------|------|--------|
| `SoulTenant` model with `parent_tenant_id` + `hierarchy_depth` | `src/database/models.py:39-42` | Deployed |
| Alembic migration 0002 adding both columns + CHECK constraint | `alembic/versions/0002_mssp_tenant_hierarchy.py` | Applied in prod |
| MSSP child tenant creation (POST `/v1/mssp/tenants`) | `src/mssp/router.py:158-240` | Working |
| Hierarchy traversal (BFS subtree, depth validation) | `src/mssp/isolation.py` | Working |
| Admin tenant CRUD (no hierarchy awareness) | `src/admin/router.py:89-126` | Working, no `parent_tenant_id` |
| SaaS provisioning (flat, no hierarchy) | `src/saas/router.py:112-219` | Working, no hierarchy |
| Tier enum with ordered ranks | `src/tier.py` | Working |
| `create_tenant()` middleware helper | `src/middleware/tenant.py:129-147` | No `parent_tenant_id` param |
| Portal MSSP SaaS page | `portal/src/app/dashboard/mssp/saas/page.tsx` | Calls `/api/mssp/provision` -> admin tenants endpoint (flat) |
| Portal provision route | `portal/src/app/api/mssp/provision/route.ts` | Proxies to `/v1/soulauth/admin/tenants` (no hierarchy) |
| RBAC permission system | `src/auth/rbac.py` | `multi_tenant` permission exists, no tier-based creation rules |

### Gaps

1. **`create_tenant()` in `src/middleware/tenant.py` ignores `parent_tenant_id` and `hierarchy_depth`** -- admin tenant creation always produces root-level tenants.
2. **`CreateTenantRequest` in `src/auth/schemas.py` has no `parent_tenant_id` field** -- the admin API cannot accept hierarchy info.
3. **No tier-based creation permission matrix** -- any tier can create any tier (MSSP router has a `valid_tiers` set but no restriction rules).
4. **Portal MSSP SaaS page provisions via the admin endpoint** (flat) instead of the MSSP hierarchy endpoint. The provisioned tenant gets no `parent_tenant_id`.
5. **No SaaS master profile concept** -- no way for Cristian's top-level SaaS tenant to create MSSP-tier children or delegate SaaS admin.
6. **No delegated admin RBAC** -- parent tenant admins cannot manage child tenant keys/policies.

---

## 2. Tier-Based Creation Permission Matrix

The hierarchy enforces **who can create what**. A parent tenant of tier X can only create children of the allowed tiers below.

```
Depth 0: SaaS (Saluca master)
         |
Depth 1: MSSP, Enterprise, Pro, SaaS (delegated)
         |
Depth 2: Enterprise, Pro, Community
         |
Depth 3: Community (leaf -- cannot create children)
```

### Permission Matrix

| Parent Tier | Can Create Child Tiers | Max Children | Notes |
|-------------|----------------------|--------------|-------|
| `saas` | `saas`, `mssp`, `enterprise`, `pro`, `community` | Unlimited | Cristian's master. Can create any type including delegated SaaS partners. |
| `mssp` | `enterprise`, `pro`, `community` | 500 | Standard MSSP operator. Cannot create `mssp` or `saas` children. |
| `enterprise` | `pro`, `community` | 50 | Large enterprise with business units. |
| `pro` | `community` | 10 | Small team spawning free sub-tenants. |
| `community` | (none) | 0 | Leaf tier. Cannot create children. |
| `starter` | (none) | 0 | Leaf tier. Cannot create children. |

### Enforcement constant (new)

**File:** `src/tier.py`

```python
# Tier-based child creation rules
TIER_ALLOWED_CHILDREN: dict[str, list[str]] = {
    "saas":       ["saas", "mssp", "enterprise", "pro", "community"],
    "mssp":       ["enterprise", "pro", "community"],
    "enterprise": ["pro", "community"],
    "pro":        ["community"],
    "community":  [],
    "starter":    [],
}

TIER_MAX_CHILDREN: dict[str, int] = {
    "saas":       0,   # 0 = unlimited
    "mssp":       500,
    "enterprise": 50,
    "pro":        10,
    "community":  0,
    "starter":    0,
}
```

---

## 3. DB Migration

**No new migration needed.** The `parent_tenant_id` and `hierarchy_depth` columns already exist in production via `alembic/versions/0002_mssp_tenant_hierarchy.py`. The CHECK constraint `ck_soul_tenants_max_depth` enforces `hierarchy_depth BETWEEN 0 AND 3`.

### Optional index (Phase 3)

If cross-tenant queries on `hierarchy_depth` become slow, add a partial index:

```sql
CREATE INDEX idx_soul_tenants_depth ON _soul_tenants (hierarchy_depth) WHERE parent_tenant_id IS NOT NULL;
```

This is not blocking -- defer until monitoring shows need.

---

## 4. API Changes

### 4.1 Update `create_tenant()` middleware to support hierarchy

**File:** `src/middleware/tenant.py`
**Function:** `create_tenant()` (line 129)

Add `parent_tenant_id` and `hierarchy_depth` parameters:

```python
async def create_tenant(
    db: AsyncSession,
    name: str,
    slug: str,
    tier: str = DEFAULT_TIER,
    metadata: Optional[dict] = None,
    parent_tenant_id: Optional[uuid.UUID] = None,
    hierarchy_depth: int = 0,
) -> SoulTenant:
    """Create a new tenant, optionally as a child of parent_tenant_id."""
    tenant = SoulTenant(
        name=name,
        slug=slug,
        tier=tier,
        status="active",
        parent_tenant_id=parent_tenant_id,
        hierarchy_depth=hierarchy_depth,
        metadata_=metadata or {},
    )
    db.add(tenant)
    await db.flush()
    await db.refresh(tenant)
    return tenant
```

### 4.2 Update `CreateTenantRequest` schema

**File:** `src/auth/schemas.py`
**Class:** `CreateTenantRequest` (line 136)

Add optional `parent_tenant_id`:

```python
class CreateTenantRequest(BaseModel):
    name: str
    slug: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$")
    tier: str = "community"
    parent_tenant_id: Optional[uuid.UUID] = None
    metadata: Optional[dict] = None
```

### 4.3 Update `admin_create_tenant()` with tier validation

**File:** `src/admin/router.py`
**Function:** `admin_create_tenant()` (line 89)

The updated function must:
1. If `parent_tenant_id` is provided, look up the parent tenant
2. Validate the caller has permission to create under that parent (must be the parent tenant's owner/admin, or the SaaS master)
3. Validate tier creation rules via `TIER_ALLOWED_CHILDREN`
4. Validate depth via `validate_depth_for_new_child()` from `src/mssp/isolation.py`
5. Count existing children and enforce `TIER_MAX_CHILDREN`
6. Pass `parent_tenant_id` and computed `hierarchy_depth` to `create_tenant()`

```python
@router.post(
    "/tenants",
    response_model=TenantDetail,
    summary="Create a new tenant",
    dependencies=[Depends(require_permission("tenants:create"))],
)
async def admin_create_tenant(
    request: CreateTenantRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    # Slug uniqueness check (existing)
    existing = await resolve_tenant_by_slug(db, request.slug)
    if existing:
        raise HTTPException(status_code=409, detail="Tenant slug already exists")

    parent_tenant_id = request.parent_tenant_id
    hierarchy_depth = 0

    if parent_tenant_id:
        # 1. Validate parent exists
        parent = await resolve_tenant(db, parent_tenant_id)
        if not parent:
            raise HTTPException(status_code=404, detail="Parent tenant not found")

        # 2. Validate caller owns the parent (or is SaaS master)
        caller_tenant_id = _get_caller_tenant_id(http_request)
        if caller_tenant_id and caller_tenant_id != parent_tenant_id:
            # Check if caller is SaaS master (parent of the parent)
            from src.mssp.isolation import assert_in_hierarchy
            await assert_in_hierarchy(db, caller_tenant_id, parent_tenant_id)

        # 3. Tier creation rules
        from src.tier import TIER_ALLOWED_CHILDREN
        allowed = TIER_ALLOWED_CHILDREN.get(parent.tier, [])
        if request.tier not in allowed:
            raise HTTPException(
                status_code=422,
                detail=f"Tier '{parent.tier}' cannot create child tier '{request.tier}'. "
                       f"Allowed: {allowed}",
            )

        # 4. Depth validation
        from src.mssp.isolation import validate_depth_for_new_child
        try:
            hierarchy_depth = await validate_depth_for_new_child(db, parent_tenant_id)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))

        # 5. Max children check
        from src.tier import TIER_MAX_CHILDREN
        max_children = TIER_MAX_CHILDREN.get(parent.tier, 0)
        if max_children > 0:
            from src.mssp.isolation import get_child_tenant_ids
            existing_children = await get_child_tenant_ids(db, parent_tenant_id, include_root=False)
            if len(existing_children) >= max_children:
                raise HTTPException(
                    status_code=422,
                    detail=f"Parent tenant has reached max children ({max_children})",
                )

    # Create tenant with hierarchy info
    metadata = request.metadata or {}
    if parent_tenant_id:
        metadata["provisioned_by"] = str(parent_tenant_id)

    tenant = await create_tenant(
        db=db,
        name=request.name,
        slug=request.slug,
        tier=request.tier,
        metadata=metadata,
        parent_tenant_id=parent_tenant_id,
        hierarchy_depth=hierarchy_depth,
    )

    # Eagerly provision DEK (existing)
    from src.middleware.tenant import provision_tenant_encryption
    await provision_tenant_encryption(db, str(tenant.id), tier=request.tier)

    return TenantDetail(
        id=tenant.id,
        name=tenant.name,
        slug=tenant.slug,
        tier=tenant.tier,
        status=tenant.status,
        metadata=tenant.metadata_,
        created_at=tenant.created_at,
        updated_at=tenant.updated_at,
    )
```

### 4.4 Add tier validation to MSSP router

**File:** `src/mssp/router.py`
**Function:** `provision_child_tenant()` (line 165)

Add the same `TIER_ALLOWED_CHILDREN` check before the existing depth guard:

```python
# Tier creation rules (add before depth guard at ~line 179)
from src.tier import TIER_ALLOWED_CHILDREN, TIER_MAX_CHILDREN
allowed = TIER_ALLOWED_CHILDREN.get(caller.tier, [])
if body.tier not in allowed:
    raise HTTPException(
        status_code=422,
        detail=f"Tier '{caller.tier}' cannot create child tier '{body.tier}'. Allowed: {allowed}",
    )

# Max children check (add after tier check)
max_children = TIER_MAX_CHILDREN.get(caller.tier, 0)
if max_children > 0:
    existing_children = await get_child_tenant_ids(db, caller_id, include_root=False)
    if len(existing_children) >= max_children:
        raise HTTPException(
            status_code=422,
            detail=f"Tenant has reached max children ({max_children})",
        )
```

### 4.5 SaaS Master Endpoints (new router)

**File:** `src/saas/master.py` (new)

The SaaS master profile (Cristian) needs dedicated endpoints that combine SaaS provisioning power with MSSP hierarchy awareness. These endpoints go beyond what the generic admin or MSSP routers offer.

```python
"""
SaaS Master API -- endpoints for the platform-level SaaS operator.

Only accessible to tenants with tier=saas AND hierarchy_depth=0.
Provides:
  - Create any tenant type at any depth
  - Create delegated SaaS admin tenants
  - List entire platform hierarchy
  - Override tier limits
"""

router = APIRouter(prefix="/v1/saas/master", tags=["SaaS Master"])
```

**Endpoints:**

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/v1/saas/master/tenants` | Create any tenant type (MSSP, enterprise, delegated SaaS) under any parent |
| `GET` | `/v1/saas/master/hierarchy` | Full platform hierarchy tree (all tenants, all depths) |
| `POST` | `/v1/saas/master/tenants/{id}/delegate` | Grant delegated admin to a child SaaS tenant |
| `PATCH` | `/v1/saas/master/tenants/{id}/tier` | Override a tenant's tier (upgrade/downgrade) |
| `GET` | `/v1/saas/master/stats` | Platform-wide stats (total tenants, by tier, by depth) |

**Guard function:**

```python
async def _require_saas_master(db: AsyncSession, request: Request) -> SoulTenant:
    """Verify caller is the SaaS master (tier=saas, depth=0, no parent)."""
    tenant_id = _get_caller_tenant_id(request)
    result = await db.execute(select(SoulTenant).where(SoulTenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Caller tenant not found")
    if tenant.tier != "saas" or tenant.hierarchy_depth != 0 or tenant.parent_tenant_id is not None:
        raise HTTPException(status_code=403, detail="Only the SaaS master can access this endpoint")
    return tenant
```

**Register in `src/main.py`:**

```python
from src.saas.master import router as saas_master_router
app.include_router(saas_master_router)
```

### 4.6 Update `TenantDetail` response schema

**File:** `src/auth/schemas.py`
**Class:** `TenantDetail` (line 143)

Add hierarchy fields to the response:

```python
class TenantDetail(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    tier: str
    status: str
    parent_tenant_id: Optional[uuid.UUID] = None
    hierarchy_depth: int = 0
    metadata: Optional[dict] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
```

Update the `TenantDetail(...)` construction in `admin_create_tenant()`, `admin_get_tenant()`, `admin_list_tenants()`, and `admin_update_tenant()` to include the new fields:

```python
TenantDetail(
    id=tenant.id,
    name=tenant.name,
    slug=tenant.slug,
    tier=tenant.tier,
    status=tenant.status,
    parent_tenant_id=tenant.parent_tenant_id,
    hierarchy_depth=tenant.hierarchy_depth,
    metadata=tenant.metadata_,
    created_at=tenant.created_at,
    updated_at=tenant.updated_at,
)
```

---

## 5. Portal Changes

### 5.1 Fix MSSP SaaS page to use MSSP endpoint

**File:** `portal/src/app/dashboard/mssp/saas/page.tsx`

**Problem:** The provision form calls `/api/mssp/provision` which proxies to `/v1/soulauth/admin/tenants` -- the flat admin endpoint. This creates root-level tenants with no `parent_tenant_id`.

**Fix:** Change the provision API route to proxy to `/v1/mssp/tenants` instead, which already sets `parent_tenant_id` correctly.

**File:** `portal/src/app/api/mssp/provision/route.ts`

Change line 42-49 from:
```typescript
const res = await fetch(
  `${config.soulauth.url}/v1/soulauth/admin/tenants`,
  { ... }
);
```
To:
```typescript
const res = await fetch(
  `${config.soulauth.url}/v1/mssp/tenants`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": session.tenantId,   // pass caller's tenant for hierarchy
    },
    body: JSON.stringify({
      name: body.name,
      slug: body.slug,
      tier: body.tier || "enterprise",
      metadata: body.metadata || {},
      feature_overrides: {},
    }),
    signal: AbortSignal.timeout(10000),
  },
);
```

**Also update the form** in `page.tsx` to include a slug field and remove the email field (MSSP endpoint uses `TenantCreateRequest`, not admin schema):

- Add slug input (auto-generated from name as fallback)
- Adjust tier dropdown to show only tiers allowed by the caller's tier (fetch from a new `/api/mssp/allowed-tiers` endpoint or hard-code based on session tier)
- Update response handling to match `TenantCreateResponse` (which returns `admin_soulkey`)

### 5.2 Add SaaS Admin page for master profile

**New file:** `portal/src/app/dashboard/admin/saas/page.tsx`

This page is for the SaaS master (Cristian) only. It provides:

1. **Platform hierarchy tree view** -- visual tree of all tenants, collapsible by depth
2. **Create any tenant form** -- dropdown for parent tenant, tier selector with full options
3. **Delegated SaaS creation** -- ability to create `saas`-tier children for larger partnerships
4. **Platform stats dashboard** -- total tenants by tier, by depth, growth over time

**Gate:** `<TierGate requiredTier="saas" featureLabel="Platform Admin">`

**API routes needed:**

| Portal Route | Backend Proxy |
|-------------|---------------|
| `portal/src/app/api/admin/saas/hierarchy/route.ts` | `GET /v1/saas/master/hierarchy` |
| `portal/src/app/api/admin/saas/tenants/route.ts` | `POST /v1/saas/master/tenants` |
| `portal/src/app/api/admin/saas/stats/route.ts` | `GET /v1/saas/master/stats` |
| `portal/src/app/api/admin/saas/delegate/route.ts` | `POST /v1/saas/master/tenants/{id}/delegate` |

### 5.3 Add hierarchy fields to existing portal components

**Files to update:**

- `portal/src/app/dashboard/mssp/page.tsx` -- show `parent_tenant_id` and `hierarchy_depth` in tenant cards
- `portal/src/app/dashboard/mssp/saas/[tenantId]/page.tsx` -- show parent chain breadcrumb
- Any component rendering `TenantDetail` -- add `parent_tenant_id` and `hierarchy_depth`

---

## 6. RBAC Changes for Delegated Admin

### 6.1 New permission: `hierarchy:manage`

**File:** `src/auth/rbac.py`

Add a new permission for cross-tenant management within hierarchy:

```python
ROLE_PERMISSIONS: dict[str, list[str]] = {
    "owner": ["*"],
    "admin": [
        "keys:*",
        "policy:*",
        "audit:read",
        "tenants:read",
        "tenants:update",
        "tenants:create",       # NEW -- admin can create child tenants
        "detection:*",
        "enforcement:*",
        "analytics:*",
        "aletheia:*",
        "multi_tenant",
        "hierarchy:manage",     # NEW -- manage child tenants
    ],
    # ... operator and viewer unchanged
}
```

### 6.2 Delegated admin model

When a SaaS master creates a delegated SaaS child tenant, the child tenant's owner gets:

1. **All permissions within their subtree** -- same as an MSSP operator within their hierarchy
2. **Cannot escalate tier** -- cannot create children at a higher tier than their own
3. **Cannot access sibling hierarchies** -- isolation enforced by `assert_in_hierarchy()`
4. **Audit trail** -- all delegated admin actions are logged with `provisioned_by` in metadata

**Implementation approach:** No new tables needed. The existing `SoulTenant.parent_tenant_id` + `SoulUser.admin_role` + `TIER_ALLOWED_CHILDREN` matrix is sufficient. The key change is in the RBAC check flow:

```python
async def check_hierarchy_permission(
    db: AsyncSession,
    caller_tenant_id: uuid.UUID,
    target_tenant_id: uuid.UUID,
    permission: str,
) -> bool:
    """
    Check if caller_tenant_id has permission over target_tenant_id.
    Returns True if:
    1. caller == target (same tenant), OR
    2. target is a descendant of caller in the hierarchy
    """
    if caller_tenant_id == target_tenant_id:
        return True
    child_ids = await get_child_tenant_ids(db, caller_tenant_id, include_root=False)
    return target_tenant_id in child_ids
```

**File:** `src/auth/rbac.py` -- add this function and use it in `_get_caller_tenant_id()` to relax the same-tenant restriction for hierarchy parents.

### 6.3 Update admin GET/PATCH tenant endpoints

**File:** `src/admin/router.py`

Currently `admin_get_tenant()` (line 162) raises 403 if `tenant_id != caller_tenant_id`. Update to also allow access when the target is within the caller's hierarchy:

```python
@router.get("/tenants/{tenant_id}", ...)
async def admin_get_tenant(tenant_id, request, db):
    caller_tenant_id = _get_caller_tenant_id(request)
    if caller_tenant_id is not None and tenant_id != caller_tenant_id:
        # Allow if target is a child in caller's hierarchy
        from src.auth.rbac import check_hierarchy_permission
        if not await check_hierarchy_permission(db, caller_tenant_id, tenant_id, "tenants:read"):
            raise HTTPException(status_code=403, detail="Cannot access another tenant's data")
    ...
```

Same pattern for `admin_update_tenant()` and `admin_list_tenants()` (filter to caller's subtree).

---

## 7. Implementation Phases

### Phase 1: Backend Foundation (2-3 hours)

**Goal:** Tier creation rules and `create_tenant()` hierarchy support.

| # | Task | File | Function/Class |
|---|------|------|----------------|
| 1a | Add `TIER_ALLOWED_CHILDREN` and `TIER_MAX_CHILDREN` constants | `src/tier.py` | Module-level constants |
| 1b | Add `validate_tier_creation()` function | `src/tier.py` | `validate_tier_creation(parent_tier, child_tier)` |
| 1c | Update `create_tenant()` to accept `parent_tenant_id` + `hierarchy_depth` | `src/middleware/tenant.py:129` | `create_tenant()` |
| 1d | Add `parent_tenant_id` to `CreateTenantRequest` | `src/auth/schemas.py:136` | `CreateTenantRequest` |
| 1e | Add `parent_tenant_id` + `hierarchy_depth` to `TenantDetail` | `src/auth/schemas.py:143` | `TenantDetail` |
| 1f | Update `admin_create_tenant()` with hierarchy validation | `src/admin/router.py:89` | `admin_create_tenant()` |
| 1g | Add tier validation to MSSP `provision_child_tenant()` | `src/mssp/router.py:165` | `provision_child_tenant()` |
| 1h | Update all `TenantDetail(...)` constructions in admin router | `src/admin/router.py` | Multiple functions |

**Tests:**

| Test | File |
|------|------|
| `test_tier_allowed_children_matrix` | `tests/test_tier.py` |
| `test_admin_create_tenant_with_parent` | `tests/test_admin_router.py` |
| `test_admin_create_tenant_tier_violation` | `tests/test_admin_router.py` |
| `test_admin_create_tenant_depth_violation` | `tests/test_admin_router.py` |
| `test_mssp_create_tenant_tier_validation` | `tests/test_mssp_router.py` |

### Phase 2: SaaS Master Router (2 hours)

**Goal:** Dedicated endpoints for the SaaS master profile.

| # | Task | File |
|---|------|------|
| 2a | Create `src/saas/master.py` with guard function | `src/saas/master.py` |
| 2b | Implement `POST /v1/saas/master/tenants` | `src/saas/master.py` |
| 2c | Implement `GET /v1/saas/master/hierarchy` (full tree) | `src/saas/master.py` |
| 2d | Implement `POST /v1/saas/master/tenants/{id}/delegate` | `src/saas/master.py` |
| 2e | Implement `PATCH /v1/saas/master/tenants/{id}/tier` | `src/saas/master.py` |
| 2f | Implement `GET /v1/saas/master/stats` | `src/saas/master.py` |
| 2g | Register router in `src/main.py` | `src/main.py` |

**Tests:**

| Test | File |
|------|------|
| `test_saas_master_guard_rejects_non_saas` | `tests/test_saas_master.py` |
| `test_saas_master_create_mssp_child` | `tests/test_saas_master.py` |
| `test_saas_master_create_delegated_saas` | `tests/test_saas_master.py` |
| `test_saas_master_hierarchy_tree` | `tests/test_saas_master.py` |

### Phase 3: RBAC Hierarchy (1-2 hours)

**Goal:** Parent tenants can manage their children via admin endpoints.

| # | Task | File |
|---|------|------|
| 3a | Add `check_hierarchy_permission()` | `src/auth/rbac.py` |
| 3b | Add `hierarchy:manage` permission to admin role | `src/auth/rbac.py:33` |
| 3c | Update `admin_get_tenant()` to allow hierarchy access | `src/admin/router.py:162` |
| 3d | Update `admin_update_tenant()` to allow hierarchy access | `src/admin/router.py:187` |
| 3e | Update `admin_list_tenants()` to scope by hierarchy | `src/admin/router.py:129` |

### Phase 4: Portal Fixes (2-3 hours)

**Goal:** Portal pages use correct endpoints and show hierarchy data.

| # | Task | File |
|---|------|------|
| 4a | Fix provision route to use `/v1/mssp/tenants` | `portal/src/app/api/mssp/provision/route.ts` |
| 4b | Update provision form for MSSP schema | `portal/src/app/dashboard/mssp/saas/page.tsx` |
| 4c | Add hierarchy fields to tenant list display | `portal/src/app/dashboard/mssp/saas/page.tsx` |
| 4d | Create SaaS master admin page | `portal/src/app/dashboard/admin/saas/page.tsx` (new) |
| 4e | Create SaaS master API proxy routes | `portal/src/app/api/admin/saas/*/route.ts` (new) |
| 4f | Add hierarchy tree component | `portal/src/components/dashboard/HierarchyTree.tsx` (new) |
| 4g | Update tenant detail page with parent breadcrumb | `portal/src/app/dashboard/mssp/saas/[tenantId]/page.tsx` |

### Phase 5: Integration Testing + Documentation (1 hour)

| # | Task |
|---|------|
| 5a | End-to-end test: SaaS master creates MSSP, MSSP creates Enterprise, Enterprise creates Community |
| 5b | Test depth=3 rejection |
| 5c | Test tier violation rejection |
| 5d | Test max children rejection |
| 5e | Test delegated admin cross-tenant access |
| 5f | Test isolation: sibling tenants cannot see each other |

---

## 8. Dependency Order

```
Phase 1 (backend foundation)
    |
    +-- Phase 2 (SaaS master router)  -- depends on tier validation from Phase 1
    |
    +-- Phase 3 (RBAC hierarchy)      -- depends on hierarchy functions from Phase 1
         |
         +-- Phase 4 (portal)         -- depends on all backend APIs being ready
              |
              +-- Phase 5 (integration tests)
```

Phases 2 and 3 can run in parallel after Phase 1 completes.

---

## 9. Files Modified (Summary)

### Modified Files

| File | Change |
|------|--------|
| `src/tier.py` | Add `TIER_ALLOWED_CHILDREN`, `TIER_MAX_CHILDREN`, `validate_tier_creation()` |
| `src/middleware/tenant.py` | Add `parent_tenant_id` + `hierarchy_depth` params to `create_tenant()` |
| `src/auth/schemas.py` | Add `parent_tenant_id` to `CreateTenantRequest`, add hierarchy fields to `TenantDetail` |
| `src/admin/router.py` | Hierarchy-aware `admin_create_tenant()`, hierarchy access in GET/PATCH |
| `src/mssp/router.py` | Add tier validation to `provision_child_tenant()` |
| `src/auth/rbac.py` | Add `hierarchy:manage` permission, `check_hierarchy_permission()` function |
| `src/main.py` | Register `saas_master_router` |
| `portal/src/app/api/mssp/provision/route.ts` | Proxy to `/v1/mssp/tenants` instead of admin endpoint |
| `portal/src/app/dashboard/mssp/saas/page.tsx` | Update form fields, tier options, response handling |
| `portal/src/app/dashboard/mssp/saas/[tenantId]/page.tsx` | Add parent breadcrumb |

### New Files

| File | Purpose |
|------|---------|
| `src/saas/master.py` | SaaS master router (5 endpoints) |
| `portal/src/app/dashboard/admin/saas/page.tsx` | SaaS master admin page |
| `portal/src/app/api/admin/saas/hierarchy/route.ts` | Hierarchy proxy |
| `portal/src/app/api/admin/saas/tenants/route.ts` | Master tenant creation proxy |
| `portal/src/app/api/admin/saas/stats/route.ts` | Platform stats proxy |
| `portal/src/app/api/admin/saas/delegate/route.ts` | Delegation proxy |
| `portal/src/components/dashboard/HierarchyTree.tsx` | Collapsible tree component |
| `tests/test_saas_master.py` | SaaS master endpoint tests |

---

## 10. Risk Notes

1. **Backward compatibility:** Existing tenants have `parent_tenant_id=NULL` and `hierarchy_depth=0`. All changes are additive -- existing flat tenants continue to work as root-level tenants.

2. **MSSP router already works:** The `provision_child_tenant()` function in `src/mssp/router.py` already sets `parent_tenant_id` and validates depth. The only gap is tier creation rules (any valid tier is accepted today).

3. **Portal provision bug is live:** The MSSP SaaS page (`portal/src/app/dashboard/mssp/saas/page.tsx`) currently creates flat tenants via the admin endpoint. This is the highest-priority fix -- Phase 4a.

4. **SaaS master identification:** Currently there is no explicit "SaaS master" flag. We identify it by `tier=saas AND hierarchy_depth=0 AND parent_tenant_id IS NULL`. If multiple SaaS root tenants are created, they would all have master access. For production, Cristian's tenant should be the only one matching this criteria.

5. **Performance:** BFS subtree traversal in `get_tenant_subtree()` does N+1 queries per depth level. With max_depth=3 and reasonable child counts (<500), this is fine. If scale demands it, a recursive CTE (PostgreSQL-specific) or materialized path column can replace it later.
