"""
Delegation and escalation workflows.
Implements SPEC.md section 10 — temporary access grants and approval flows.
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import structlog
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import Delegation, Soulkey
from src.audit.logger import log_auth_event

logger = structlog.get_logger(__name__)

# Delegation limits
MAX_DELEGATION_TTL = 3600  # 1 hour max
MAX_ACTIVE_DELEGATIONS_PER_GRANTEE = 10


async def create_delegation(
    db: AsyncSession,
    grantor_soulkey: Soulkey,
    grantee_persona: str,
    resource: str,
    action: str,
    scope: str,
    ttl: int,
    reason: str,
) -> Delegation:
    """
    Create a temporary delegation -- expands a grantee's access.
    The grantor must have the required scope in their own policy.
    Verifies the grantor actually possesses the permissions being delegated.
    """
    # Enforce TTL limits
    if ttl > MAX_DELEGATION_TTL:
        raise ValueError(f"Delegation TTL cannot exceed {MAX_DELEGATION_TTL}s")
    if ttl <= 0:
        raise ValueError("Delegation TTL must be positive")

    # Verify grantor has the permissions being delegated
    from src.policy.loader import load_cached_policy, find_matching_rule
    grantor_policy = await load_cached_policy(
        db, grantor_soulkey.tenant_id, grantor_soulkey.persona_id
    )
    if not grantor_policy:
        raise ValueError(
            f"Grantor {grantor_soulkey.persona_id} has no policy - cannot delegate"
        )

    resource_rules = grantor_policy.resources.get(resource, [])
    matching_rule = find_matching_rule(resource_rules, action, scope)
    if not matching_rule:
        raise ValueError(
            f"Grantor {grantor_soulkey.persona_id} does not have "
            f"'{action}' permission on '{resource}:{scope}' - cannot delegate "
            f"permissions the grantor does not possess"
        )

    # Check active delegation count for grantee
    count = await db.execute(
        select(func.count(Delegation.id)).where(
            Delegation.tenant_id == grantor_soulkey.tenant_id,
            Delegation.grantee_persona == grantee_persona,
            Delegation.revoked_at.is_(None),
            Delegation.expires_at > datetime.now(timezone.utc),
        )
    )
    if (count.scalar() or 0) >= MAX_ACTIVE_DELEGATIONS_PER_GRANTEE:
        raise ValueError(
            f"Grantee {grantee_persona} has reached max active delegations"
        )

    expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl)

    delegation = Delegation(
        tenant_id=grantor_soulkey.tenant_id,
        grantor_id=grantor_soulkey.id,
        grantee_persona=grantee_persona,
        resource=resource,
        action=action,
        scope=scope,
        expires_at=expires_at,
        reason=reason,
    )
    db.add(delegation)
    await db.flush()
    await db.refresh(delegation)

    # Audit log
    await log_auth_event(
        db,
        tenant_id=grantor_soulkey.tenant_id,
        event_type="escalation_approved",
        soulkey_id=grantor_soulkey.id,
        persona_id=grantor_soulkey.persona_id,
        resource=resource,
        action=action,
        scope=scope,
        context={
            "delegation_id": str(delegation.id),
            "grantee_persona": grantee_persona,
            "ttl": ttl,
            "reason": reason,
        },
    )

    logger.info(
        "delegation.created",
        delegation_id=str(delegation.id),
        grantor=grantor_soulkey.persona_id,
        grantee=grantee_persona,
        resource=resource,
        action=action,
        ttl=ttl,
    )

    return delegation


async def revoke_delegation(
    db: AsyncSession,
    delegation_id: uuid.UUID,
    revoked_by: str,
) -> Optional[Delegation]:
    """Revoke an active delegation early."""
    result = await db.execute(
        select(Delegation).where(
            Delegation.id == delegation_id,
            Delegation.revoked_at.is_(None),
        )
    )
    delegation = result.scalar_one_or_none()
    if not delegation:
        return None

    delegation.revoked_at = datetime.now(timezone.utc)
    delegation.revoked_by = revoked_by
    await db.flush()

    logger.info(
        "delegation.revoked",
        delegation_id=str(delegation_id),
        revoked_by=revoked_by,
    )

    return delegation


async def check_delegation(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    persona_id: str,
    resource: str,
    action: str,
    scope: str,
) -> Optional[Delegation]:
    """
    Check if there's an active delegation that grants the requested access.
    Used by PDP to augment policy decisions.
    """
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Delegation).where(
            Delegation.tenant_id == tenant_id,
            Delegation.grantee_persona == persona_id,
            Delegation.resource == resource,
            Delegation.action == action,
            Delegation.revoked_at.is_(None),
            Delegation.expires_at > now,
        )
    )
    delegations = list(result.scalars().all())

    for delegation in delegations:
        # Check scope match (exact or wildcard)
        if delegation.scope == "*" or delegation.scope == scope:
            return delegation
        if delegation.scope.endswith(":*"):
            prefix = delegation.scope[:-1]
            if scope.startswith(prefix):
                return delegation

    return None


async def check_delegation_approval(
    db: AsyncSession,
    soulkey_id: uuid.UUID,
    resource: str,
    action: str,
    scope: str,
    approver_role: str,
) -> bool:
    """
    Check if there's an active delegation or approval that grants the requested access.
    Used by PDP for condition evaluation.
    """
    # Get the soulkey to determine tenant and persona
    from src.database.models import Soulkey
    result = await db.execute(
        select(Soulkey).where(Soulkey.id == soulkey_id)
    )
    soulkey = result.scalar_one_or_none()
    if not soulkey:
        return False

    # Check for active delegation that matches the request
    delegation = await check_delegation(
        db, soulkey.tenant_id, soulkey.persona_id, resource, action, scope
    )
    return delegation is not None


async def list_active_delegations(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    persona_id: Optional[str] = None,
) -> list[Delegation]:
    """List active (non-expired, non-revoked) delegations."""
    now = datetime.now(timezone.utc)
    query = select(Delegation).where(
        Delegation.tenant_id == tenant_id,
        Delegation.revoked_at.is_(None),
        Delegation.expires_at > now,
    )
    if persona_id:
        query = query.where(Delegation.grantee_persona == persona_id)

    query = query.order_by(Delegation.expires_at.asc())
    result = await db.execute(query)
    return list(result.scalars().all())


async def cleanup_expired_delegations(db: AsyncSession) -> int:
    """Clean up expired delegations (for housekeeping). Returns count."""
    from sqlalchemy import update

    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Delegation).where(
            Delegation.expires_at < now,
            Delegation.revoked_at.is_(None),
        )
    )
    expired = list(result.scalars().all())

    for d in expired:
        d.revoked_at = now
        d.revoked_by = "system:expired"

    await db.flush()

    if expired:
        logger.info("delegation.cleanup", count=len(expired))

    return len(expired)