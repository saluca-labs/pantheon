"""
Partner channel management router.

Endpoints:
  POST /v1/partner/invitations          -- create invitation (admin only)
  POST /v1/partner/onboard              -- onboard using invitation token
  GET  /v1/partner/me                   -- partner dashboard data
  GET  /v1/partner/referrals            -- list referred tenants
"""

import uuid
import structlog
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.connection import get_db
from src.database.models import SoulPartner, SoulTenant
from src.auth.rbac import require_permission
from src.partner.invitation import create_invitation, validate_and_consume_invitation, generate_referral_code
from src.partner.connect import create_connect_account, create_onboarding_link, create_dashboard_link, get_account_status
from src.partner.promo import create_partner_coupon, create_promo_code, list_partner_promo_codes
from src.partner.commissions import calculate_split
from src.middleware.tenant import create_tenant, provision_tenant_encryption
from src.auth.soulkey import issue_soulkey
from src.tier import DEFAULT_TIER

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1/partner", tags=["Partner Channel"])


# --- Schemas ---

class CreateInvitationRequest(BaseModel):
    partner_name: str = Field(..., min_length=2, max_length=255)
    contact_email: str = Field(..., min_length=5)
    commission_rate: float = Field(0.40, ge=0.0, le=1.0)
    parent_partner_id: Optional[uuid.UUID] = None
    ttl_days: int = Field(30, ge=1, le=365)

class CreateInvitationResponse(BaseModel):
    token: str = Field(description="One-time invitation token. Send to partner securely.")
    token_id: str
    partner_name: str
    contact_email: str
    commission_rate: float
    expires_at: str

class OnboardRequest(BaseModel):
    invitation_token: str = Field(..., description="Invitation token received from Saluca")

class OnboardResponse(BaseModel):
    partner_id: str
    tenant_id: str
    referral_code: str
    raw_key: str = Field(description="Admin soulkey -- shown once. Save immediately.")
    status: str
    commission_rate: float
    next_step: str = Field(description="URL to complete Stripe Connect onboarding")

class PartnerDashboard(BaseModel):
    partner_id: str
    name: str
    referral_code: str
    commission_rate: float
    stripe_connect_status: str
    status: str
    total_referrals: int
    active_referrals: int

class ReferralDetail(BaseModel):
    tenant_id: str
    tenant_name: str
    tier: str
    status: str
    created_at: Optional[str]

class ConnectOnboardResponse(BaseModel):
    account_id: str
    onboarding_url: str

class ConnectStatusResponse(BaseModel):
    account_id: str
    charges_enabled: bool
    payouts_enabled: bool
    details_submitted: bool
    requirements: list[str]

class CreatePromoRequest(BaseModel):
    code: str = Field(..., min_length=3, max_length=30, description="Promo code string (e.g., ACME-SEC-20)")
    discount_percent: float = Field(..., ge=1.0, le=99.0)
    duration_months: int = Field(12, ge=1, le=60)
    product_ids: Optional[list[str]] = None
    max_redemptions: Optional[int] = None

class PromoCodeResponse(BaseModel):
    promo_code_id: str
    code: str

class CommissionSplitResponse(BaseModel):
    platform_rate: float
    seller_rate: float
    seller_net_rate: float
    recruiter_rate: float
    is_cascading: bool


# --- Endpoints ---

