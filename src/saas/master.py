"""
SaaS Master API -- endpoints for the platform-level SaaS operator.

Only accessible to tenants with tier=saas AND hierarchy_depth=0 AND no parent.
Provides:
  - Create any tenant type at any depth
  - Full platform hierarchy tree
  - Delegated SaaS admin management
  - Tier override (upgrade/downgrade)
  - Platform-wide stats
"""

import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func as sa_func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.rbac import require_permission
from src.auth.soulkey import issue_soulkey
from src.database.connection import get_db
from src.database.models import SoulTenant
from src.mssp.isolation import (
    get_child_tenant_ids,
    get_tenant_subtree,
    validate_depth_for_new_child,
)
from src.tier import TIER_ALLOWED_CHILDREN, TIER_MAX_CHILDREN, VALID_TIERS, can_create_child

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1/saas/admin", tags=["saas-admin"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class SaasMasterCreateRequest(BaseModel):
    """Request body for creating any tenant via the SaaS master."""
    name: str = Field(..., min_length=2, max_length=255)
    slug: str = Field(..., min_length=2, max_length=63, pattern=r"^[a-z0-9-]+$")
    tier: str = Field(default="enterprise")
    parent_tenant_id: Optional[uuid.UUID] = None
    metadata: dict = Field(default_factory=dict)
    feature_overrides: dict = Field(default_factory=dict)


class SaasMasterTenantResponse(BaseModel):
    """Response after creating a tenant via SaaS master."""
    tenant_id: uuid.UUID
    name: str
    slug: str
    tier: str
    parent_tenant_id: Optional[uuid.UUID] = None
    hierarchy_depth: int
    admin_soulkey: str = Field(
        description="Plaintext admin soulkey for the new tenant. Store it -- not shown again."
    )


class TenantHierarchyNode(BaseModel):
    """A tenant in the platform hierarchy tree."""
    id: uuid.UUID
    name: str
    slug: str
    tier: str
    status: str
    parent_tenant_id: Optional[uuid.UUID] = None
    hierarchy_depth: int = 0
    metadata: Optional[dict] = None
    created_at: Optional[datetime] = None


class DelegateRequest(BaseModel):
    """Request body for delegating admin privileges."""
    delegated_admin: bool = True
    notes: Optional[str] = None


class TierOverrideRequest(BaseModel):
    """Request body for overriding a tenant tier."""
    new_tier: str
    reason: Optional[str] = None


class PlatformStats(BaseModel):
    """Platform-wide statistics."""
    total_tenants: int
    by_tier: dict[str, int]
    by_depth: dict[int, int]
    by_status: dict[str, int]


# ---------------------------------------------------------------------------
# Guard -- require SaaS master (tier=saas, depth=0, no parent)
# ---------------------------------------------------------------------------

def _get_caller_tenant_id(request: Request) -> uuid.UUID:
    """Extract tenant UUID from X-Tenant-ID header."""
    raw = request.headers.get("X-Tenant-ID")
    if not raw:
        raise HTTPException(
            status_code=403,
            detail="X-Tenant-ID header required for SaaS master endpoints.",
        )
    try:
        return uuid.UUID(raw)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="X-Tenant-ID must be a valid UUID.",
        )


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


# ---------------------------------------------------------------------------
# GET /v1/saas/admin/tenants -- list all tenants with hierarchy info
# ---------------------------------------------------------------------------

