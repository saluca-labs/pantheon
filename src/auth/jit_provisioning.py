"""
JIT (Just-In-Time) user provisioning for OIDC SSO.
Creates or updates _soul_users from validated OIDC claims.
"""

import structlog
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import SoulUser, SoulIdPConfig

logger = structlog.get_logger(__name__)

# Group-to-role claim key used in IdP tokens (common: "groups", "roles")
GROUP_CLAIMS = ["groups", "roles", "cognito:groups"]


def _resolve_role_from_groups(
    groups: list[str],
    group_role_map: dict,
    default_role: str = "viewer",
) -> str:
    """
    Map IdP groups to Tiresias admin roles using group_role_map.
    Returns the highest-ranked role found, or default_role.
    """
    rank = {"viewer": 0, "operator": 1, "admin": 2, "owner": 3}
    best_role = default_role
    best_rank = rank.get(default_role, 0)

    for group in groups:
        role = group_role_map.get(group)
        if role and rank.get(role, -1) > best_rank:
            best_role = role
            best_rank = rank[role]

    return best_role


def _extract_groups_from_claims(claims: dict) -> list[str]:
    """Extract group membership from OIDC claims."""
    for key in GROUP_CLAIMS:
        val = claims.get(key)
        if isinstance(val, list):
            return [str(g) for g in val]
        if isinstance(val, str):
            return [val]
    return []


async def jit_provision_user(
    db: AsyncSession,
    tenant_id: UUID,
    idp_config: SoulIdPConfig,
    claims: dict,
) -> SoulUser:
    """
    JIT provision or update a portal user from validated OIDC claims.

    Flow:
    1. Lookup by (tenant_id, idp_provider, idp_sub)
    2. If not found: create with default role 'viewer', apply group_role_map
    3. If found: update last_login, re-apply group_role_map
    4. Reject if user.status == 'suspended'

    Returns the SoulUser object.
    Raises HTTPException(403) for suspended users.
    """
    sub = claims.get("sub", "")
    email = claims.get("email", "")
    display_name = claims.get("name") or claims.get("display_name") or email
    provider_type = idp_config.provider_type
    group_role_map: dict = idp_config.group_role_map or {}
    now = datetime.now(timezone.utc)

    # Determine role from IdP groups
    groups = _extract_groups_from_claims(claims)
    new_role = _resolve_role_from_groups(groups, group_role_map, default_role="viewer")

    # Look up existing user
    result = await db.execute(
        select(SoulUser).where(
            SoulUser.tenant_id == tenant_id,
            SoulUser.idp_provider == provider_type,
            SoulUser.idp_sub == sub,
        )
    )
    user = result.scalar_one_or_none()

    if user is None:
        # JIT create
        logger.info(
            "jit.creating_user",
            tenant_id=str(tenant_id),
            email=email,
            provider=provider_type,
            role=new_role,
        )
        user = SoulUser(
            tenant_id=tenant_id,
            email=email,
            display_name=display_name,
            admin_role=new_role,
            idp_sub=sub,
            idp_provider=provider_type,
            status="active",
            last_login=now,
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)
    else:
        # Check suspension
        if user.status == "suspended":
            logger.warning(
                "jit.user_suspended",
                user_id=str(user.id),
                email=email,
            )
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "account_suspended",
                    "message": "Your account has been suspended. Contact your administrator.",
                },
            )
        if user.status == "deactivated":
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "account_deactivated",
                    "message": "Your account has been deactivated.",
                },
            )

        # Update user attributes
        await db.execute(
            update(SoulUser)
            .where(SoulUser.id == user.id)
            .values(
                last_login=now,
                display_name=display_name,
                admin_role=new_role if group_role_map else user.admin_role,
                updated_at=now,
            )
        )
        user.last_login = now
        user.display_name = display_name
        if group_role_map:
            user.admin_role = new_role

        logger.info(
            "jit.updated_user",
            user_id=str(user.id),
            email=email,
            role=user.admin_role,
        )

    return user
