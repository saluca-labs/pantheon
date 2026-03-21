"""
MSSP multi-tenant API router.

Endpoints:
  GET  /v1/mssp/tenants                -- list child tenants with aggregate stats
  POST /v1/mssp/tenants                -- provision new child tenant
  GET  /v1/mssp/detection/matches      -- cross-tenant Sigma rule matches
  GET  /v1/mssp/enforcement/quarantine -- cross-tenant quarantine records

All endpoints enforce tenant isolation via src/mssp/isolation.py.
Callers must supply X-Tenant-ID header identifying their (MSSP-tier) root tenant.
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.connection import get_db
from src.database.models import SoulTenant, Soulkey
from src.auth.soulkey import issue_soulkey
from src.mssp.isolation import (
    get_tenant_subtree,
    get_child_tenant_ids,
    validate_depth_for_new_child,
)
from src.mssp.models import (
    CrossTenantMatchSummary,
    CrossTenantQuarantineRecord,
    TenantCreateRequest,
    TenantCreateResponse,
    TenantNode,
    TenantStats,
)
from src.auth.rbac import require_permission
from src.enforcement.router import get_quarantine_engine
from src.detection._state import get_sigma_engine

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1/mssp", tags=["MSSP"])


# ---------------------------------------------------------------------------
# Helper -- extract caller root tenant from request
# ---------------------------------------------------------------------------

def _get_caller_tenant_id(request: Request) -> uuid.UUID:
    """
    Extract the MSSP operator tenant UUID from X-Tenant-ID header.
    Raises 403 if header is missing, 400 if malformed.
    """
    raw = request.headers.get("X-Tenant-ID")
    if not raw:
        raise HTTPException(
            status_code=403,
            detail="X-Tenant-ID header required for MSSP endpoints.",
        )
    try:
        return uuid.UUID(raw)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="X-Tenant-ID must be a valid UUID.",
        )


async def _require_mssp_tier(db: AsyncSession, tenant_id: uuid.UUID) -> SoulTenant:
    """
    Verify caller tenant exists and holds mssp or saas tier.
    Raises 404 if not found, 403 if wrong tier.
    """
    result = await db.execute(select(SoulTenant).where(SoulTenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Caller tenant not found.")
    if tenant.tier not in ("mssp", "saas"):
        raise HTTPException(
            status_code=403,
            detail=f"MSSP features require mssp or saas tier. Current tier: {tenant.tier}",
        )
    return tenant


# ---------------------------------------------------------------------------
# GET /v1/mssp/tenants -- list child tenants with aggregate stats
# ---------------------------------------------------------------------------

@router.get(
    "/tenants",
    response_model=list[TenantNode],
    summary="List child tenants with aggregate stats (MSSP-02)",
    dependencies=[Depends(require_permission("multi_tenant"))],
)
async def list_child_tenants(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Return all tenants in the caller hierarchy (excluding the root itself).
    Each node includes agent count, anomaly count, and quarantine count.
    Returns an empty list when the caller has no children -- never an error.
    """
    caller_id = _get_caller_tenant_id(request)
    await _require_mssp_tier(db, caller_id)

    all_tenants = await get_tenant_subtree(db, caller_id, include_root=True)
    children = [t for t in all_tenants if t.id != caller_id]

    if not children:
        return []

    qe = get_quarantine_engine()
    nodes: list[TenantNode] = []

    for tenant in children:
        # Agent count: soulkeys belonging to this tenant
        sk_result = await db.execute(
            select(Soulkey).where(Soulkey.tenant_id == tenant.id)
        )
        agent_count = len(list(sk_result.scalars().all()))

        # Quarantine count: from in-memory QuarantineEngine
        quarantine_records = await qe.list_quarantined(tenant_id=tenant.id)
        quarantine_count = len(quarantine_records)

        # Anomaly count: not persisted per-tenant yet -- populated in future analytics phase
        anomaly_count = 0

        nodes.append(
            TenantNode(
                id=tenant.id,
                name=tenant.name,
                slug=tenant.slug,
                tier=tenant.tier,
                status=tenant.status,
                parent_tenant_id=tenant.parent_tenant_id,
                hierarchy_depth=tenant.hierarchy_depth,
                stats=TenantStats(
                    agent_count=agent_count,
                    anomaly_count=anomaly_count,
                    quarantine_count=quarantine_count,
                ),
            )
        )

    return nodes


# ---------------------------------------------------------------------------
# POST /v1/mssp/tenants -- provision new child tenant
# ---------------------------------------------------------------------------