@router.get(
    "/tenants",
    response_model=list[TenantHierarchyNode],
    summary="List all tenants in the platform",
    dependencies=[Depends(require_permission("multi_tenant"))],
)
async def list_all_tenants(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Return all tenants in the entire platform with hierarchy info.
    Only accessible to the SaaS master tenant.
    """
    await _require_saas_master(db, request)

    result = await db.execute(
        select(SoulTenant).order_by(SoulTenant.hierarchy_depth, SoulTenant.created_at)
    )
    tenants = list(result.scalars().all())

    return [
        TenantHierarchyNode(
            id=t.id,
            name=t.name,
            slug=t.slug,
            tier=t.tier,
            status=t.status,
            parent_tenant_id=t.parent_tenant_id,
            hierarchy_depth=t.hierarchy_depth,
            metadata=t.metadata_,
            created_at=t.created_at,
        )
        for t in tenants
    ]


# ---------------------------------------------------------------------------
# POST /v1/saas/admin/tenants -- create any tenant type
# ---------------------------------------------------------------------------

@router.post(
    "/tenants",
    response_model=SaasMasterTenantResponse,
    status_code=201,
    summary="Create any tenant type with full hierarchy support",
    dependencies=[Depends(require_permission("multi_tenant"))],
)
async def create_tenant(
    body: SaasMasterCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new tenant of any type. Only the SaaS master can call this.
    Supports parent_tenant_id for hierarchy placement.
    Enforces tier creation matrix and auto-issues admin soulkey.
    """
    master = await _require_saas_master(db, request)

    # Validate tier
    if body.tier not in VALID_TIERS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid tier '{body.tier}'. Valid tiers: {sorted(VALID_TIERS)}",
        )

    # Determine parent: explicit parent_tenant_id or default to SaaS master
    parent_tenant_id = body.parent_tenant_id or master.id
    hierarchy_depth = 0

    # Look up the parent tenant
    parent_result = await db.execute(
        select(SoulTenant).where(SoulTenant.id == parent_tenant_id)
    )
    parent = parent_result.scalar_one_or_none()
    if not parent:
        raise HTTPException(status_code=404, detail="Parent tenant not found")

    # Tier creation rules
    if not can_create_child(parent.tier, body.tier):
        allowed = TIER_ALLOWED_CHILDREN.get(parent.tier, [])
        raise HTTPException(
            status_code=422,
            detail=f"Tier '{parent.tier}' cannot create child tier '{body.tier}'. "
                   f"Allowed: {allowed}",
        )

    # Depth validation
    try:
        hierarchy_depth = await validate_depth_for_new_child(db, parent_tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # Max children check (0 = unlimited)
    max_children = TIER_MAX_CHILDREN.get(parent.tier, 0)
    if max_children > 0:
        existing_children = await get_child_tenant_ids(db, parent_tenant_id, include_root=False)
        if len(existing_children) >= max_children:
            raise HTTPException(
                status_code=422,
                detail=f"Parent tenant has reached max children ({max_children})",
            )

    # Slug uniqueness
    existing = await db.execute(
        select(SoulTenant).where(SoulTenant.slug == body.slug)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Slug '{body.slug}' already in use.")

    # Build metadata
    child_metadata = {
        **body.metadata,
        "feature_overrides": body.feature_overrides,
        "provisioned_by": str(master.id),
        "provisioned_via": "saas_master",
    }

    new_tenant = SoulTenant(
        name=body.name,
        slug=body.slug,
        tier=body.tier,
        status="active",
        parent_tenant_id=parent_tenant_id,
        hierarchy_depth=hierarchy_depth,
        metadata_=child_metadata,
    )
    db.add(new_tenant)
    await db.flush()
    await db.refresh(new_tenant)

    # Issue admin soulkey
    raw_key, _admin_sk = await issue_soulkey(
        db=db,
        tenant_id=new_tenant.id,
        persona_id="admin",
        tenant_short=body.slug[:8],
        label=f"Admin key (provisioned by SaaS master)",
        metadata={"admin_role": "admin", "provisioned_by": str(master.id)},
    )

    logger.info(
        "saas_master.tenant_created",
        master_id=str(master.id),
        child_id=str(new_tenant.id),
        slug=body.slug,
        tier=body.tier,
        depth=hierarchy_depth,
        parent_id=str(parent_tenant_id),
    )

    return SaasMasterTenantResponse(
        tenant_id=new_tenant.id,
        name=new_tenant.name,
        slug=new_tenant.slug,
        tier=new_tenant.tier,
        parent_tenant_id=parent_tenant_id,
        hierarchy_depth=hierarchy_depth,
        admin_soulkey=raw_key,
    )


# ---------------------------------------------------------------------------
# GET /v1/saas/admin/tenants/{tenant_id}/subtree -- BFS traversal
# ---------------------------------------------------------------------------

@router.get(
    "/tenants/{tenant_id}/subtree",
    response_model=list[TenantHierarchyNode],
    summary="Get tenant subtree (all descendants)",
    dependencies=[Depends(require_permission("multi_tenant"))],
)
async def get_subtree(
    tenant_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Return the full subtree rooted at the given tenant (BFS traversal).
    Only accessible to the SaaS master tenant.
    """
    await _require_saas_master(db, request)

    # Verify target tenant exists
    target_result = await db.execute(
        select(SoulTenant).where(SoulTenant.id == tenant_id)
    )
    if not target_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Tenant not found")

    subtree = await get_tenant_subtree(db, tenant_id, include_root=True)

    return [
        TenantHierarchyNode(
            id=t.id,
            name=t.name,
            slug=t.slug,
            tier=t.tier,
            status=t.status,
            parent_tenant_id=t.parent_tenant_id,
            hierarchy_depth=t.hierarchy_depth,
            metadata=t.metadata_,
            created_at=t.created_at,
        )
        for t in subtree
    ]


# ---------------------------------------------------------------------------
# POST /v1/saas/admin/tenants/{tenant_id}/delegate -- grant delegated admin
# ---------------------------------------------------------------------------

@router.post(
    "/tenants/{tenant_id}/delegate",
    summary="Delegate admin privileges to a child tenant",
    dependencies=[Depends(require_permission("multi_tenant"))],
)
async def delegate_admin(
    tenant_id: uuid.UUID,
    body: DelegateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Grant or revoke delegated admin privileges on a child tenant.
    Sets the delegated_admin flag in the tenant metadata.
    Only accessible to the SaaS master tenant.
    """
    master = await _require_saas_master(db, request)

    # Verify target tenant exists and is within the master's hierarchy
    result = await db.execute(
        select(SoulTenant).where(SoulTenant.id == tenant_id)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Cannot delegate to self
    if tenant.id == master.id:
        raise HTTPException(status_code=422, detail="Cannot delegate admin to the SaaS master itself")

    # Must be within the master's hierarchy
    child_ids = await get_child_tenant_ids(db, master.id, include_root=False)
    if tenant.id not in child_ids:
        raise HTTPException(status_code=403, detail="Tenant is not within your hierarchy")

    # Update metadata with delegated_admin flag
    meta = dict(tenant.metadata_) if tenant.metadata_ else {}
    meta["delegated_admin"] = body.delegated_admin
    meta["delegated_admin_at"] = datetime.now(timezone.utc).isoformat()
    meta["delegated_admin_by"] = str(master.id)
    if body.notes:
        meta["delegated_admin_notes"] = body.notes
    tenant.metadata_ = meta

    await db.flush()

    logger.info(
        "saas_master.delegate_admin",
        master_id=str(master.id),
        target_id=str(tenant.id),
        delegated=body.delegated_admin,
    )

    return {
        "tenant_id": str(tenant.id),
        "name": tenant.name,
        "delegated_admin": body.delegated_admin,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# PATCH /v1/saas/admin/tenants/{tenant_id}/tier -- override tier
# ---------------------------------------------------------------------------

@router.patch(
    "/tenants/{tenant_id}/tier",
    summary="Override a tenant tier (upgrade/downgrade)",
    dependencies=[Depends(require_permission("multi_tenant"))],
)
async def override_tier(
    tenant_id: uuid.UUID,
    body: TierOverrideRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Override a tenant's tier. Only the SaaS master can do this.
    Records the change in tenant metadata for audit trail.
    """
    master = await _require_saas_master(db, request)

    if body.new_tier not in VALID_TIERS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid tier '{body.new_tier}'. Valid tiers: {sorted(VALID_TIERS)}",
        )

    result = await db.execute(
        select(SoulTenant).where(SoulTenant.id == tenant_id)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    if tenant.id == master.id:
        raise HTTPException(status_code=422, detail="Cannot change the SaaS master tier")

    old_tier = tenant.tier
    tenant.tier = body.new_tier

    # Record in metadata
    meta = dict(tenant.metadata_) if tenant.metadata_ else {}
    meta["tier_override_history"] = meta.get("tier_override_history", [])
    meta["tier_override_history"].append({
        "from": old_tier,
        "to": body.new_tier,
        "reason": body.reason,
        "at": datetime.now(timezone.utc).isoformat(),
        "by": str(master.id),
    })
    tenant.metadata_ = meta

    await db.flush()

    logger.info(
        "saas_master.tier_override",
        master_id=str(master.id),
        target_id=str(tenant.id),
        old_tier=old_tier,
        new_tier=body.new_tier,
    )

    return {
        "tenant_id": str(tenant.id),
        "name": tenant.name,
        "old_tier": old_tier,
        "new_tier": body.new_tier,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# GET /v1/saas/admin/stats -- platform-wide stats
# ---------------------------------------------------------------------------

@router.get(
    "/stats",
    response_model=PlatformStats,
    summary="Platform-wide tenant statistics",
    dependencies=[Depends(require_permission("multi_tenant"))],
)
async def platform_stats(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Return platform-wide statistics: total tenants, counts by tier, depth, status.
    Only accessible to the SaaS master tenant.
    """
    await _require_saas_master(db, request)

    # Total count
    total_result = await db.execute(select(sa_func.count()).select_from(SoulTenant))
    total = total_result.scalar() or 0

    # By tier
    tier_rows = await db.execute(
        select(SoulTenant.tier, sa_func.count())
        .group_by(SoulTenant.tier)
    )
    by_tier = {row[0]: row[1] for row in tier_rows.all()}

    # By depth
    depth_rows = await db.execute(
        select(SoulTenant.hierarchy_depth, sa_func.count())
        .group_by(SoulTenant.hierarchy_depth)
    )
    by_depth = {row[0]: row[1] for row in depth_rows.all()}

    # By status
    status_rows = await db.execute(
        select(SoulTenant.status, sa_func.count())
        .group_by(SoulTenant.status)
    )
    by_status = {row[0]: row[1] for row in status_rows.all()}

    return PlatformStats(
        total_tenants=total,
        by_tier=by_tier,
        by_depth=by_depth,
        by_status=by_status,
    )
