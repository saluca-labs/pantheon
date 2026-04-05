"""
SaaS Management API router.
Implements SAAS-01, SAAS-02, SAAS-03, SAAS-04.

Endpoints:
  POST /v1/saas/provision                  — atomic tenant + soulkey + policies
  GET  /v1/saas/usage                      — per-tenant usage metrics
  POST /v1/saas/billing/webhook            — Stripe webhook receiver
  POST /v1/saas/tenants/{tenant_id}/suspend
  POST /v1/saas/tenants/{tenant_id}/reactivate
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.connection import get_db
from src.database.models import AuditLog, PolicyCache, Soulkey, SoulTenant
from src.auth.soulkey import issue_soulkey
from src.saas.metering import get_tenant_usage
from src.saas.billing import handle_stripe_event

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1/saas", tags=["SaaS Management"])


# --- Pydantic schemas --------------------------------------------------------

class ProvisionRequest(BaseModel):
    company_name: str = Field(..., min_length=2, max_length=255)
    slug: str = Field(..., min_length=2, max_length=63, pattern=r"^[a-z0-9-]+$")
    tier: str = Field(default="starter", description="Tier to assign: starter, pro, enterprise, mssp, saas")
    admin_persona_id: str = Field(default="admin", description="persona_id for the admin soulkey")
    metadata: Optional[dict] = Field(default_factory=dict)


class ProvisionResponse(BaseModel):
    tenant_id: uuid.UUID
    soulkey_id: uuid.UUID
    raw_key: str = Field(description="Admin soulkey — shown once. Save immediately.")
    proxy_api_key: str | None = Field(
        default=None,
        description="Tiresias proxy API key — shown once. Point agents at proxy.tiresias.network with this key.",
    )
    slug: str
    tier: str
    status: str
    provisioned_at: datetime


class UsageResponse(BaseModel):
    tenant_id: str
    requests: int
    tokens: int
    anomalies: int
    storage_bytes: int
    total_events: int
    period: dict


class BillingWebhookRequest(BaseModel):
    type: str
    data: dict


class BillingWebhookResponse(BaseModel):
    received: bool
    action: str
    tenant_id: Optional[str] = None


class SuspendRequest(BaseModel):
    reason: Optional[str] = Field(default=None, description="Human-readable suspension reason")
    suspended_by: str = Field(default="saas_operator")


class SuspendResponse(BaseModel):
    tenant_id: uuid.UUID
    status: str
    suspended_at: datetime
    reason: Optional[str]


class ReactivateResponse(BaseModel):
    tenant_id: uuid.UUID
    status: str
    reactivated_at: datetime
    grace_period_logged: bool


# --- Default policies factory ------------------------------------------------

def _default_policies(tenant_id: uuid.UUID, persona_id: str) -> dict:
    """Return a minimal default resolved policy for a new tenant's admin persona."""
    return {
        "version": "1.0",
        "persona_id": persona_id,
        "tenant_id": str(tenant_id),
        "rules": [
            {"resource": "*", "action": "*", "scope": "*", "effect": "allow"},
        ],
        "created_by": "saas_provisioner",
    }


# --- Endpoints ---------------------------------------------------------------

