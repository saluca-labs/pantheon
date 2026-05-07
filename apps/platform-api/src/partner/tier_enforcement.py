"""
Tier constraint enforcement for partner sub-tenant operations.

FastAPI dependency that prevents:
- Partners from creating sub-tenants with mssp/saas tier
- Sub-tenants from nesting deeper than MAX_HIERARCHY_DEPTH below a partner
- Partner sub-tenants from upgrading to mssp/saas tier
- Stripe webhooks from silently promoting sub-tenants to blocked tiers

Feature flag (env var TIER_GUARD_ENABLED):
  "enforce"  (default) -- block violations with HTTP 403
  "monitor"  -- log violations but allow the request (adds X-Tier-Guard-Warning header)
  "disabled" -- skip all checks
"""

import os
import uuid
from dataclasses import dataclass
from typing import Optional, Callable

import structlog
from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.connection import get_db
from src.database.models import SoulTenant, SoulPartner, AuditLog
from src.partner.tier_constants import (
    ALLOWED_SUBTENANT_TIERS,
    BLOCKED_SUBTENANT_TIERS,
    MAX_HIERARCHY_DEPTH,
    TC_01_BLOCKED_CHILD_TIER,
    TC_03_DEPTH_EXCEEDED,
    TC_04_UPGRADE_BLOCKED,
    TC_06_WEBHOOK_TIER_BLOCKED,
    AUDIT_EVENT_CONSTRAINT_VIOLATION,
    AUDIT_EVENT_WEBHOOK_VIOLATION,
)

logger = structlog.get_logger(__name__)


def _get_guard_mode() -> str:
    """Read the TIER_GUARD_ENABLED env var. Defaults to 'enforce'."""
    return os.environ.get("TIER_GUARD_ENABLED", "enforce").lower()


# ---------------------------------------------------------------------------
# Partner context resolution
# ---------------------------------------------------------------------------


@dataclass
class PartnerContext:
    """Resolved partner/sub-tenant context for the calling tenant."""
    is_partner: bool                # Has a SoulPartner record
    is_subtenant: bool              # Has parent_tenant_id set
    partner_id: Optional[uuid.UUID]
    partner_root_tenant_id: Optional[uuid.UUID]
    depth_below_partner: int        # 0 = is the partner, 1 = direct child, etc.
    caller_tier: str
    caller_hierarchy_depth: int


