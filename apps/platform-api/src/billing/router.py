"""
Billing API router — BILL-01, BILL-02, BILL-04.

Endpoints:
  POST /v1/billing/portal-session  — create Stripe Customer Portal session URL
  POST /v1/billing/upgrade         — self-service tier upgrade
  GET  /v1/billing/grace-status    — payment failure grace period status (used by dashboard banner)

Tenant is identified via X-Tenant-ID header (same pattern as tenant/router.py).
No tier gate — billing is available to all authenticated tenants.
"""
from __future__ import annotations
import uuid
import structlog

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.connection import get_db
from src.database.models import SoulTenant
from src.billing.schemas import PortalSessionResponse, UpgradeRequest, UpgradeResponse, GracePeriodStatus
from src.billing.portal import create_portal_session
from src.billing.upgrade import upgrade_tenant_tier
from src.billing.grace import get_grace_status

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1/billing", tags=["Billing"])


def _get_caller_tenant_id(request: Request) -> uuid.UUID:
    """Extract caller tenant UUID from X-Tenant-ID header."""
    raw = request.headers.get("X-Tenant-ID")
    if not raw:
        raise HTTPException(status_code=403, detail="X-Tenant-ID header is required.")
    try:
        return uuid.UUID(raw)
    except ValueError:
        raise HTTPException(status_code=400, detail="Malformed X-Tenant-ID UUID.")


@router.post(
    "/portal-session",
    response_model=PortalSessionResponse,
    summary="Create Stripe Customer Portal session (BILL-01)",
)
async def billing_portal_session(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> PortalSessionResponse:
    """
    Returns a Stripe Customer Portal URL. Frontend opens in new tab.
    Tenant must have stripe_customer_id in metadata_.
    """
    tenant_id = _get_caller_tenant_id(request)

    result = await db.execute(select(SoulTenant).where(SoulTenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    meta = tenant.metadata_ or {}
    stripe_customer_id = meta.get("stripe_customer_id")
    if not stripe_customer_id:
        raise HTTPException(
            status_code=422,
            detail="No Stripe customer ID on file. Complete Stripe checkout first.",
        )

    try:
        url = await create_portal_session(stripe_customer_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.error("stripe_portal_error", error=str(exc))
        raise HTTPException(status_code=502, detail="Stripe portal session creation failed")

    return PortalSessionResponse(url=url)


@router.post(
    "/upgrade",
    response_model=UpgradeResponse,
    summary="Self-service tier upgrade (BILL-02)",
)
async def billing_upgrade(
    request: Request,
    body: UpgradeRequest,
    db: AsyncSession = Depends(get_db),
) -> UpgradeResponse:
    """
    Upgrade tenant tier. Updates Stripe subscription + DB tier atomically.
    Stripe update is best-effort — DB tier is always updated.
    """
    tenant_id = _get_caller_tenant_id(request)

    try:
        result = await upgrade_tenant_tier(
            db, tenant_id, body.new_tier, body.stripe_price_id
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("upgrade_error", tenant_id=str(tenant_id), error=str(exc))
        raise HTTPException(status_code=500, detail="Upgrade failed")

    return UpgradeResponse(**result)


@router.get(
    "/grace-status",
    response_model=GracePeriodStatus,
    summary="Payment failure grace period status (BILL-04)",
)
async def billing_grace_status(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> GracePeriodStatus:
    """
    Returns payment failure state and days remaining in grace period.
    Used by the dashboard to show/hide the persistent red warning banner.
    """
    tenant_id = _get_caller_tenant_id(request)
    status = await get_grace_status(db, tenant_id)
    if "error" in status:
        raise HTTPException(status_code=404, detail=status["error"])
    return GracePeriodStatus(**status)