@router.post(
    "/tenants",
    response_model=TenantCreateResponse,
    status_code=201,
    summary="Provision a new child tenant (MSSP-05)",
    dependencies=[Depends(require_permission("multi_tenant"))],
)
async def provision_child_tenant(
    body: TenantCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new child tenant under the caller hierarchy.
    Enforces max_depth=3 -- returns 422 if parent is already at depth 3.
    Returns tenant_id and a one-time admin soulkey in a single response.
    """
    caller_id = _get_caller_tenant_id(request)
    caller = await _require_mssp_tier(db, caller_id)

    # Depth guard before any DB writes
    try:
        new_depth = await validate_depth_for_new_child(db, caller_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # Slug uniqueness check
    existing = await db.execute(
        select(SoulTenant).where(SoulTenant.slug == body.slug)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Slug '{body.slug}' already in use.")

    # Inherit caller tier if the requested tier is not a recognised value
    valid_tiers = {"community", "starter", "pro", "enterprise", "mssp", "saas"}
    child_tier = body.tier if body.tier in valid_tiers else caller.tier

    child_metadata = {
        **body.metadata,
        "feature_overrides": body.feature_overrides,
        "provisioned_by": str(caller_id),
    }

    new_tenant = SoulTenant(
        name=body.name,
        slug=body.slug,
        tier=child_tier,
        status="active",
        parent_tenant_id=caller_id,
        hierarchy_depth=new_depth,
        metadata_=child_metadata,
    )
    db.add(new_tenant)
    await db.flush()
    await db.refresh(new_tenant)

    # Issue admin soulkey using the same helper as saas provisioning
    raw_key, _admin_sk = await issue_soulkey(
        db=db,
        tenant_id=new_tenant.id,
        persona_id="admin",
        tenant_short=body.slug[:8],
        label="Admin key (provisioned by MSSP operator)",
        metadata={"admin_role": "admin", "provisioned_by": str(caller_id)},
    )

    logger.info(
        "mssp.child_tenant_provisioned",
        parent_id=str(caller_id),
        child_id=str(new_tenant.id),
        slug=body.slug,
        depth=new_depth,
    )

    return TenantCreateResponse(
        tenant_id=new_tenant.id,
        name=new_tenant.name,
        slug=new_tenant.slug,
        tier=new_tenant.tier,
        parent_tenant_id=caller_id,
        hierarchy_depth=new_depth,
        admin_soulkey=raw_key,
    )


# ---------------------------------------------------------------------------
# GET /v1/mssp/detection/matches -- cross-tenant Sigma rule matches
# ---------------------------------------------------------------------------

@router.get(
    "/detection/matches",
    response_model=list[CrossTenantMatchSummary],
    summary="Cross-tenant Sigma rule matches (MSSP-03)",
    dependencies=[Depends(require_permission("multi_tenant"))],
)
async def cross_tenant_matches(
    request: Request,
    rule_id: Optional[str] = Query(None),
    level: Optional[str] = Query(None),
    minutes: int = Query(60, ge=1, le=1440),
    limit: int = Query(200, le=2000),
    db: AsyncSession = Depends(get_db),
):
    """
    Return Sigma rule matches across all tenants in the caller hierarchy.
    Each result carries a tenant_id field for attribution.
    Matches from sibling or unrelated hierarchies are never returned.
    """
    caller_id = _get_caller_tenant_id(request)
    await _require_mssp_tier(db, caller_id)

    subtree = await get_tenant_subtree(db, caller_id, include_root=True)
    subtree_ids: set[uuid.UUID] = {t.id for t in subtree}
    slug_map: dict[uuid.UUID, str] = {t.id: t.slug for t in subtree}

    sigma = get_sigma_engine()
    since = datetime.now(timezone.utc) - timedelta(minutes=minutes)

    raw_matches = sigma.get_recent_matches(
        limit=limit,
        rule_id=rule_id,
        level=level,
        since=since,
    )

    results: list[CrossTenantMatchSummary] = []
    for m in raw_matches:
        # Extract tenant_id injected at detection time (if present)
        raw_tid = m.matched_fields.get("tenant_id") or (
            m.context.get("tenant_id")
            if hasattr(m, "context") and m.context
            else None
        )

        if raw_tid:
            try:
                match_tenant_id = uuid.UUID(str(raw_tid))
            except ValueError:
                match_tenant_id = caller_id
        else:
            # Legacy matches without tenant attribution: attribute to caller root
            match_tenant_id = caller_id

        # Isolation guard -- skip matches outside this hierarchy
        if match_tenant_id not in subtree_ids:
            continue

        results.append(
            CrossTenantMatchSummary(
                tenant_id=match_tenant_id,
                tenant_slug=slug_map.get(match_tenant_id, "unknown"),
                rule_id=m.rule.id,
                rule_title=m.rule.title,
                level=m.rule.level,
                timestamp=m.timestamp.isoformat(),
                matched_fields=m.matched_fields,
                response_playbook=m.rule.response_playbook,
            )
        )

    return results


# ---------------------------------------------------------------------------
# GET /v1/mssp/enforcement/quarantine -- cross-tenant quarantine records
# ---------------------------------------------------------------------------

@router.get(
    "/enforcement/quarantine",
    response_model=list[CrossTenantQuarantineRecord],
    summary="Cross-tenant quarantine records (MSSP-04)",
    dependencies=[Depends(require_permission("multi_tenant"))],
)
async def cross_tenant_quarantines(
    request: Request,
    status_filter: Optional[str] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
):
    """
    Return all quarantine records across the caller tenant hierarchy.
    Records from outside this hierarchy are never returned.
    """
    caller_id = _get_caller_tenant_id(request)
    await _require_mssp_tier(db, caller_id)

    subtree = await get_tenant_subtree(db, caller_id, include_root=True)
    slug_map: dict[uuid.UUID, str] = {t.id: t.slug for t in subtree}

    qe = get_quarantine_engine()
    results: list[CrossTenantQuarantineRecord] = []

    for tenant in subtree:
        records = await qe.list_quarantined(tenant_id=tenant.id)
        for r in records:
            d = r.to_dict()

            if status_filter and d.get("status") != status_filter:
                continue

            results.append(
                CrossTenantQuarantineRecord(
                    tenant_id=tenant.id,
                    tenant_slug=slug_map.get(tenant.id, "unknown"),
                    id=d["id"],
                    soulkey_id=d["soulkey_id"],
                    persona_id=d["persona_id"],
                    triggered_by_type=d["triggered_by_type"],
                    actions_taken=d["actions_taken"],
                    status=d["status"],
                    quarantined_at=d["quarantined_at"],
                    released_at=d.get("released_at"),
                    reason=d.get("reason", ""),
                )
            )

    return results