@router.post(
    "/provision",
    response_model=ProvisionResponse,
    status_code=201,
    summary="Provision a new managed tenant (SAAS-01)",
    responses={
        201: {"description": "Tenant, admin soulkey, and default policies created atomically"},
        409: {"description": "Slug already taken"},
        422: {"description": "Validation error"},
    },
)
async def saas_provision(
    request: ProvisionRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Atomic managed provisioning: creates a SoulTenant, issues an admin Soulkey,
    and writes a default PolicyCache entry in a single transaction.

    If any step fails, no partial records remain (SQLAlchemy transaction rollback).
    The raw_key in the response is shown exactly once — it is never stored.
    """
    now = datetime.now(timezone.utc)

    try:
        # 1. Create tenant
        tenant = SoulTenant(
            name=request.company_name,
            slug=request.slug,
            tier=request.tier,
            status="active",
            metadata_=request.metadata or {},
        )
        db.add(tenant)
        await db.flush()  # get tenant.id without committing

        # 1b. Eagerly provision DEK for envelope encryption
        from src.middleware.tenant import provision_tenant_encryption
        await provision_tenant_encryption(db, str(tenant.id), tier=request.tier)

        # 2. Issue admin soulkey (uses db.flush() internally — stays in same txn)
        raw_key, soulkey = await issue_soulkey(
            db=db,
            tenant_id=tenant.id,
            persona_id=request.admin_persona_id,
            tenant_short=request.slug[:8],
            label=f"Admin soulkey for {request.company_name}",
            metadata={"provisioned_by": "saas_provision", "tier": request.tier},
        )

        # 3. Write default policy cache entry
        policy = PolicyCache(
            tenant_id=tenant.id,
            persona_id=request.admin_persona_id,
            policy_version="1.0",
            resolved_policy=_default_policies(tenant.id, request.admin_persona_id),
        )
        db.add(policy)
        await db.flush()

        # 4. Generate Tiresias proxy API key for SaaS customers
        proxy_api_key = None
        if request.tier in ("trial", "starter", "pro", "saas"):
            from src.saas.proxy_keys import provision_proxy_key
            proxy_api_key = await provision_proxy_key(
                db=db,
                tenant_id=str(tenant.id),
                tenant_slug=request.slug,
                tier=request.tier,
            )

        # 5. Write provision audit log entry
        audit = AuditLog(
            tenant_id=tenant.id,
            event_type="saas.provision",
            soulkey_id=soulkey.id,
            persona_id=request.admin_persona_id,
            resource="tenant",
            action="provision",
            scope="admin",
            decision="allow",
            reason="SaaS managed provisioning",
            context={
                "slug": request.slug,
                "tier": request.tier,
                "provisioned_at": now.isoformat(),
            },
        )
        db.add(audit)
        # get_db auto-commits on clean return — no explicit commit needed here

        logger.info(
            "saas.provision.success",
            tenant_id=str(tenant.id),
            slug=request.slug,
            tier=request.tier,
        )

        return ProvisionResponse(
            tenant_id=tenant.id,
            soulkey_id=soulkey.id,
            raw_key=raw_key,
            proxy_api_key=proxy_api_key,
            slug=tenant.slug,
            tier=tenant.tier,
            status=tenant.status,
            provisioned_at=now,
        )

    except IntegrityError as e:
        await db.rollback()
        logger.warning("saas.provision.conflict", slug=request.slug, error=str(e))
        raise HTTPException(
            status_code=409,
            detail=f"Slug '{request.slug}' is already taken. Choose a different slug.",
        )
    except Exception as e:
        await db.rollback()
        logger.error("saas.provision.failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Provisioning failed: {str(e)}")


@router.get(
    "/usage",
    response_model=UsageResponse,
    summary="Per-tenant usage metrics for billing (SAAS-02)",
    responses={
        200: {"description": "Usage metrics for the specified tenant and time range"},
        404: {"description": "Tenant not found"},
    },
)
async def saas_usage(
    tenant_id: uuid.UUID = Query(..., description="Tenant UUID to query"),
    start: Optional[datetime] = Query(None, description="Range start (ISO 8601, UTC)"),
    end: Optional[datetime] = Query(None, description="Range end (ISO 8601, UTC)"),
    db: AsyncSession = Depends(get_db),
):
    """
    Return per-tenant usage metrics from AuditLog aggregation.
    Missing tenants return 404, not empty data.
    """
    try:
        usage = await get_tenant_usage(db, tenant_id, start=start, end=end)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return UsageResponse(**usage)


@router.post(
    "/billing/webhook",
    response_model=BillingWebhookResponse,
    summary="Stripe webhook receiver — subscription lifecycle (SAAS-03)",
    responses={
        200: {"description": "Event processed; tier updated if applicable"},
    },
)
async def saas_billing_webhook(
    payload: BillingWebhookRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Receive Stripe webhook events and update tenant tier accordingly.

    Handled events:
    - customer.subscription.created  -> set tier from plan
    - customer.subscription.updated  -> update tier from plan
    - customer.subscription.deleted  -> downgrade to starter

    Unrecognised events return 200 with action=ignored.
    Must complete within 3 seconds (pure DB ops, no external calls).
    """
    result = await handle_stripe_event(
        db=db,
        event_type=payload.type,
        event_data=payload.data,
    )

    return BillingWebhookResponse(
        received=True,
        action=result.get("action", "unknown"),
        tenant_id=result.get("tenant_id"),
    )


@router.post(
    "/tenants/{tenant_id}/suspend",
    response_model=SuspendResponse,
    summary="Suspend a tenant — their API calls return 402 (SAAS-04)",
    responses={
        200: {"description": "Tenant suspended"},
        404: {"description": "Tenant not found"},
        409: {"description": "Tenant already suspended"},
    },
)
async def saas_suspend_tenant(
    tenant_id: uuid.UUID,
    request: SuspendRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Suspend a tenant. Sets status=suspended on the SoulTenant row.
    FeatureGateMiddleware (Phase 10+) will check status and return 402 for
    suspended tenants. Also suspends all active soulkeys for the tenant.
    """
    result = await db.execute(
        select(SoulTenant).where(SoulTenant.id == tenant_id)
    )
    tenant = result.scalar_one_or_none()
    if tenant is None:
        raise HTTPException(status_code=404, detail=f"Tenant {tenant_id} not found")
    if tenant.status == "suspended":
        raise HTTPException(status_code=409, detail="Tenant is already suspended")

    now = datetime.now(timezone.utc)
    meta = tenant.metadata_ or {}
    meta["suspension_history"] = meta.get("suspension_history", [])
    meta["suspension_history"].append({
        "suspended_at": now.isoformat(),
        "suspended_by": request.suspended_by,
        "reason": request.reason,
    })

    await db.execute(
        update(SoulTenant)
        .where(SoulTenant.id == tenant_id)
        .values(status="suspended", metadata=meta, updated_at=now)
    )

    # Suspend all active soulkeys for this tenant
    await db.execute(
        update(Soulkey)
        .where(Soulkey.tenant_id == tenant_id, Soulkey.status == "active")
        .values(
            status="suspended",
            suspended_at=now,
            suspended_by=request.suspended_by,
        )
    )

    # Audit log
    audit = AuditLog(
        tenant_id=tenant_id,
        event_type="saas.tenant.suspended",
        resource="tenant",
        action="suspend",
        scope="admin",
        decision="allow",
        reason=request.reason or "SaaS operator suspension",
        context={"suspended_by": request.suspended_by},
    )
    db.add(audit)

    logger.info(
        "saas.tenant.suspended",
        tenant_id=str(tenant_id),
        suspended_by=request.suspended_by,
        reason=request.reason,
    )

    return SuspendResponse(
        tenant_id=tenant_id,
        status="suspended",
        suspended_at=now,
        reason=request.reason,
    )


@router.post(
    "/tenants/{tenant_id}/reactivate",
    response_model=ReactivateResponse,
    summary="Reactivate a suspended tenant (SAAS-04)",
    responses={
        200: {"description": "Tenant reactivated with grace-period log entry"},
        404: {"description": "Tenant not found"},
        409: {"description": "Tenant is not suspended"},
    },
)
async def saas_reactivate_tenant(
    tenant_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Reactivate a suspended tenant. Sets status=active and reinstates all
    soulkeys that were suspended during tenant suspension (those suspended_by
    starts with 'saas_operator' — keys individually suspended for other reasons
    remain suspended and must be reinstated separately).
    Logs a grace_period entry in tenant metadata for billing reconciliation.
    """
    result = await db.execute(
        select(SoulTenant).where(SoulTenant.id == tenant_id)
    )
    tenant = result.scalar_one_or_none()
    if tenant is None:
        raise HTTPException(status_code=404, detail=f"Tenant {tenant_id} not found")
    if tenant.status != "suspended":
        raise HTTPException(status_code=409, detail=f"Tenant is not suspended (current status: {tenant.status})")

    now = datetime.now(timezone.utc)
    meta = tenant.metadata_ or {}

    # Calculate grace period (time since last suspension)
    grace_start = None
    suspension_history = meta.get("suspension_history", [])
    if suspension_history:
        last = suspension_history[-1]
        grace_start = last.get("suspended_at")

    meta["grace_period_log"] = meta.get("grace_period_log", [])
    meta["grace_period_log"].append({
        "reactivated_at": now.isoformat(),
        "grace_start": grace_start,
        "grace_end": now.isoformat(),
    })

    await db.execute(
        update(SoulTenant)
        .where(SoulTenant.id == tenant_id)
        .values(status="active", metadata=meta, updated_at=now)
    )

    # Reinstate soulkeys suspended by saas_operator (tenant-level suspension)
    await db.execute(
        update(Soulkey)
        .where(
            Soulkey.tenant_id == tenant_id,
            Soulkey.status == "suspended",
            Soulkey.suspended_by == "saas_operator",
        )
        .values(status="active", suspended_at=None, suspended_by=None)
    )

    # Audit log
    audit = AuditLog(
        tenant_id=tenant_id,
        event_type="saas.tenant.reactivated",
        resource="tenant",
        action="reactivate",
        scope="admin",
        decision="allow",
        reason="SaaS operator reactivation",
        context={"grace_start": grace_start, "reactivated_at": now.isoformat()},
    )
    db.add(audit)

    logger.info(
        "saas.tenant.reactivated",
        tenant_id=str(tenant_id),
        grace_start=grace_start,
    )

    return ReactivateResponse(
        tenant_id=tenant_id,
        status="active",
        reactivated_at=now,
        grace_period_logged=True,
    )