@router.post(
    "/invitations",
    response_model=CreateInvitationResponse,
    summary="Create partner invitation (admin only)",
    dependencies=[Depends(require_permission("partners:create"))],
)
async def create_partner_invitation(
    body: CreateInvitationRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> CreateInvitationResponse:
    """Create a one-time invitation token for a new partner. Admin-only."""
    soulkey = getattr(request.state, "rbac_soulkey", None)
    created_by = f"soulkey:{soulkey.id}" if soulkey else "admin"

    result = await create_invitation(
        db,
        partner_name=body.partner_name,
        contact_email=body.contact_email,
        created_by=created_by,
        commission_rate=body.commission_rate,
        parent_partner_id=body.parent_partner_id,
        ttl_days=body.ttl_days,
    )
    return CreateInvitationResponse(**result)


@router.post(
    "/onboard",
    response_model=OnboardResponse,
    summary="Onboard as a partner using invitation token",
)
async def partner_onboard(
    body: OnboardRequest,
    db: AsyncSession = Depends(get_db),
) -> OnboardResponse:
    """
    Use an invitation token to complete partner onboarding.
    Creates: tenant, soulkey, partner record.
    Returns: referral code + admin soulkey + Stripe Connect onboarding URL.
    """
    # Validate and consume invitation
    inv = await validate_and_consume_invitation(db, body.invitation_token)
    if not inv:
        raise HTTPException(status_code=403, detail="Invalid, expired, or already-used invitation token")

    referral_code = generate_referral_code(inv["partner_name"])

    # Create partner tenant (MSSP tier for resellers)
    tenant = await create_tenant(
        db,
        name=inv["partner_name"],
        slug=referral_code,
        tier="mssp",
        metadata={"partner": True, "contact_email": inv["contact_email"]},
    )
    await db.flush()

    # Provision DEK
    await provision_tenant_encryption(db, str(tenant.id), tier="mssp")

    # Issue admin soulkey
    raw_key, soulkey = await issue_soulkey(
        db=db,
        tenant_id=tenant.id,
        persona_id="admin",
        tenant_short=referral_code[:8],
        label=f"Partner admin key for {inv['partner_name']}",
        metadata={"provisioned_by": "partner_onboard", "partner": True},
    )

    # Create partner record
    now = datetime.now(timezone.utc)
    partner = SoulPartner(
        tenant_id=tenant.id,
        name=inv["partner_name"],
        contact_email=inv["contact_email"],
        commission_rate=inv["commission_rate"],
        referral_code=referral_code,
        parent_partner_id=uuid.UUID(inv["parent_partner_id"]) if inv.get("parent_partner_id") else None,
        status="active",
        approved_at=now,
        approved_by="invitation_system",
    )
    db.add(partner)

    # Update invitation with resulting partner ID
    await db.execute(text(
        "UPDATE _partner_invitations SET resulting_partner_id = :pid WHERE id = :tid"
    ), {"pid": str(partner.id), "tid": inv["token_id"]})

    await db.flush()

    # Audit log
    from src.database.models import AuditLog
    audit = AuditLog(
        tenant_id=tenant.id,
        event_type="partner.onboarded",
        soulkey_id=soulkey.id,
        persona_id="admin",
        resource="partner",
        action="onboard",
        scope="system",
        decision="allow",
        reason=f"Partner {inv['partner_name']} onboarded via invitation",
        context={
            "referral_code": referral_code,
            "commission_rate": inv["commission_rate"],
            "invitation_token_id": inv["token_id"],
        },
    )
    db.add(audit)

    logger.info(
        "partner.onboarded",
        partner_id=str(partner.id),
        tenant_id=str(tenant.id),
        referral_code=referral_code,
    )

    # Stripe Connect onboarding link would go here
    # For now, return a placeholder -- B1 will implement the real Connect flow
    connect_url = f"https://tiresias.network/partner/connect?partner_id={partner.id}"

    return OnboardResponse(
        partner_id=str(partner.id),
        tenant_id=str(tenant.id),
        referral_code=referral_code,
        raw_key=raw_key,
        status="active",
        commission_rate=inv["commission_rate"],
        next_step=connect_url,
    )


@router.get(
    "/me",
    response_model=PartnerDashboard,
    summary="Partner dashboard data",
)
async def partner_dashboard(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> PartnerDashboard:
    """Get partner dashboard summary."""
    tenant_id_header = request.headers.get("X-Tenant-ID")
    if not tenant_id_header:
        raise HTTPException(status_code=403, detail="X-Tenant-ID required")

    try:
        tid = uuid.UUID(tenant_id_header)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tenant ID")

    result = await db.execute(select(SoulPartner).where(SoulPartner.tenant_id == tid))
    partner = result.scalar_one_or_none()
    if not partner:
        raise HTTPException(status_code=404, detail="No partner record for this tenant")

    # Count referrals
    ref_result = await db.execute(text("""
        SELECT count(*), count(*) FILTER (WHERE status = 'active')
        FROM _soul_tenants
        WHERE parent_tenant_id = :tid
    """), {"tid": str(tid)})
    ref_row = ref_result.first()
    total = ref_row[0] if ref_row else 0
    active = ref_row[1] if ref_row else 0

    return PartnerDashboard(
        partner_id=str(partner.id),
        name=partner.name,
        referral_code=partner.referral_code,
        commission_rate=partner.commission_rate,
        stripe_connect_status=partner.stripe_connect_status,
        status=partner.status,
        total_referrals=total,
        active_referrals=active,
    )


@router.get(
    "/referrals",
    response_model=list[ReferralDetail],
    summary="List referred tenants",
)
async def partner_referrals(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[ReferralDetail]:
    """List all tenants referred by this partner."""
    tenant_id_header = request.headers.get("X-Tenant-ID")
    if not tenant_id_header:
        raise HTTPException(status_code=403, detail="X-Tenant-ID required")

    try:
        tid = uuid.UUID(tenant_id_header)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tenant ID")

    result = await db.execute(text("""
        SELECT id, name, tier, status, created_at
        FROM _soul_tenants
        WHERE parent_tenant_id = :tid
        ORDER BY created_at DESC
    """), {"tid": str(tid)})
    rows = result.fetchall()

    return [
        ReferralDetail(
            tenant_id=str(r[0]),
            tenant_name=r[1],
            tier=r[2],
            status=r[3],
            created_at=r[4].isoformat() if r[4] else None,
        )
        for r in rows
    ]


@router.post(
    "/connect/onboard",
    response_model=ConnectOnboardResponse,
    summary="Start Stripe Connect Express onboarding",
)
async def partner_connect_onboard(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ConnectOnboardResponse:
    """Create Stripe Connect Express account and return onboarding URL."""
    tenant_id_header = request.headers.get("X-Tenant-ID")
    if not tenant_id_header:
        raise HTTPException(status_code=403, detail="X-Tenant-ID required")

    tid = uuid.UUID(tenant_id_header)
    result = await db.execute(select(SoulPartner).where(SoulPartner.tenant_id == tid))
    partner = result.scalar_one_or_none()
    if not partner:
        raise HTTPException(status_code=404, detail="No partner record found")

    if partner.stripe_connect_account_id:
        # Already has an account — just generate a new onboarding link
        url = await create_onboarding_link(partner.stripe_connect_account_id)
        return ConnectOnboardResponse(account_id=partner.stripe_connect_account_id, onboarding_url=url)

    # Create new Connect account
    account = await create_connect_account(partner.name, partner.contact_email, str(partner.id))
    partner.stripe_connect_account_id = account["account_id"]
    partner.stripe_connect_status = "pending"
    await db.flush()

    url = await create_onboarding_link(account["account_id"])
    return ConnectOnboardResponse(account_id=account["account_id"], onboarding_url=url)


@router.get(
    "/connect/status",
    response_model=ConnectStatusResponse,
    summary="Check Stripe Connect onboarding status",
)
async def partner_connect_status(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ConnectStatusResponse:
    """Check partner's Stripe Connect onboarding status."""
    tenant_id_header = request.headers.get("X-Tenant-ID")
    if not tenant_id_header:
        raise HTTPException(status_code=403, detail="X-Tenant-ID required")

    tid = uuid.UUID(tenant_id_header)
    result = await db.execute(select(SoulPartner).where(SoulPartner.tenant_id == tid))
    partner = result.scalar_one_or_none()
    if not partner or not partner.stripe_connect_account_id:
        raise HTTPException(status_code=404, detail="No Connect account found")

    status = await get_account_status(partner.stripe_connect_account_id)

    # Update stored status
    if status["charges_enabled"] and status["payouts_enabled"]:
        partner.stripe_connect_status = "active"
    elif status["details_submitted"]:
        partner.stripe_connect_status = "reviewing"
    await db.flush()

    return ConnectStatusResponse(**status)


@router.post(
    "/promo/create",
    response_model=PromoCodeResponse,
    summary="Create a partner promo code",
)
async def partner_create_promo(
    body: CreatePromoRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> PromoCodeResponse:
    """Create a promo code for partner's customers."""
    tenant_id_header = request.headers.get("X-Tenant-ID")
    if not tenant_id_header:
        raise HTTPException(status_code=403, detail="X-Tenant-ID required")

    tid = uuid.UUID(tenant_id_header)
    result = await db.execute(select(SoulPartner).where(SoulPartner.tenant_id == tid))
    partner = result.scalar_one_or_none()
    if not partner:
        raise HTTPException(status_code=404, detail="No partner record found")

    try:
        coupon = await create_partner_coupon(
            partner_id=str(partner.id),
            discount_percent=body.discount_percent,
            duration_months=body.duration_months,
            product_ids=body.product_ids,
            name=f"{partner.name} - {body.discount_percent}% off",
        )
        promo = await create_promo_code(
            coupon_id=coupon["coupon_id"],
            code=body.code,
            partner_id=str(partner.id),
            connect_account_id=partner.stripe_connect_account_id,
            max_redemptions=body.max_redemptions,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Stripe error: {exc}")

    return PromoCodeResponse(**promo)


@router.get(
    "/commissions/split",
    response_model=CommissionSplitResponse,
    summary="View commission split for this partner",
)
async def partner_commission_split(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> CommissionSplitResponse:
    """Calculate and display the commission split for this partner."""
    tenant_id_header = request.headers.get("X-Tenant-ID")
    if not tenant_id_header:
        raise HTTPException(status_code=403, detail="X-Tenant-ID required")

    tid = uuid.UUID(tenant_id_header)
    result = await db.execute(select(SoulPartner).where(SoulPartner.tenant_id == tid))
    partner = result.scalar_one_or_none()
    if not partner:
        raise HTTPException(status_code=404, detail="No partner record found")

    split = await calculate_split(db, partner.id)
    return CommissionSplitResponse(
        platform_rate=split.platform_rate,
        seller_rate=split.seller_rate,
        seller_net_rate=split.seller_net_rate,
        recruiter_rate=split.recruiter_rate,
        is_cascading=split.is_cascading,
    )
