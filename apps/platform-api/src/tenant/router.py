"""
White-label branding API (WL-02).

GET  /v1/tenant/branding  -- return current branding for caller's tenant
PUT  /v1/tenant/branding  -- update branding for caller's tenant

Both endpoints are gated to the white_label feature (mssp + saas tiers)
via FeatureGateMiddleware on the /v1/tenant/* path prefix.

Caller tenant is identified via X-Tenant-ID header (same pattern as MSSP router).
"""

from __future__ import annotations
import uuid
import structlog

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.database.connection import get_db
from src.database.models import SoulTenant
from src.tenant.schemas import BrandingConfig, BrandingResponse

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1/tenant", tags=["Tenant"])


def _get_caller_tenant_id(request: Request) -> uuid.UUID:
    """
    Extract caller tenant UUID from X-Tenant-ID header.
    Raises 403 if missing, 400 if malformed UUID.
    """
    raw = request.headers.get("X-Tenant-ID")
    if not raw:
        raise HTTPException(
            status_code=403,
            detail="X-Tenant-ID header is required for tenant branding endpoints.",
        )
    try:
        return uuid.UUID(raw)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"X-Tenant-ID is not a valid UUID: {raw!r}",
        )


async def _get_tenant_or_404(db: AsyncSession, tenant_id: uuid.UUID) -> SoulTenant:
    """Fetch SoulTenant by id or raise HTTP 404."""
    result = await db.execute(select(SoulTenant).where(SoulTenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if tenant is None:
        raise HTTPException(status_code=404, detail=f"Tenant {tenant_id} not found.")
    return tenant


@router.get(
    "/branding",
    response_model=BrandingResponse,
    summary="Get white-label branding config for caller tenant (WL-01, WL-02)",
)
async def get_branding(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> BrandingResponse:
    """
    Return the current branding configuration for the caller's tenant.
    Stored in SoulTenant.metadata_["branding"]. Returns empty BrandingConfig
    (all None fields) if no branding has been configured yet.

    Requires: white_label feature (mssp or saas tier).
    """
    tenant_id = _get_caller_tenant_id(request)
    tenant = await _get_tenant_or_404(db, tenant_id)

    raw_branding = {}
    if tenant.metadata_ and isinstance(tenant.metadata_, dict):
        raw_branding = tenant.metadata_.get("branding", {}) or {}

    branding = BrandingConfig(**raw_branding)
    logger.info("branding.get", tenant_id=str(tenant_id))
    return BrandingResponse(tenant_id=str(tenant_id), branding=branding)


@router.put(
    "/branding",
    response_model=BrandingResponse,
    summary="Update white-label branding config for caller tenant (WL-01, WL-02)",
)
async def put_branding(
    body: BrandingConfig,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> BrandingResponse:
    """
    Update the branding configuration for the caller's tenant.
    Merges supplied fields into SoulTenant.metadata_["branding"].
    Unset (None) fields in the request body clear those fields.

    Requires: white_label feature (mssp or saas tier).
    """
    tenant_id = _get_caller_tenant_id(request)
    tenant = await _get_tenant_or_404(db, tenant_id)

    # Deep-merge into existing metadata (never clobber other metadata keys)
    existing_meta: dict = dict(tenant.metadata_) if tenant.metadata_ else {}
    existing_meta["branding"] = body.model_dump(exclude_none=False)

    # SQLAlchemy requires flag_modified for JSON mutation detection
    from sqlalchemy.orm.attributes import flag_modified
    tenant.metadata_ = existing_meta
    flag_modified(tenant, "metadata_")

    await db.flush()
    logger.info("branding.updated", tenant_id=str(tenant_id), fields=list(body.model_fields_set))

    return BrandingResponse(tenant_id=str(tenant_id), branding=body)
