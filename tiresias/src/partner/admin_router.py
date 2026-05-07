"""
Partner admin management router.

Endpoints:
  GET    /v1/admin/partners                          -- list partners (filtered, paginated)
  GET    /v1/admin/partners/{partner_id}              -- partner detail
  POST   /v1/admin/partners/{partner_id}/deactivate   -- suspend partner
  POST   /v1/admin/partners/{partner_id}/reactivate   -- reactivate partner
  PATCH  /v1/admin/partners/{partner_id}/terms         -- update partner terms
  GET    /v1/admin/partners/{partner_id}/audit         -- audit trail
  GET    /v1/admin/invitations                         -- list invitations
  DELETE /v1/admin/invitations/{invitation_id}         -- revoke invitation
"""

import math
import uuid
import structlog
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.connection import get_db
from src.database.models import SoulPartner, SoulTenant, AuditLog
from src.auth.rbac import require_permission
from src.partner.admin_schemas import (
    PartnerListParams,
    DeactivatePartnerRequest,
    ReactivatePartnerRequest,
    UpdatePartnerTermsRequest,
    RevokeInvitationRequest,
    PartnerSummary,
    PartnerDetail,
    PartnerListResponse,
    ReferralInfo,
    AuditEntry,
    InvitationSummary,
    InvitationListResponse,
    AdminActionResponse,
)
from src.partner.admin_notifications import (
    notify_partner_deactivated,
    notify_partner_reactivated,
    notify_partner_terms_updated,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1/admin/partners", tags=["Partner Admin"])
invitation_router = APIRouter(prefix="/v1/admin/invitations", tags=["Partner Admin"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _actor_label(request: Request) -> str:
    """Build an actor label from the authenticated soulkey on the request."""
    soulkey = getattr(request.state, "rbac_soulkey", None)
    if soulkey:
        return f"soulkey:{soulkey.id}"
    return "admin"


def _iso(dt: Optional[datetime]) -> Optional[str]:
    """Safely convert a datetime to ISO-8601 string."""
    return dt.isoformat() if dt else None


async def _get_partner_or_404(
    db: AsyncSession, partner_id: uuid.UUID
) -> SoulPartner:
    """Load a partner by ID or raise 404."""
    result = await db.execute(
        select(SoulPartner).where(SoulPartner.id == partner_id)
    )
    partner = result.scalar_one_or_none()
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    return partner


# ---------------------------------------------------------------------------
# 1. GET /v1/admin/partners -- List partners
# ---------------------------------------------------------------------------

@router.get(
    "",
    response_model=PartnerListResponse,
    summary="List all partners (admin)",
    dependencies=[Depends(require_permission("partners:admin"))],
)
async def list_partners(
    request: Request,
    status: Optional[str] = Query(None, description="Filter by status"),
    partner_type: Optional[str] = Query(None, description="Filter by partner type"),
    search: Optional[str] = Query(None, description="Search name, email, referral_code"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> PartnerListResponse:
    """List partners with optional filtering and pagination."""

    # Build base query
    conditions: list[str] = []
    params: dict = {}

    if status:
        conditions.append("p.status = :status")
        params["status"] = status

    if partner_type:
        conditions.append("p.partner_type = :partner_type")
        params["partner_type"] = partner_type

    if search:
        conditions.append(
            "(p.name ILIKE :search OR p.contact_email ILIKE :search OR p.referral_code ILIKE :search)"
        )
        params["search"] = f"%{search}%"

    where_clause = (" AND ".join(conditions)) if conditions else "1=1"

    # Count total
    count_sql = f"""
        SELECT count(*)
        FROM _soul_partners p
        WHERE {where_clause}
    """
    count_result = await db.execute(text(count_sql), params)
    total = count_result.scalar() or 0

    # Paginated query with referral count subquery
    offset = (page - 1) * per_page
    data_sql = f"""
        SELECT
            p.id,
            p.name,
            p.contact_email,
            p.partner_type,
            p.status,
            p.referral_code,
            p.commission_rate,
            p.created_at,
            (
                SELECT count(*)
                FROM _soul_tenants t
                WHERE t.parent_tenant_id = p.tenant_id
            ) AS referral_count
        FROM _soul_partners p
        WHERE {where_clause}
        ORDER BY p.created_at DESC
        LIMIT :limit OFFSET :offset
    """
    params["limit"] = per_page
    params["offset"] = offset

    result = await db.execute(text(data_sql), params)
    rows = result.fetchall()

    items = [
        PartnerSummary(
            id=str(r[0]),
            name=r[1],
            contact_email=r[2],
            partner_type=r[3],
            status=r[4],
            referral_code=r[5],
            commission_rate=r[6],
            created_at=_iso(r[7]),
            referral_count=r[8] or 0,
            mrr_attributed=None,
        )
        for r in rows
    ]

    pages = math.ceil(total / per_page) if total > 0 else 0

    logger.info(
        "admin.partners.list",
        total=total,
        page=page,
        per_page=per_page,
        filters={"status": status, "partner_type": partner_type, "search": search},
    )

    return PartnerListResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


# ---------------------------------------------------------------------------
# 2. GET /v1/admin/partners/{partner_id} -- Partner detail
# ---------------------------------------------------------------------------

@router.get(
    "/{partner_id}",
    response_model=PartnerDetail,
    summary="Get partner detail (admin)",
    dependencies=[Depends(require_permission("partners:admin"))],
)
async def get_partner_detail(
    partner_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> PartnerDetail:
    """Get full partner detail including referrals and recent audit entries."""
    partner = await _get_partner_or_404(db, partner_id)

    # Referral tenants
    ref_result = await db.execute(text("""
        SELECT id, name, tier, status, created_at
        FROM _soul_tenants
        WHERE parent_tenant_id = :tid
        ORDER BY created_at DESC
    """), {"tid": str(partner.tenant_id)})
    ref_rows = ref_result.fetchall()

    referrals = [
        ReferralInfo(
            tenant_id=str(r[0]),
            tenant_name=r[1],
            tier=r[2],
            status=r[3],
            created_at=_iso(r[4]),
        )
        for r in ref_rows
    ]

    # Last 50 audit entries related to this partner
    audit_result = await db.execute(text("""
        SELECT id, event_type, persona_id, context, created_at
        FROM _soulauth_audit
        WHERE (
            tenant_id = :tid
            AND event_type LIKE 'partner.%%'
        )
        ORDER BY created_at DESC
        LIMIT 50
    """), {"tid": str(partner.tenant_id)})
    audit_rows = audit_result.fetchall()

    audit_entries = [
        AuditEntry(
            id=str(r[0]),
            event_type=r[1],
            actor=r[2],
            detail=r[3],
            created_at=_iso(r[4]),
        )
        for r in audit_rows
    ]

    # Stripe Connect status (best-effort; fields may not exist on all partners)
    charges_enabled = None
    payouts_enabled = None
    if partner.stripe_connect_account_id:
        try:
            from src.partner.connect import get_account_status
            connect_status = await get_account_status(partner.stripe_connect_account_id)
            charges_enabled = connect_status.get("charges_enabled")
            payouts_enabled = connect_status.get("payouts_enabled")
        except Exception:
            logger.warning(
                "admin.partner_detail.connect_status_failed",
                partner_id=str(partner.id),
            )

    return PartnerDetail(
        id=str(partner.id),
        name=partner.name,
        contact_email=partner.contact_email,
        partner_type=getattr(partner, "partner_type", None),
        status=partner.status,
        referral_code=partner.referral_code,
        commission_rate=partner.commission_rate,
        created_at=_iso(partner.created_at),
        referral_count=len(referrals),
        mrr_attributed=None,
        stripe_connect_account_id=partner.stripe_connect_account_id,
        charges_enabled=charges_enabled,
        payouts_enabled=payouts_enabled,
        deactivated_at=_iso(getattr(partner, "deactivated_at", None)),
        deactivated_reason=getattr(partner, "deactivated_reason", None),
        deactivated_by=getattr(partner, "deactivated_by", None),
        referrals=referrals,
        audit_entries=audit_entries,
    )


# ---------------------------------------------------------------------------
# 3. POST /v1/admin/partners/{partner_id}/deactivate -- Suspend partner
# ---------------------------------------------------------------------------

@router.post(
    "/{partner_id}/deactivate",
    response_model=AdminActionResponse,
    summary="Deactivate (suspend) a partner",
    dependencies=[Depends(require_permission("partners:admin"))],
)
async def deactivate_partner(
    partner_id: uuid.UUID,
    body: DeactivatePartnerRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AdminActionResponse:
    """Suspend a partner. Freezes payouts and prevents new referrals."""
    partner = await _get_partner_or_404(db, partner_id)

    if partner.status == "suspended":
        raise HTTPException(status_code=409, detail="Partner is already suspended")

    actor = _actor_label(request)
    now = datetime.now(timezone.utc)

    # Update partner record
    partner.status = "suspended"
    # Use setattr for columns that may come from a later migration
    try:
        partner.deactivated_at = now
    except AttributeError:
        pass
    try:
        partner.deactivated_reason = body.reason
    except AttributeError:
        pass
    try:
        partner.deactivated_by = actor
    except AttributeError:
        pass

    # Also store in metadata as fallback
    meta = partner.metadata_ or {}
    meta["deactivated_at"] = now.isoformat()
    meta["deactivated_reason"] = body.reason
    meta["deactivated_by"] = actor
    partner.metadata_ = meta

    # Audit log
    audit = AuditLog(
        tenant_id=partner.tenant_id,
        event_type="partner.deactivated",
        persona_id="admin",
        resource="partner",
        action="deactivate",
        scope="system",
        decision="allow",
        reason=body.reason,
        context={
            "partner_id": str(partner.id),
            "partner_name": partner.name,
            "deactivated_by": actor,
        },
    )
    db.add(audit)
    await db.flush()

    # Notification (fire-and-forget placeholder)
    await notify_partner_deactivated(
        partner=partner,
        reason=body.reason,
    )

    logger.info(
        "admin.partner.deactivated",
        partner_id=str(partner.id),
        reason=body.reason,
        actor=actor,
    )

    return AdminActionResponse(
        success=True,
        message=f"Partner '{partner.name}' has been suspended.",
        partner_id=str(partner.id),
    )


# ---------------------------------------------------------------------------
# 4. POST /v1/admin/partners/{partner_id}/reactivate -- Reactivate partner
# ---------------------------------------------------------------------------

@router.post(
    "/{partner_id}/reactivate",
    response_model=AdminActionResponse,
    summary="Reactivate a suspended partner",
    dependencies=[Depends(require_permission("partners:admin"))],
)
async def reactivate_partner(
    partner_id: uuid.UUID,
    body: ReactivatePartnerRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AdminActionResponse:
    """Reactivate a suspended partner. Restores payouts and referral capability."""
    partner = await _get_partner_or_404(db, partner_id)

    if partner.status != "suspended":
        raise HTTPException(status_code=409, detail="Partner is not suspended")

    actor = _actor_label(request)
    now = datetime.now(timezone.utc)

    # Clear deactivation state
    partner.status = "active"
    try:
        partner.deactivated_at = None
    except AttributeError:
        pass
    try:
        partner.deactivated_reason = None
    except AttributeError:
        pass
    try:
        partner.deactivated_by = None
    except AttributeError:
        pass

    # Clear from metadata as well
    meta = partner.metadata_ or {}
    meta.pop("deactivated_at", None)
    meta.pop("deactivated_reason", None)
    meta.pop("deactivated_by", None)
    meta["reactivated_at"] = now.isoformat()
    meta["reactivated_by"] = actor
    if body.reason:
        meta["reactivation_reason"] = body.reason
    partner.metadata_ = meta

    # Audit log
    audit = AuditLog(
        tenant_id=partner.tenant_id,
        event_type="partner.reactivated",
        persona_id="admin",
        resource="partner",
        action="reactivate",
        scope="system",
        decision="allow",
        reason=body.reason or "Reactivated by admin",
        context={
            "partner_id": str(partner.id),
            "partner_name": partner.name,
            "reactivated_by": actor,
        },
    )
    db.add(audit)
    await db.flush()

    # Notification
    await notify_partner_reactivated(
        partner=partner,
    )

    logger.info(
        "admin.partner.reactivated",
        partner_id=str(partner.id),
        actor=actor,
    )

    return AdminActionResponse(
        success=True,
        message=f"Partner '{partner.name}' has been reactivated.",
        partner_id=str(partner.id),
    )


# ---------------------------------------------------------------------------
# 5. PATCH /v1/admin/partners/{partner_id}/terms -- Update partner terms
# ---------------------------------------------------------------------------

@router.patch(
    "/{partner_id}/terms",
    response_model=AdminActionResponse,
    summary="Update partner terms",
    dependencies=[Depends(require_permission("partners:admin"))],
)
async def update_partner_terms(
    partner_id: uuid.UUID,
    body: UpdatePartnerTermsRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AdminActionResponse:
    """Update partner commission rate, payout frequency, or partner type."""
    partner = await _get_partner_or_404(db, partner_id)

    # Collect provided fields
    has_updates = False
    changes: dict = {}

    if body.commission_rate is not None:
        old_val = partner.commission_rate
        partner.commission_rate = body.commission_rate
        changes["commission_rate"] = {"old": old_val, "new": body.commission_rate}
        has_updates = True

    if body.payout_frequency is not None:
        meta = partner.metadata_ or {}
        old_val = meta.get("payout_frequency")
        meta["payout_frequency"] = body.payout_frequency
        partner.metadata_ = meta
        changes["payout_frequency"] = {"old": old_val, "new": body.payout_frequency}
        has_updates = True

    if body.partner_type is not None:
        old_val = getattr(partner, "partner_type", None)
        try:
            partner.partner_type = body.partner_type.value
        except AttributeError:
            pass
        changes["partner_type"] = {"old": old_val, "new": body.partner_type.value}
        has_updates = True

    if not has_updates:
        raise HTTPException(status_code=400, detail="No fields provided for update")

    actor = _actor_label(request)

    # Audit log with old and new values
    audit = AuditLog(
        tenant_id=partner.tenant_id,
        event_type="partner.terms_updated",
        persona_id="admin",
        resource="partner",
        action="update_terms",
        scope="system",
        decision="allow",
        reason=f"Terms updated by {actor}",
        context={
            "partner_id": str(partner.id),
            "partner_name": partner.name,
            "changes": changes,
            "updated_by": actor,
        },
    )
    db.add(audit)
    await db.flush()

    # Notification with change summary
    await notify_partner_terms_updated(
        partner=partner,
        changes=changes,
    )

    logger.info(
        "admin.partner.terms_updated",
        partner_id=str(partner.id),
        changes=changes,
        actor=actor,
    )

    return AdminActionResponse(
        success=True,
        message=f"Partner '{partner.name}' terms updated: {', '.join(changes.keys())}.",
        partner_id=str(partner.id),
    )


# ---------------------------------------------------------------------------
# 6. GET /v1/admin/partners/{partner_id}/audit -- Partner audit trail
# ---------------------------------------------------------------------------

@router.get(
    "/{partner_id}/audit",
    response_model=list[AuditEntry],
    summary="Get partner audit trail",
    dependencies=[Depends(require_permission("partners:admin"))],
)
async def get_partner_audit(
    partner_id: uuid.UUID,
    request: Request,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> list[AuditEntry]:
    """Get paginated audit trail for a specific partner."""
    partner = await _get_partner_or_404(db, partner_id)

    offset = (page - 1) * per_page

    result = await db.execute(text("""
        SELECT id, event_type, persona_id, context, created_at
        FROM _soulauth_audit
        WHERE (
            tenant_id = :tid
            AND event_type LIKE 'partner.%%'
        )
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :offset
    """), {
        "tid": str(partner.tenant_id),
        "limit": per_page,
        "offset": offset,
    })
    rows = result.fetchall()

    return [
        AuditEntry(
            id=str(r[0]),
            event_type=r[1],
            actor=r[2],
            detail=r[3],
            created_at=_iso(r[4]),
        )
        for r in rows
    ]


# ---------------------------------------------------------------------------
# 7. GET /v1/admin/invitations -- List all invitations
# ---------------------------------------------------------------------------

@invitation_router.get(
    "",
    response_model=InvitationListResponse,
    summary="List all partner invitations",
    dependencies=[Depends(require_permission("partners:admin"))],
)
async def list_invitations(
    request: Request,
    status: Optional[str] = Query(None, description="Filter: active, consumed, expired, revoked"),
    db: AsyncSession = Depends(get_db),
) -> InvitationListResponse:
    """List all partner invitations with optional status filter."""
    # Lazy expiration: mark active invitations past expires_at as expired
    await db.execute(text("""
        UPDATE _partner_invitations
        SET status = 'expired'
        WHERE status = 'active' AND expires_at < now()
    """))
    await db.flush()

    # Security: Column whitelist for SQL injection prevention
    ALLOWED_INVITATION_COLUMNS = frozenset({"status", "partner_type", "contact_email"})

    conditions: list[str] = []
    params: dict = {}

    if status and status in ALLOWED_INVITATION_COLUMNS:
        conditions.append("status = :status")
        params["status"] = status

    where_clause = (" AND ".join(conditions)) if conditions else "1=1"

    # Security: Parameterized queries - values never interpolated into SQL
    count_result = await db.execute(
        text(f"SELECT count(*) FROM _partner_invitations WHERE {where_clause}"),
        params,
    )
    total = count_result.scalar() or 0

    data_result = await db.execute(text("""
        SELECT
            id,
            token_hash,
            partner_name,
            contact_email,
            partner_type,
            commission_rate,
            status,
            created_at,
            expires_at,
            consumed_at
        FROM _partner_invitations
        WHERE """ + where_clause + """
        ORDER BY created_at DESC
    """), params)
    rows = data_result.fetchall()

    items = [
        InvitationSummary(
            id=str(r[0]),
            token_hash=str(r[1])[-8:] if r[1] else "",
            partner_name=r[2],
            contact_email=r[3],
            partner_type=r[4],
            commission_rate=r[5],
            status=r[6],
            created_at=_iso(r[7]),
            expires_at=_iso(r[8]),
            consumed_at=_iso(r[9]),
        )
        for r in rows
    ]

    logger.info("admin.invitations.list", total=total, status_filter=status)

    return InvitationListResponse(items=items, total=total)


# ---------------------------------------------------------------------------
# 8. DELETE /v1/admin/invitations/{invitation_id} -- Revoke invitation
# ---------------------------------------------------------------------------

@invitation_router.delete(
    "/{invitation_id}",
    response_model=AdminActionResponse,
    summary="Revoke a partner invitation",
    dependencies=[Depends(require_permission("partners:admin"))],
)
async def revoke_invitation(
    invitation_id: str,
    request: Request,
    body: Optional[RevokeInvitationRequest] = None,
    db: AsyncSession = Depends(get_db),
) -> AdminActionResponse:
    """Revoke an active invitation. Does not delete, sets status to revoked."""
    # Look up invitation
    result = await db.execute(text("""
        SELECT id, status, partner_name, contact_email
        FROM _partner_invitations
        WHERE id = :iid
    """), {"iid": invitation_id})
    row = result.first()

    if not row:
        raise HTTPException(status_code=404, detail="Invitation not found")

    inv_id, inv_status, partner_name, contact_email = row[0], row[1], row[2], row[3]

    if inv_status == "consumed":
        raise HTTPException(status_code=409, detail="Invitation has already been consumed")
    if inv_status == "revoked":
        raise HTTPException(status_code=409, detail="Invitation is already revoked")
    if inv_status == "expired":
        raise HTTPException(status_code=409, detail="Invitation has already expired")

    actor = _actor_label(request)
    reason = body.reason if body else None

    # Revoke
    await db.execute(text("""
        UPDATE _partner_invitations
        SET status = 'revoked'
        WHERE id = :iid
    """), {"iid": invitation_id})

    # Audit log (use a system-level tenant ID since invitations are pre-tenant)
    audit = AuditLog(
        tenant_id=uuid.UUID("00000000-0000-0000-0000-000000000000"),
        event_type="partner.invitation_revoked",
        persona_id="admin",
        resource="partner_invitation",
        action="revoke",
        scope="system",
        decision="allow",
        reason=reason or "Invitation revoked by admin",
        context={
            "invitation_id": str(inv_id),
            "partner_name": partner_name,
            "contact_email": contact_email,
            "revoked_by": actor,
        },
    )
    db.add(audit)
    await db.flush()

    logger.info(
        "admin.invitation.revoked",
        invitation_id=str(inv_id),
        partner_name=partner_name,
        actor=actor,
    )

    return AdminActionResponse(
        success=True,
        message=f"Invitation for '{partner_name}' has been revoked.",
        partner_id=str(inv_id),
    )
