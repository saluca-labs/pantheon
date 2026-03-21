"""
Usage API — current-period consumption vs tier limits.
Implements USAGE-01, USAGE-02.

Endpoints:
  GET /v1/usage/current  — agents, requests, storage vs tier limits
  GET /v1/usage/alerts   — threshold alert level (none/warning/critical)
"""

import uuid
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.connection import get_db
from src.usage.limits import get_usage_current, check_alerts

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1/usage", tags=["Usage & Limits"])


def _get_tenant_and_tier(request: Request) -> tuple[uuid.UUID, str]:
    """
    Extract tenant_id and tier from request context.
    tenant_id from X-Tenant-ID header; tier from app.state.license.
    Returns (tenant_id, tier). Raises HTTPException 401 if missing.
    """
    raw_id = request.headers.get("X-Tenant-ID") or request.cookies.get("tiresias_tenant")
    if not raw_id:
        raise HTTPException(status_code=401, detail="No tenant identity found. Provide X-Tenant-ID header or tiresias_tenant cookie.")
    try:
        tenant_id = uuid.UUID(raw_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tenant_id format (must be UUID).")

    license_state = getattr(request.app.state, "license", None)
    tier = license_state.tier if license_state else "community"
    return tenant_id, tier


# --- Response models ---------------------------------------------------------

class UsagePeriod(BaseModel):
    start: str
    end: str

class UsageDimensions(BaseModel):
    agents: int
    requests: int
    storage_bytes: int

class LimitDimensions(BaseModel):
    agents: int       # -1 = unlimited
    requests: int     # -1 = unlimited
    storage_bytes: int  # -1 = unlimited

class PctDimensions(BaseModel):
    agents: float
    requests: float
    storage_bytes: float

class UsageCurrentResponse(BaseModel):
    tenant_id: str
    tier: str
    period: UsagePeriod
    usage: UsageDimensions
    limits: LimitDimensions
    pct: PctDimensions

class AlertThresholds(BaseModel):
    warn_pct: int
    block_pct: int
    hard_pct: int

class UsageAlertsResponse(BaseModel):
    tenant_id: str
    tier: str
    alert_level: str   # none | warning | critical
    max_pct_used: float
    dimensions: PctDimensions
    thresholds: AlertThresholds


# --- Endpoints ---------------------------------------------------------------

@router.get(
    "/current",
    response_model=UsageCurrentResponse,
    summary="Current-period usage vs tier limits (USAGE-01)",
    responses={
        200: {"description": "Usage metrics for the current calendar month"},
        401: {"description": "No tenant identity"},
    },
)
async def usage_current(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Return agent count, request count, and storage used for the current
    calendar month vs the calling tenant's tier limits.
    Unlimited tiers have limit=-1 and pct=0.0.
    """
    tenant_id, tier = _get_tenant_and_tier(request)
    data = await get_usage_current(db, tenant_id, tier)
    return UsageCurrentResponse(**data)


@router.get(
    "/alerts",
    response_model=UsageAlertsResponse,
    summary="Usage alert level — none/warning/critical (USAGE-02)",
    responses={
        200: {"description": "Alert level and per-dimension percentages"},
        401: {"description": "No tenant identity"},
    },
)
async def usage_alerts(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Return alert_level based on highest dimension usage.
    warning = any dimension >= 80%, critical = any dimension >= 100%.
    Portal uses this to drive banner color.
    """
    tenant_id, tier = _get_tenant_and_tier(request)
    data = await check_alerts(db, tenant_id, tier)
    return UsageAlertsResponse(**data)
