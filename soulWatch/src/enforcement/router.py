"""
Enforcement API router for SoulWatch - quarantine management endpoints.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from soulWatch.src.database.connection import get_db
from soulWatch.src.database.models import SoulWatchQuarantine
from soulWatch.src.enforcement.quarantine import QuarantineAction, QuarantineEngine

router = APIRouter(prefix="/watch/v1", tags=["enforcement"])

_engine: Optional[QuarantineEngine] = None


def get_quarantine_engine() -> QuarantineEngine:
    global _engine
    if _engine is None:
        _engine = QuarantineEngine()
    return _engine


def set_quarantine_engine(engine: QuarantineEngine):
    global _engine
    _engine = engine


class ManualQuarantineRequest(BaseModel):
    soulkey_id: str
    actions: list[str] = Field(default=["suspend_key", "kill_session"])
    reason: str = "Manual quarantine"
    auto_release_after: Optional[int] = Field(default=None, description="Minutes until auto-release")


class ReleaseRequest(BaseModel):
    released_by: str = "admin"


class ApproveRequest(BaseModel):
    approved_by: str


# ---------------------------------------------------------------------------
# Endpoints
#
# AUTH GUARD STATUS: These quarantine endpoints are currently unguarded --
# they rely on network-level protection (SoulGate proxy + internal-only
# routing). Adding soulkey-based auth is tracked but not yet implemented.
# Do NOT expose these endpoints on a public route without adding
# authentication middleware first.
# ---------------------------------------------------------------------------


@router.get("/quarantines")
async def list_quarantines(
    tenant_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    soulkey_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """List quarantine records with optional filters.

    tenant_id is required. When SOULWATCH_TENANT_HIERARCHY_MODE=true the
    query includes rows from descendant tenants.
    """
    from soulWatch.src.database.tenants import get_descendant_tenant_ids
    from soulWatch.config.settings import get_settings

    # Tenant isolation — require explicit tenant_id.
    if not tenant_id:
        raise HTTPException(status_code=401, detail="tenant_id is required")

    try:
        uuid.UUID(tenant_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tenant_id")

    settings = get_settings()
    if settings.tenant_hierarchy_mode:
        tenant_ids = await get_descendant_tenant_ids(db, tenant_id)
        tenant_uuids = [uuid.UUID(t) for t in tenant_ids]
        tenant_filter = SoulWatchQuarantine.tenant_id.in_(tenant_uuids)
    else:
        tid = uuid.UUID(tenant_id)
        tenant_filter = SoulWatchQuarantine.tenant_id == tid

    query = select(SoulWatchQuarantine).where(tenant_filter).order_by(SoulWatchQuarantine.quarantined_at.desc())

    if status:
        query = query.where(SoulWatchQuarantine.status == status)
    if soulkey_id:
        try:
            sk_id = uuid.UUID(soulkey_id)
            query = query.where(SoulWatchQuarantine.soulkey_id == sk_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid soulkey_id format")

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(query.offset(offset).limit(page_size))
    records = result.scalars().all()

    return {
        "quarantines": [
            {
                "id": str(r.id),
                "soulkey_id": str(r.soulkey_id),
                "tenant_id": str(r.tenant_id) if r.tenant_id else None,
                "persona_id": r.persona_id,
                "triggered_by_type": r.triggered_by_type,
                "actions_taken": r.actions_taken or [],
                "status": r.status,
                "reason": r.reason,
                "quarantined_at": r.quarantined_at.isoformat() if r.quarantined_at else None,
                "released_at": r.released_at.isoformat() if r.released_at else None,
                "auto_release_at": r.auto_release_at.isoformat() if r.auto_release_at else None,
                "released_by": r.released_by,
                "approved_by": r.approved_by,
                "approved_at": r.approved_at.isoformat() if r.approved_at else None,
            }
            for r in records
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/quarantines")
async def manual_quarantine(
    request: ManualQuarantineRequest,
    db: AsyncSession = Depends(get_db),
):
    """Manually quarantine an agent."""
    engine = get_quarantine_engine()

    try:
        sk_id = uuid.UUID(request.soulkey_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid soulkey_id format")

    actions = []
    for a in request.actions:
        try:
            actions.append(QuarantineAction(a))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid action: {a}")

    record = await engine.execute_manual_quarantine(
        db=db,
        soulkey_id=sk_id,
        actions=actions,
        reason=request.reason,
        auto_release_after=request.auto_release_after,
    )

    return {
        "id": str(record.id),
        "soulkey_id": str(record.soulkey_id),
        "status": record.status,
        "message": "Quarantine activated",
    }


@router.post("/quarantines/{quarantine_id}/release")
async def release_quarantine(
    quarantine_id: str,
    request: ReleaseRequest,
    db: AsyncSession = Depends(get_db),
):
    """Release an agent from quarantine."""
    engine = get_quarantine_engine()
    try:
        qid = uuid.UUID(quarantine_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid quarantine_id format")

    ok = await engine.release_quarantine(db, qid, released_by=request.released_by)
    if not ok:
        raise HTTPException(status_code=404, detail="Quarantine record not found or already released")

    return {"status": "released", "quarantine_id": quarantine_id}


@router.post("/quarantines/{quarantine_id}/approve")
async def approve_quarantine(
    quarantine_id: str,
    request: ApproveRequest,
    db: AsyncSession = Depends(get_db),
):
    """Approve a pending quarantine and execute its actions."""
    engine = get_quarantine_engine()
    try:
        qid = uuid.UUID(quarantine_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid quarantine_id format")

    ok = await engine.approve_quarantine(db, qid, approved_by=request.approved_by)
    if not ok:
        raise HTTPException(status_code=404, detail="Quarantine not found or not pending approval")

    return {"status": "approved", "quarantine_id": quarantine_id}