async def _resolve_partner_context(
    db: AsyncSession,
    tenant_id: uuid.UUID,
) -> Optional[PartnerContext]:
    """
    Look up whether a tenant is a partner, a sub-tenant of a partner,
    or neither. Returns a PartnerContext dataclass, or None if the
    tenant does not exist.
    """
    result = await db.execute(select(SoulTenant).where(SoulTenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        return None

    # Check if this tenant itself is a partner
    partner_result = await db.execute(
        select(SoulPartner).where(SoulPartner.tenant_id == tenant_id)
    )
    partner = partner_result.scalar_one_or_none()

    if partner:
        return PartnerContext(
            is_partner=True,
            is_subtenant=False,
            partner_id=partner.id,
            partner_root_tenant_id=tenant_id,
            depth_below_partner=0,
            caller_tier=tenant.tier,
            caller_hierarchy_depth=tenant.hierarchy_depth,
        )

    # Check if this tenant is a sub-tenant under a partner
    if tenant.parent_tenant_id:
        parent_partner_result = await db.execute(
            select(SoulPartner).where(SoulPartner.tenant_id == tenant.parent_tenant_id)
        )
        parent_partner = parent_partner_result.scalar_one_or_none()

        if parent_partner:
            # Direct child of a partner
            return PartnerContext(
                is_partner=False,
                is_subtenant=True,
                partner_id=parent_partner.id,
                partner_root_tenant_id=tenant.parent_tenant_id,
                depth_below_partner=1,
                caller_tier=tenant.tier,
                caller_hierarchy_depth=tenant.hierarchy_depth,
            )

        # Has a parent but parent is not a partner; walk up to check grandparent
        # (covers deeper nesting scenarios)
        parent_result = await db.execute(
            select(SoulTenant).where(SoulTenant.id == tenant.parent_tenant_id)
        )
        parent_tenant = parent_result.scalar_one_or_none()
        if parent_tenant and parent_tenant.parent_tenant_id:
            gp_partner_result = await db.execute(
                select(SoulPartner).where(
                    SoulPartner.tenant_id == parent_tenant.parent_tenant_id
                )
            )
            gp_partner = gp_partner_result.scalar_one_or_none()
            if gp_partner:
                return PartnerContext(
                    is_partner=False,
                    is_subtenant=True,
                    partner_id=gp_partner.id,
                    partner_root_tenant_id=parent_tenant.parent_tenant_id,
                    depth_below_partner=2,
                    caller_tier=tenant.tier,
                    caller_hierarchy_depth=tenant.hierarchy_depth,
                )

    # Not in a partner hierarchy
    return PartnerContext(
        is_partner=False,
        is_subtenant=False,
        partner_id=None,
        partner_root_tenant_id=None,
        depth_below_partner=0,
        caller_tier=tenant.tier,
        caller_hierarchy_depth=tenant.hierarchy_depth,
    )


# ---------------------------------------------------------------------------
# Audit logging
# ---------------------------------------------------------------------------


async def _log_tier_violation(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    constraint_id: str,
    action: str,
    detail: str,
    context: dict,
) -> None:
    """Write a tier constraint violation to the audit log."""
    try:
        event_type = (
            AUDIT_EVENT_WEBHOOK_VIOLATION
            if "webhook" in action
            else AUDIT_EVENT_CONSTRAINT_VIOLATION
        )
        audit = AuditLog(
            tenant_id=tenant_id,
            event_type=event_type,
            resource="tenant",
            action=action,
            scope="partner",
            decision="deny",
            reason=f"Blocked: {constraint_id} - {detail}",
            context=context,
        )
        db.add(audit)
        await db.flush()
    except Exception as exc:
        logger.error(
            "tier_guard.audit_log_failed",
            constraint_id=constraint_id,
            error=str(exc),
        )


# ---------------------------------------------------------------------------
# Violation response builder
# ---------------------------------------------------------------------------


def _build_violation_detail(
    constraint_id: str,
    action: str,
    requested_tier: str,
    reason: str,
    ctx: Optional[PartnerContext] = None,
) -> dict:
    """Build the standard 403 error body for tier constraint violations."""
    detail = {
        "detail": f"Tier constraint violation: {reason}",
        "error_code": "TIER_CONSTRAINT_VIOLATION",
        "constraint": constraint_id,
        "context": {
            "requested_tier": requested_tier,
            "action": action,
        },
    }
    if ctx:
        detail["context"].update({
            "caller_tier": ctx.caller_tier,
            "hierarchy_depth": ctx.caller_hierarchy_depth,
            "partner_id": str(ctx.partner_id) if ctx.partner_id else None,
        })
    return detail


# ---------------------------------------------------------------------------
# FastAPI dependency: require_tier_guard
# ---------------------------------------------------------------------------


def require_tier_guard(action: str = "create") -> Callable:
    """
    FastAPI dependency factory that enforces partner tier constraints.

    Usage:
        @router.post("/tenants", dependencies=[Depends(require_tier_guard("create"))])

    Args:
        action: "create" for tenant provisioning, "upgrade" for tier changes.

    Raises:
        HTTPException(403) on constraint violation (when mode is "enforce").
    """

    async def _tier_guard(
        request: Request,
        response: Response,
        db: AsyncSession = Depends(get_db),
    ) -> None:
        mode = _get_guard_mode()
        if mode == "disabled":
            return

        # Extract caller tenant ID
        tenant_id_header = request.headers.get("X-Tenant-ID")
        if not tenant_id_header:
            # No tenant context; let downstream handlers deal with auth
            return

        try:
            caller_tenant_id = uuid.UUID(tenant_id_header)
        except ValueError:
            return

        # Resolve partner context
        ctx = await _resolve_partner_context(db, caller_tenant_id)
        if ctx is None:
            return

        # Only enforce on partner hierarchies
        if not ctx.is_partner and not ctx.is_subtenant:
            return

        if action == "create":
            await _enforce_create(request, response, db, ctx, caller_tenant_id, mode)
        elif action == "upgrade":
            await _enforce_upgrade(request, response, db, ctx, caller_tenant_id, mode)

    return _tier_guard


async def _enforce_create(
    request: Request,
    response: Response,
    db: AsyncSession,
    ctx: PartnerContext,
    caller_tenant_id: uuid.UUID,
    mode: str,
) -> None:
    """Enforce tier constraints for tenant creation."""

    # Sub-tenants of partners cannot create children (depth violation)
    if ctx.is_subtenant:
        reason = (
            "Sub-tenants of partner hierarchies cannot create their own child tenants. "
            f"Maximum nesting depth is {MAX_HIERARCHY_DEPTH} level below the partner."
        )
        violation = _build_violation_detail(
            TC_03_DEPTH_EXCEEDED, "create", "", reason, ctx,
        )

        logger.warning(
            "tier_guard.depth_exceeded",
            caller_tenant_id=str(caller_tenant_id),
            depth_below_partner=ctx.depth_below_partner,
        )

        await _log_tier_violation(
            db,
            tenant_id=caller_tenant_id,
            constraint_id=TC_03_DEPTH_EXCEEDED,
            action="create",
            detail=f"Tenant at depth {ctx.depth_below_partner} attempted to create child",
            context={
                "constraint_id": TC_03_DEPTH_EXCEEDED,
                "caller_tier": ctx.caller_tier,
                "hierarchy_depth": ctx.caller_hierarchy_depth,
                "partner_id": str(ctx.partner_id) if ctx.partner_id else None,
                "endpoint": str(request.url.path),
                "method": request.method,
            },
        )

        if mode == "enforce":
            raise HTTPException(status_code=403, detail=violation)
        else:
            response.headers["X-Tier-Guard-Warning"] = (
                f"MONITOR: {TC_03_DEPTH_EXCEEDED} - depth violation"
            )
            return

    # Partner creating a child: validate requested tier
    if ctx.is_partner:
        # Read the request body to extract the requested tier
        requested_tier = await _extract_tier_from_request(request)
        if not requested_tier:
            return  # Let Pydantic validation handle missing tier

        requested_tier_lower = requested_tier.lower()

        if requested_tier_lower in BLOCKED_SUBTENANT_TIERS:
            allowed_list = ", ".join(sorted(ALLOWED_SUBTENANT_TIERS))
            reason = (
                f"MSSP partners cannot provision sub-tenants with tier '{requested_tier}'. "
                f"Allowed tiers: {allowed_list}."
            )
            violation = _build_violation_detail(
                TC_01_BLOCKED_CHILD_TIER, "create", requested_tier, reason, ctx,
            )

            logger.warning(
                "tier_guard.blocked_child_tier",
                caller_tenant_id=str(caller_tenant_id),
                requested_tier=requested_tier,
            )

            await _log_tier_violation(
                db,
                tenant_id=caller_tenant_id,
                constraint_id=TC_01_BLOCKED_CHILD_TIER,
                action="create",
                detail=f"Attempted to create sub-tenant with tier '{requested_tier}'",
                context={
                    "constraint_id": TC_01_BLOCKED_CHILD_TIER,
                    "requested_tier": requested_tier,
                    "caller_tier": ctx.caller_tier,
                    "hierarchy_depth": ctx.caller_hierarchy_depth,
                    "partner_id": str(ctx.partner_id) if ctx.partner_id else None,
                    "endpoint": str(request.url.path),
                    "method": request.method,
                },
            )

            if mode == "enforce":
                raise HTTPException(status_code=403, detail=violation)
            else:
                response.headers["X-Tier-Guard-Warning"] = (
                    f"MONITOR: {TC_01_BLOCKED_CHILD_TIER} - blocked tier '{requested_tier}'"
                )
                return

        if requested_tier_lower not in ALLOWED_SUBTENANT_TIERS:
            allowed_list = ", ".join(sorted(ALLOWED_SUBTENANT_TIERS))
            reason = (
                f"Partner sub-tenants are limited to tiers: {allowed_list}. "
                f"'{requested_tier}' is not recognized."
            )
            violation = _build_violation_detail(
                TC_01_BLOCKED_CHILD_TIER, "create", requested_tier, reason, ctx,
            )

            logger.warning(
                "tier_guard.unknown_tier",
                caller_tenant_id=str(caller_tenant_id),
                requested_tier=requested_tier,
            )

            await _log_tier_violation(
                db,
                tenant_id=caller_tenant_id,
                constraint_id=TC_01_BLOCKED_CHILD_TIER,
                action="create",
                detail=f"Attempted to create sub-tenant with unknown tier '{requested_tier}'",
                context={
                    "constraint_id": TC_01_BLOCKED_CHILD_TIER,
                    "requested_tier": requested_tier,
                    "caller_tier": ctx.caller_tier,
                    "hierarchy_depth": ctx.caller_hierarchy_depth,
                    "partner_id": str(ctx.partner_id) if ctx.partner_id else None,
                    "endpoint": str(request.url.path),
                    "method": request.method,
                },
            )

            if mode == "enforce":
                raise HTTPException(status_code=403, detail=violation)
            else:
                response.headers["X-Tier-Guard-Warning"] = (
                    f"MONITOR: {TC_01_BLOCKED_CHILD_TIER} - unknown tier '{requested_tier}'"
                )
                return

        # Tier is allowed; log success
        logger.info(
            "tier_guard.create_allowed",
            caller_tenant_id=str(caller_tenant_id),
            requested_tier=requested_tier,
        )


async def _enforce_upgrade(
    request: Request,
    response: Response,
    db: AsyncSession,
    ctx: PartnerContext,
    caller_tenant_id: uuid.UUID,
    mode: str,
) -> None:
    """Enforce tier constraints for tier upgrades."""

    # Only sub-tenants under partners are constrained on upgrades
    if not ctx.is_subtenant:
        return

    requested_tier = await _extract_tier_from_request(request)
    if not requested_tier:
        return

    requested_tier_lower = requested_tier.lower()

    if requested_tier_lower in BLOCKED_SUBTENANT_TIERS:
        reason = (
            f"Partner sub-tenants cannot be upgraded to '{requested_tier}'. "
            f"Maximum allowed tier for sub-tenants is 'enterprise'."
        )
        violation = _build_violation_detail(
            TC_04_UPGRADE_BLOCKED, "upgrade", requested_tier, reason, ctx,
        )

        logger.warning(
            "tier_guard.upgrade_blocked",
            caller_tenant_id=str(caller_tenant_id),
            requested_tier=requested_tier,
        )

        await _log_tier_violation(
            db,
            tenant_id=caller_tenant_id,
            constraint_id=TC_04_UPGRADE_BLOCKED,
            action="upgrade",
            detail=f"Sub-tenant attempted upgrade to '{requested_tier}'",
            context={
                "constraint_id": TC_04_UPGRADE_BLOCKED,
                "requested_tier": requested_tier,
                "caller_tier": ctx.caller_tier,
                "hierarchy_depth": ctx.caller_hierarchy_depth,
                "partner_id": str(ctx.partner_id) if ctx.partner_id else None,
                "endpoint": str(request.url.path),
                "method": request.method,
            },
        )

        if mode == "enforce":
            raise HTTPException(status_code=403, detail=violation)
        else:
            response.headers["X-Tier-Guard-Warning"] = (
                f"MONITOR: {TC_04_UPGRADE_BLOCKED} - blocked upgrade to '{requested_tier}'"
            )
            return

    logger.info(
        "tier_guard.upgrade_allowed",
        caller_tenant_id=str(caller_tenant_id),
        requested_tier=requested_tier,
    )


# ---------------------------------------------------------------------------
# Standalone webhook validation
# ---------------------------------------------------------------------------


async def validate_tier_for_subtenant(
    tier: str,
    parent_tenant_id: str,
    db: AsyncSession,
) -> tuple[bool, str]:
    """
    Standalone validation for non-request contexts (e.g., Stripe webhooks).

    Returns:
        (True, "")        if the tier is allowed for this sub-tenant
        (False, "reason") if the tier violates constraints
    """
    if not parent_tenant_id:
        return (True, "")

    tier_lower = tier.lower() if tier else ""

    if tier_lower in BLOCKED_SUBTENANT_TIERS:
        reason = (
            f"Partner sub-tenant cannot be set to '{tier}' tier via webhook. "
            f"Blocked tiers: {', '.join(sorted(BLOCKED_SUBTENANT_TIERS))}."
        )

        logger.critical(
            "tier_guard.webhook_blocked",
            parent_tenant_id=str(parent_tenant_id),
            attempted_tier=tier,
            constraint_id=TC_06_WEBHOOK_TIER_BLOCKED,
        )

        # Write audit log
        try:
            parent_uuid = uuid.UUID(str(parent_tenant_id))
            audit = AuditLog(
                tenant_id=parent_uuid,
                event_type=AUDIT_EVENT_WEBHOOK_VIOLATION,
                resource="tenant",
                action="webhook_tier_change",
                scope="partner",
                decision="deny",
                reason=f"Blocked: {TC_06_WEBHOOK_TIER_BLOCKED} - Stripe event attempted to set sub-tenant tier to '{tier}'",
                context={
                    "constraint_id": TC_06_WEBHOOK_TIER_BLOCKED,
                    "attempted_tier": tier,
                    "parent_tenant_id": str(parent_tenant_id),
                },
            )
            db.add(audit)
            await db.flush()
        except Exception as exc:
            logger.error("tier_guard.webhook_audit_failed", error=str(exc))

        return (False, reason)

    return (True, "")


# ---------------------------------------------------------------------------
# Request body tier extraction helper
# ---------------------------------------------------------------------------


async def _extract_tier_from_request(request: Request) -> Optional[str]:
    """
    Extract the 'tier' or 'new_tier' field from the JSON request body.
    Returns None if the body cannot be parsed or the field is absent.
    Caches the parsed body on request.state to avoid consuming the stream twice.
    """
    if hasattr(request.state, "_tier_guard_body"):
        body = request.state._tier_guard_body
    else:
        try:
            body = await request.json()
            request.state._tier_guard_body = body
        except Exception:
            return None

    if not isinstance(body, dict):
        return None

    return body.get("tier") or body.get("new_tier")
